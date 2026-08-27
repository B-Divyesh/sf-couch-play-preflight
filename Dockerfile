FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY frontend ./frontend
RUN npm run build

FROM rust:1.85-alpine AS server
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY server ./server
RUN cargo build --manifest-path server/Cargo.toml --release

FROM alpine:3.21
RUN apk add --no-cache ca-certificates && addgroup -S roomready && adduser -S roomready -G roomready
WORKDIR /app
COPY --from=server /app/server/target/release/room-ready-server /usr/local/bin/room-ready-server
COPY --from=web /app/dist ./dist
RUN mkdir /data && chown roomready:roomready /data
USER roomready
ENV PORT=8080 DATABASE_URL=sqlite:///data/room-ready.db?mode=rwc DIST_DIR=/app/dist
EXPOSE 8080
CMD ["room-ready-server"]
