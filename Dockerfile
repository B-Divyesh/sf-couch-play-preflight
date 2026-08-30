FROM node:22-alpine AS web
WORKDIR /app
ARG BUILD_SHA=development
ARG GIT_SHA=
ARG SOURCE_COMMIT=
COPY package.json package-lock.json* ./
RUN npm ci
COPY frontend ./frontend
COPY scripts ./scripts
RUN RELEASE_SHA="$BUILD_SHA"; \
    if [ -z "$RELEASE_SHA" ] || [ "$RELEASE_SHA" = "development" ]; then RELEASE_SHA="$GIT_SHA"; fi; \
    if [ -z "$RELEASE_SHA" ] || [ "$RELEASE_SHA" = "development" ]; then RELEASE_SHA="$SOURCE_COMMIT"; fi; \
    BUILD_SHA="$RELEASE_SHA" npm run build

# Track current stable Rust so the locked dependency graph remains buildable.
FROM rust:1-alpine AS server
RUN apk add --no-cache musl-dev
WORKDIR /app
ARG BUILD_SHA=development
ARG GIT_SHA=
ARG SOURCE_COMMIT=
COPY server ./server
# Factory builds supply all three identity args. Accept each documented name,
# compile the first non-placeholder revision into the binary, and prove the
# resulting executable reports that exact value before the image can publish.
RUN RELEASE_SHA="$BUILD_SHA"; \
    if [ -z "$RELEASE_SHA" ] || [ "$RELEASE_SHA" = "development" ]; then RELEASE_SHA="$GIT_SHA"; fi; \
    if [ -z "$RELEASE_SHA" ] || [ "$RELEASE_SHA" = "development" ]; then RELEASE_SHA="$SOURCE_COMMIT"; fi; \
    if [ -z "$RELEASE_SHA" ]; then RELEASE_SHA="development"; fi; \
    BUILD_SHA="$RELEASE_SHA" cargo build --locked --manifest-path server/Cargo.toml --release; \
    test "$(server/target/release/room-ready-server --version)" = "$RELEASE_SHA"

FROM alpine:3.21
RUN apk add --no-cache ca-certificates && addgroup -S roomready && adduser -S roomready -G roomready
WORKDIR /app
COPY --from=server /app/server/target/release/room-ready-server /usr/local/bin/room-ready-server
COPY --from=web /app/dist ./dist
RUN mkdir /data && chown roomready:roomready /data
USER roomready
ENV PORT=8080
EXPOSE 8080
CMD ["room-ready-server"]
