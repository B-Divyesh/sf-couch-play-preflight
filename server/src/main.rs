use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Path, State},
    http::{header, HeaderMap, HeaderValue, Request, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::{get, post, put},
    Json, Router,
};
use chrono::{Duration, Utc};
use rand::{distributions::Alphanumeric, rngs::OsRng, seq::SliceRandom, Rng, RngCore};
use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    FromRow, Row, SqlitePool,
};
use std::{
    env, fs,
    net::{IpAddr, SocketAddr},
    path::{Path as FsPath, PathBuf},
    str::FromStr,
    sync::Arc,
    time::Duration as StdDuration,
};
use tower_governor::{
    errors::GovernorError, governor::GovernorConfigBuilder, key_extractor::SmartIpKeyExtractor,
    GovernorLayer,
};
use tower_http::{
    compression::CompressionLayer,
    services::{ServeDir, ServeFile},
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};
use tracing::info;
use uuid::Uuid;

const MAX_GUESTS: i64 = 12;

#[derive(Clone)]
struct AppState {
    db: SqlitePool,
    build_sha: String,
    network_key: [u8; 32],
}

#[derive(Debug, Serialize, FromRow)]
struct RoomRow {
    code: String,
    created_at: String,
    expires_at: String,
    game_label: String,
    accepted_inputs: String,
    display_ready: bool,
}

