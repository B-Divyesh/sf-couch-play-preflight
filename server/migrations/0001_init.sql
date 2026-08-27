CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    host_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    game_label TEXT NOT NULL DEFAULT '',
    accepted_inputs TEXT NOT NULL DEFAULT 'touch,keyboard,gamepad',
    display_ready INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    player_token TEXT NOT NULL,
    name TEXT NOT NULL,
    input_kind TEXT NOT NULL,
    browser_ok INTEGER NOT NULL DEFAULT 0,
    input_ok INTEGER NOT NULL DEFAULT 0,
    network_ok INTEGER NOT NULL DEFAULT 0,
    practice_ok INTEGER NOT NULL DEFAULT 0,
    screen_awake INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
