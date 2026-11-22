# WebRoom Relay Server (Go)

High-concurrency, zero-storage WebSocket relay written in Go for WebRoom presence, chat, follow, and WebRTC signaling.

## Highlights

- **High connection density:** 64-way sharded room hub (FNV-1a), compact 1 KB read/write socket buffers, pre-marshaled JSON fan-out, and bounded non-blocking per-client send queues so slow clients never stall a room.
- **Privacy by design:** `roomId` is already a SHA-256 hash of the canonical URL. Zero URLs, zero message storage, zero PII.
- **Direct P2P for heavy media:** Voice audio and binary file transfers still run directly peer-to-peer over WebRTC; the relay only forwards lightweight JSON signaling and presence/chat payloads.
- **Tiny static binary:** Compiles to a single ~10 MB `scratch` Docker image.

## Local Development

```bash
cd relay-server
go mod tidy
go test -race ./...
go run .
```

The server listens on `ws://localhost:8787` by default (health check + live metrics at `http://localhost:8787/health`).

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8787` | Port or host:port to bind |
| `MAX_PEERS_PER_ROOM` | `250` | Maximum simultaneous peers per room |
| `READ_TIMEOUT_SEC` | `70` | Idle read deadline before closing dead sockets |
| `WRITE_TIMEOUT_SEC` | `10` | Per-frame write deadline |
| `PING_INTERVAL_SEC` | `30` | Server WebSocket Ping control frame interval |

## Docker Deployment

```bash
cd relay-server
docker build -t webroom-relay .
docker run -d --name webroom-relay -p 8787:8787 --ulimit nofile=1048576:1048576 webroom-relay
```

Put it behind **Caddy** (automatic HTTPS/WSS) or **Nginx**:

```caddyfile
relay.yourdomain.com {
    reverse_proxy 127.0.0.1:8787
}
```

## Linux Tuning for 100k+ Concurrent Connections

On a Linux VPS, raise file descriptor and socket backlog limits:

```bash
# /etc/sysctl.d/99-webroom-relay.conf
net.core.somaxconn = 65535
net.ipv4.ip_local_port_range = 1024 65535
fs.file-max = 1048576
```

## Connect the Extension

Set `VITE_RELAY_URL` in the root `.env` before building:

```env
VITE_RELAY_URL=wss://relay.yourdomain.com
```

Or test immediately by entering `ws://localhost:8787` in WebRoom's **Options → Relay Server** tab.