#[derive(Debug, Serialize, FromRow)]
struct PlayerRow {
    id: String,
    name: String,
    input_kind: String,
    browser_ok: bool,
    input_ok: bool,
    network_ok: bool,
    practice_ok: bool,
    screen_awake: bool,
    note: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct RoomSnapshot {
    room: RoomRow,
    players: Vec<PlayerRow>,
}

#[derive(Debug, Deserialize)]
struct CreateRoom {
    game_label: Option<String>,
    discoverable: Option<bool>,
}

#[derive(Debug, Serialize)]
struct CreatedRoom {
    code: String,
    host_token: String,
    expires_at: String,
}

#[derive(Debug, Deserialize)]
struct JoinRoom {
    name: String,
    input_kind: String,
}

#[derive(Debug, Serialize)]
struct JoinedRoom {
    player_id: String,
    player_token: String,
}

#[derive(Debug, Serialize, FromRow)]
struct DiscoveredRoom {
    code: String,
    game_label: String,
}

#[derive(Debug, Serialize)]
struct NetworkCheck {
    same_network: bool,
}

#[derive(Debug, Deserialize)]
struct UpdatePlayer {
    player_token: String,
    browser_ok: bool,
    input_ok: bool,
    network_ok: bool,
    practice_ok: bool,
    screen_awake: bool,
    note: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateRoom {
    host_token: String,
    game_label: String,
    accepted_inputs: Vec<String>,
    display_ready: bool,
}

#[derive(Debug, Deserialize)]
struct HostAuth {
    host_token: String,
}

#[derive(Debug, Serialize)]
struct Health {
    status: &'static str,
    build_sha: String,
}

#[derive(Debug)]
struct ApiError(StatusCode, &'static str);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(serde_json::json!({ "error": self.1 }))).into_response()
    }
}

#[tokio::main]
async fn main() {
    if env::args().nth(1).as_deref() == Some("--version") {
        println!("{}", build_sha());
        return;
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .json()
        .init();

    let (database_url, database_config) = match env::var("DATABASE_URL") {
        Ok(value) => (value, "supplied"),
        Err(_) => (default_database_url(), "defaulted"),
    };
    // One always-on replica owns this SQLite file. Keeping one pooled
    // connection makes every request observe the same committed room state;
    // the deployment is deliberately constrained to one replica as well.
    let database_options = SqliteConnectOptions::from_str(&database_url)
        .expect("valid database URL")
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Full)
        .busy_timeout(StdDuration::from_secs(30));
    let db = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(database_options)
        .await
        .expect("connect database");
    migrate(&db).await.expect("migrate database");
    let (network_key, network_key_config) = load_network_key().expect("load network match key");
    let state = AppState {
        db,
        build_sha: build_sha().to_owned(),
        network_key,
    };
    let dist = env::var("DIST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| default_dist_dir());
    let app = app(state, dist);
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind port");
    info!(%addr, database_config, network_key_config, storage_topology = "single-replica-single-writer", "Room Ready listening");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown())
    .await
    .expect("serve");
}

fn app(state: AppState, dist: PathBuf) -> Router {
    let index = ServeFile::new(dist.join("index.html"));
    let not_found_html = fs::read_to_string(dist.join("index.html")).unwrap_or_else(|_| {
        "<!doctype html><title>Page not found — Room Ready</title><h1>Page not found</h1>".into()
    });
    let service_worker = ServeFile::new(dist.join("sw.js"));
    let robots = ServeFile::new(dist.join("robots.txt"));
    let sitemap = ServeFile::new(dist.join("sitemap.xml"));
    let governor = Arc::new(
        GovernorConfigBuilder::default()
            .per_millisecond(50)
            .burst_size(40)
            .key_extractor(SmartIpKeyExtractor)
            .error_handler(rate_limit_error)
            .finish()
            .expect("rate limit config"),
    );
    let api = Router::new()
        .route("/rooms", post(create_room))
        .route("/rooms/discover", get(discover_rooms))
        .route(
            "/rooms/:code",
            get(get_room).put(update_room).delete(delete_room),
        )
        .route("/rooms/:code/network", get(check_network))
        .route("/rooms/:code/join", post(join_room))
        .route("/rooms/:code/players/:id", put(update_player))
        .fallback(|| async { ApiError(StatusCode::NOT_FOUND, "API route not found") })
        .layer(GovernorLayer { config: governor });
    Router::new()
        .route("/health", get(health))
        .nest("/api", api)
        .route_service("/sw.js", service_worker)
        .route_service("/robots.txt", robots)
        .route_service("/sitemap.xml", sitemap)
        .nest_service("/assets", ServeDir::new(dist.join("assets")))
        .route_service("/", index.clone())
        .route_service("/demo", index.clone())
        .route_service("/privacy", index.clone())
        .route_service("/terms", index.clone())
        .route_service("/join", index.clone())
        .route_service("/host", index)
        .fallback(move || {
            let html = not_found_html.clone();
            async move { (StatusCode::NOT_FOUND, Html(html)) }
        })
        .layer(middleware::from_fn(cache_hashed_assets))
        .layer(DefaultBodyLimit::max(16 * 1024))
        .layer(SetResponseHeaderLayer::if_not_present(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff")))
        .layer(SetResponseHeaderLayer::if_not_present(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer")))
        .layer(SetResponseHeaderLayer::if_not_present(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY")))
        .layer(SetResponseHeaderLayer::if_not_present(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static("default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")))
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

fn rate_limit_error(error: GovernorError) -> Response {
    match error {
        GovernorError::TooManyRequests { .. } => {
            let mut response = (
                StatusCode::TOO_MANY_REQUESTS,
                Json(serde_json::json!({ "error": "Too many requests; retry in one second" })),
            )
                .into_response();
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, HeaderValue::from_static("1"));
            response
        }
        mut other => other.as_response(),
    }
}

/// Static Vite assets are content-addressed. Cache them for a year without
/// caching the HTML shell or service worker that points at a newer release.
async fn cache_hashed_assets(request: Request<Body>, next: Next) -> Response {
    let is_asset = request.uri().path().starts_with("/assets/");
    let mut response = next.run(request).await;
    if is_asset && response.status().is_success() {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        );
    }
    response
}

fn build_sha() -> &'static str {
    env!("ROOM_READY_BUILD_SHA")
}

fn default_database_url() -> String {
    if FsPath::new("/data").is_dir() {
        "sqlite:///data/room-ready.db?mode=rwc".into()
    } else {
        "sqlite://room-ready.db?mode=rwc".into()
    }
}

fn default_network_key_path() -> PathBuf {
    if FsPath::new("/data").is_dir() {
        PathBuf::from("/data/network-match.key")
    } else {
        PathBuf::from("network-match.key")
    }
}

fn load_network_key() -> std::io::Result<([u8; 32], &'static str)> {
    if let Ok(value) = env::var("NETWORK_HASH_KEY") {
        return Ok((*blake3::hash(value.as_bytes()).as_bytes(), "supplied"));
    }
    let path = default_network_key_path();
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(key) = <[u8; 32]>::try_from(bytes.as_slice()) {
            return Ok((key, "loaded"));
        }
    }
    let mut key = [0_u8; 32];
    OsRng.fill_bytes(&mut key);
    fs::write(path, key)?;
    Ok((key, "generated"))
}

fn default_dist_dir() -> PathBuf {
    if FsPath::new("/app/dist").is_dir() {
        PathBuf::from("/app/dist")
    } else {
        PathBuf::from("dist")
    }
}

async fn migrate(db: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("PRAGMA foreign_keys = ON").execute(db).await?;
    sqlx::raw_sql(include_str!("../migrations/0001_init.sql"))
        .execute(db)
        .await?;
    let columns = sqlx::query("PRAGMA table_info(rooms)")
        .fetch_all(db)
        .await?;
    let names: Vec<String> = columns.iter().map(|row| row.get("name")).collect();
    if !names.iter().any(|name| name == "network_id") {
        sqlx::query("ALTER TABLE rooms ADD COLUMN network_id TEXT NOT NULL DEFAULT ''")
            .execute(db)
            .await?;
    }
    if !names.iter().any(|name| name == "discoverable") {
        sqlx::query("ALTER TABLE rooms ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 1")
            .execute(db)
            .await?;
    }
    Ok(())
}

fn client_network(headers: &HeaderMap) -> String {
    let raw = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|value| value.to_str().ok())
        })
        .unwrap_or("local");
    match raw.parse::<IpAddr>() {
        Ok(IpAddr::V4(address)) => address.to_string(),
        Ok(IpAddr::V6(address)) => {
            let segments = address.segments();
            format!(
                "{:x}:{:x}:{:x}:{:x}::/64",
                segments[0], segments[1], segments[2], segments[3]
            )
        }
        Err(_) => "unknown".into(),
    }
}

fn network_id(headers: &HeaderMap, key: &[u8; 32]) -> String {
    blake3::keyed_hash(key, client_network(headers).as_bytes())
        .to_hex()
        .to_string()
}

async fn health(State(state): State<AppState>) -> Json<Health> {
    Json(Health {
        status: "ok",
        build_sha: state.build_sha,
    })
}

async fn create_room(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateRoom>,
) -> Result<Json<CreatedRoom>, ApiError> {
    cleanup(&state.db).await;
    let mut code = String::new();
    let alphabet: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ".chars().collect();
    for _ in 0..8 {
        code = (0..4)
            .map(|_| *alphabet.choose(&mut rand::thread_rng()).unwrap())
            .collect();
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rooms WHERE code = ?")
            .bind(&code)
            .fetch_one(&state.db)
            .await
            .map_err(db_error)?;
        if exists == 0 {
            break;
        }
    }
    let host_token: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(40)
        .map(char::from)
        .collect();
    let now = Utc::now();
    let expires = now + Duration::hours(6);
    let game = clean_text(input.game_label.unwrap_or_default(), 60)?;
    let network = network_id(&headers, &state.network_key);
    sqlx::query("INSERT INTO rooms (code, host_token, created_at, expires_at, game_label, network_id, discoverable) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&code).bind(&host_token).bind(now.to_rfc3339()).bind(expires.to_rfc3339()).bind(game).bind(network).bind(input.discoverable.unwrap_or(true))
        .execute(&state.db).await.map_err(db_error)?;
    Ok(Json(CreatedRoom {
        code,
        host_token,
        expires_at: expires.to_rfc3339(),
    }))
}

async fn discover_rooms(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<DiscoveredRoom>>, ApiError> {
    cleanup(&state.db).await;
    let rooms = sqlx::query_as::<_, DiscoveredRoom>(
        "SELECT code, game_label FROM rooms WHERE network_id = ? AND discoverable = 1 AND expires_at > ? ORDER BY created_at DESC LIMIT 8",
    )
    .bind(network_id(&headers, &state.network_key))
    .bind(Utc::now().to_rfc3339())
    .fetch_all(&state.db)
    .await
    .map_err(db_error)?;
    Ok(Json(rooms))
}

async fn check_network(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
) -> Result<Json<NetworkCheck>, ApiError> {
    let code = valid_code(code)?;
    let host_network: String =
        sqlx::query_scalar("SELECT network_id FROM rooms WHERE code = ? AND expires_at > ?")
            .bind(code)
            .bind(Utc::now().to_rfc3339())
            .fetch_optional(&state.db)
            .await
            .map_err(db_error)?
            .ok_or(ApiError(StatusCode::NOT_FOUND, "Room not found or expired"))?;
    Ok(Json(NetworkCheck {
        same_network: host_network == network_id(&headers, &state.network_key),
    }))
}

async fn get_room(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> Result<Json<RoomSnapshot>, ApiError> {
    let code = valid_code(code)?;
    let room = sqlx::query_as::<_, RoomRow>("SELECT code, created_at, expires_at, game_label, accepted_inputs, display_ready FROM rooms WHERE code = ? AND expires_at > ?")
        .bind(&code).bind(Utc::now().to_rfc3339()).fetch_optional(&state.db).await.map_err(db_error)?.ok_or(ApiError(StatusCode::NOT_FOUND, "Room not found or expired"))?;
    let players = sqlx::query_as::<_, PlayerRow>("SELECT id, name, input_kind, browser_ok, input_ok, network_ok, practice_ok, screen_awake, note, updated_at FROM players WHERE room_code = ? ORDER BY updated_at")
        .bind(&code).fetch_all(&state.db).await.map_err(db_error)?;
    Ok(Json(RoomSnapshot { room, players }))
}

async fn join_room(
    State(state): State<AppState>,
    Path(code): Path<String>,
    Json(input): Json<JoinRoom>,
) -> Result<Json<JoinedRoom>, ApiError> {
    let code = valid_code(code)?;
    let name = clean_text(input.name, 28)?;
    if name.is_empty() {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Enter a name"));
    }
    if !["touch", "keyboard", "gamepad"].contains(&input.input_kind.as_str()) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Choose a supported input type",
        ));
    }

    // Reserve SQLite's write lock before checking occupancy. Without an
    // immediate transaction, parallel requests can all observe the same count
    // and then insert after the limit check has already passed.
    let mut transaction = state
        .db
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(db_error)?;
    let exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM rooms WHERE code = ? AND expires_at > ?")
            .bind(&code)
            .bind(Utc::now().to_rfc3339())
            .fetch_one(&mut *transaction)
            .await
            .map_err(db_error)?;
    if exists == 0 {
        transaction.rollback().await.map_err(db_error)?;
        return Err(ApiError(StatusCode::NOT_FOUND, "Room not found or expired"));
    }
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM players WHERE room_code = ?")
        .bind(&code)
        .fetch_one(&mut *transaction)
        .await
        .map_err(db_error)?;
    if count >= MAX_GUESTS {
        transaction.rollback().await.map_err(db_error)?;
        return Err(ApiError(
            StatusCode::CONFLICT,
            "This room already has 12 guests",
        ));
    }
    let player_id = Uuid::new_v4().to_string();
    let player_token: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(36)
        .map(char::from)
        .collect();
    sqlx::query("INSERT INTO players (id, room_code, player_token, name, input_kind, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&player_id).bind(&code).bind(&player_token).bind(name).bind(input.input_kind).bind(Utc::now().to_rfc3339())
        .execute(&mut *transaction).await.map_err(db_error)?;
    transaction.commit().await.map_err(db_error)?;
    Ok(Json(JoinedRoom {
        player_id,
        player_token,
    }))
}

async fn update_player(
    State(state): State<AppState>,
    Path((code, id)): Path<(String, String)>,
    Json(input): Json<UpdatePlayer>,
) -> Result<StatusCode, ApiError> {
    let code = valid_code(code)?;
    let note = clean_text(input.note.unwrap_or_default(), 100)?;
    let result = sqlx::query("UPDATE players SET browser_ok=?, input_ok=?, network_ok=?, practice_ok=?, screen_awake=?, note=?, updated_at=? WHERE id=? AND room_code=? AND player_token=?")
        .bind(input.browser_ok).bind(input.input_ok).bind(input.network_ok).bind(input.practice_ok).bind(input.screen_awake).bind(note).bind(Utc::now().to_rfc3339()).bind(id).bind(code).bind(input.player_token)
        .execute(&state.db).await.map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Guest update was not authorized",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn update_room(
    State(state): State<AppState>,
    Path(code): Path<String>,
    Json(input): Json<UpdateRoom>,
) -> Result<StatusCode, ApiError> {
    let code = valid_code(code)?;
    let game = clean_text(input.game_label, 60)?;
    let allowed = ["touch", "keyboard", "gamepad"];
    if input.accepted_inputs.is_empty()
        || input
            .accepted_inputs
            .iter()
            .any(|i| !allowed.contains(&i.as_str()))
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Select at least one valid input type",
        ));
    }
    let inputs = input.accepted_inputs.join(",");
    let result = sqlx::query("UPDATE rooms SET game_label=?, accepted_inputs=?, display_ready=? WHERE code=? AND host_token=?")
        .bind(game).bind(inputs).bind(input.display_ready).bind(code).bind(input.host_token).execute(&state.db).await.map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Host update was not authorized",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_room(
    State(state): State<AppState>,
    Path(code): Path<String>,
    Json(input): Json<HostAuth>,
) -> Result<StatusCode, ApiError> {
    let code = valid_code(code)?;
    let result = sqlx::query("DELETE FROM rooms WHERE code=? AND host_token=?")
        .bind(code)
        .bind(input.host_token)
        .execute(&state.db)
        .await
        .map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Room close was not authorized",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

fn valid_code(value: String) -> Result<String, ApiError> {
    let code = value.trim().to_ascii_uppercase();
    if code.len() == 4 && code.chars().all(|c| c.is_ascii_uppercase()) {
        Ok(code)
    } else {
        Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Room codes are four letters",
        ))
    }
}

