FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY frontend ./frontend
RUN npm run build

# Rust 1.88 is the minimum toolchain required by the locked ICU/idna graph.
FROM rust:1.88-alpine AS server
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY server ./server
RUN cargo build --locked --manifest-path server/Cargo.toml --release

FROM alpine:3.21
RUN apk add --no-cache ca-certificates && addgroup -S roomready && adduser -S roomready -G roomready
WORKDIR /app
COPY --from=server /app/server/target/release/room-ready-server /usr/local/bin/room-ready-server
COPY --from=web /app/dist ./dist
RUN mkdir /data && chown roomready:roomready /data
USER roomready
ARG BUILD_SHA=57ee656f0fd9e84816107f33381c5f3e5f7ded64
ENV PORT=8080 DATABASE_URL=sqlite:///data/room-ready.db?mode=rwc DIST_DIR=/app/dist BUILD_SHA=$BUILD_SHA
EXPOSE 8080
CMD ["room-ready-server"]