fn clean_text(value: String, max: usize) -> Result<String, ApiError> {
    let text = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.chars().count() > max || text.chars().any(char::is_control) {
        Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Text is too long or contains unsupported characters",
        ))
    } else {
        Ok(text)
    }
}

fn db_error(error: sqlx::Error) -> ApiError {
    tracing::error!(%error, "database request failed");
    ApiError(
        StatusCode::INTERNAL_SERVER_ERROR,
        "The room service had a problem; try again",
    )
}

async fn cleanup(db: &SqlitePool) {
    let _ = sqlx::query("DELETE FROM rooms WHERE expires_at <= ?")
        .bind(Utc::now().to_rfc3339())
        .execute(db)
        .await;
}

async fn shutdown() {
    let ctrl_c = async { tokio::signal::ctrl_c().await.expect("ctrl-c handler") };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("signal handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use tower::ServiceExt;

    fn test_state(db: SqlitePool) -> AppState {
        AppState {
            db,
            build_sha: "test".into(),
            network_key: [7; 32],
        }
    }

    fn headers_for(address: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", address.parse().unwrap());
        headers
    }

    #[test]
    fn room_code_validation_is_strict() {
        assert_eq!(valid_code(" abcd ".into()).unwrap(), "ABCD");
        assert!(valid_code("A1CD".into()).is_err());
        assert!(valid_code("ABC".into()).is_err());
    }

    #[test]
    fn text_is_normalized_and_bounded() {
        assert_eq!(
            clean_text("  Family   night ".into(), 20).unwrap(),
            "Family night"
        );
        assert!(clean_text("way too long".into(), 4).is_err());
    }

    #[tokio::test]
    async fn room_lifecycle_round_trip() {
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate(&db).await.unwrap();
        let state = test_state(db);
        let created = create_room(
            State(state.clone()),
            headers_for("203.0.113.4"),
            Json(CreateRoom {
                game_label: Some("Test game".into()),
                discoverable: Some(true),
            }),
        )
        .await
        .unwrap()
        .0;
        let joined = join_room(
            State(state.clone()),
            Path(created.code.clone()),
            Json(JoinRoom {
                name: "Sam".into(),
                input_kind: "touch".into(),
            }),
        )
        .await
        .unwrap()
        .0;
        update_player(
            State(state.clone()),
            Path((created.code.clone(), joined.player_id)),
            Json(UpdatePlayer {
                player_token: joined.player_token,
                browser_ok: true,
                input_ok: true,
                network_ok: true,
                practice_ok: true,
                screen_awake: false,
                note: None,
            }),
        )
        .await
        .unwrap();
        update_room(
            State(state.clone()),
            Path(created.code.clone()),
            Json(UpdateRoom {
                host_token: created.host_token.clone(),
                game_label: "Test game".into(),
                accepted_inputs: vec!["touch".into()],
                display_ready: true,
            }),
        )
        .await
        .unwrap();
        let snapshot = get_room(State(state.clone()), Path(created.code.clone()))
            .await
            .unwrap()
            .0;
        assert_eq!(snapshot.room.game_label, "Test game");
        assert_eq!(snapshot.players.len(), 1);
        assert!(snapshot.players[0].practice_ok);
        delete_room(
            State(state.clone()),
            Path(created.code.clone()),
            Json(HostAuth {
                host_token: created.host_token,
            }),
        )
        .await
        .unwrap();
        assert!(get_room(State(state), Path(created.code)).await.is_err());
    }

    #[tokio::test]
    async fn room_created_by_one_connection_is_immediately_readable_by_another() {
        let path = std::env::temp_dir().join(format!("room-ready-{}.db", Uuid::new_v4()));
        let url = format!("sqlite://{}?mode=rwc", path.display());
        let first = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        migrate(&first).await.unwrap();
        let second = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let host = test_state(first);
        let guest = test_state(second);

        // This is the exact release boundary: POST /api/rooms commits on one
        // request connection and the host's next GET can be served by another.
        // Both must point at the one configured durable SQLite file.
        let created = create_room(
            State(host.clone()),
            headers_for("203.0.113.5"),
            Json(CreateRoom {
                game_label: None,
                discoverable: Some(true),
            }),
        )
        .await
        .unwrap()
        .0;
        assert_eq!(
            get_room(State(guest.clone()), Path(created.code.clone()))
                .await
                .unwrap()
                .0
                .room
                .code,
            created.code
        );
        let _ = join_room(
            State(guest),
            Path(created.code.clone()),
            Json(JoinRoom {
                name: "Sam".into(),
                input_kind: "touch".into(),
            }),
        )
        .await
        .unwrap();
        assert_eq!(
            get_room(State(host), Path(created.code))
                .await
                .unwrap()
                .0
                .players
                .len(),
            1
        );

        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn discovery_and_network_check_match_only_the_host_network() {
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate(&db).await.unwrap();
        let state = test_state(db);
        let same_network = headers_for("203.0.113.8");
        let other_network = headers_for("203.0.113.9");
        let visible = create_room(
            State(state.clone()),
            same_network.clone(),
            Json(CreateRoom {
                game_label: Some("Living room quiz".into()),
                discoverable: Some(true),
            }),
        )
        .await
        .unwrap()
        .0;
        let hidden = create_room(
            State(state.clone()),
            same_network.clone(),
            Json(CreateRoom {
                game_label: Some("Private setup".into()),
                discoverable: Some(false),
            }),
        )
        .await
        .unwrap()
        .0;

        let found = discover_rooms(State(state.clone()), same_network.clone())
            .await
            .unwrap()
            .0;
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].code, visible.code);
        assert!(discover_rooms(State(state.clone()), other_network.clone())
            .await
            .unwrap()
            .0
            .is_empty());
        assert!(
            check_network(
                State(state.clone()),
                Path(visible.code.clone()),
                same_network,
            )
            .await
            .unwrap()
            .0
            .same_network
        );
        assert!(
            !check_network(State(state), Path(hidden.code), other_network)
                .await
                .unwrap()
                .0
                .same_network
        );
    }

    #[tokio::test]
    async fn parallel_joins_never_exceed_the_room_guest_limit() {
        let path = std::env::temp_dir().join(format!("room-ready-capacity-{}.db", Uuid::new_v4()));
        let database_options =
            SqliteConnectOptions::from_str(&format!("sqlite://{}?mode=rwc", path.display()))
                .unwrap()
                .create_if_missing(true)
                .busy_timeout(StdDuration::from_secs(5));
        let db = SqlitePoolOptions::new()
            .max_connections(8)
            .connect_with(database_options)
            .await
            .unwrap();
        migrate(&db).await.unwrap();
        let state = test_state(db);
        let created = create_room(
            State(state.clone()),
            headers_for("203.0.113.6"),
            Json(CreateRoom {
                game_label: Some("Parallel join test".into()),
                discoverable: Some(true),
            }),
        )
        .await
        .unwrap()
        .0;
        let mut joins = tokio::task::JoinSet::new();

        for index in 0..24 {
            let state = state.clone();
            let code = created.code.clone();
            joins.spawn(async move {
                join_room(
                    State(state),
                    Path(code),
                    Json(JoinRoom {
                        name: format!("Guest {}", index + 1),
                        input_kind: "touch".into(),
                    }),
                )
                .await
                .map(|_| StatusCode::OK)
                .unwrap_or_else(|error| error.0)
            });
        }

        let mut accepted = 0;
        let mut full = 0;
        while let Some(result) = joins.join_next().await {
            match result.unwrap() {
                StatusCode::OK => accepted += 1,
                StatusCode::CONFLICT => full += 1,
                status => panic!("parallel join returned unexpected status {status}"),
            }
        }

        let snapshot = get_room(State(state.clone()), Path(created.code))
            .await
            .unwrap()
            .0;
        assert_eq!(accepted, MAX_GUESTS);
        assert_eq!(full, 24 - MAX_GUESTS);
        assert_eq!(snapshot.players.len() as i64, MAX_GUESTS);

        state.db.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn successful_hashed_assets_are_immutable_but_html_is_not() {
        let dist = std::env::temp_dir().join(format!("room-ready-dist-{}", Uuid::new_v4()));
        std::fs::create_dir_all(dist.join("assets")).unwrap();
        std::fs::write(
            dist.join("index.html"),
            "<!doctype html><title>Room Ready</title>",
        )
        .unwrap();
        std::fs::write(dist.join("assets/index-a1b2c3.js"), "export {};").unwrap();
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate(&db).await.unwrap();
        let router = app(test_state(db), dist.clone());

        let asset = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/assets/index-a1b2c3.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            asset.headers().get(header::CACHE_CONTROL).unwrap(),
            "public, max-age=31536000, immutable"
        );
        assert_eq!(
            to_bytes(asset.into_body(), usize::MAX).await.unwrap(),
            "export {};"
        );
        let html = router
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert!(html.headers().get(header::CACHE_CONTROL).is_none());

        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate(&db).await.unwrap();
        let routes = app(test_state(db), dist.clone());
        let demo = routes
            .clone()
            .oneshot(Request::builder().uri("/demo").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(demo.status(), StatusCode::OK);
        let missing = routes
            .oneshot(
                Request::builder()
                    .uri("/not-a-real-route")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);

        let _ = std::fs::remove_dir_all(dist);
    }

    #[test]
    fn build_identity_is_embedded_and_not_a_runtime_override() {
        assert!(!build_sha().is_empty());
        assert_eq!(build_sha(), env!("ROOM_READY_BUILD_SHA"));
    }
}
