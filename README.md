# WebRoom V0 — Decentralized Online Presence Prototype

WebRoom treats every webpage URL as a virtual room. When multiple users open the same webpage, they automatically become members of that room.

**V0 Prototype Scope:** Real-time decentralized peer presence. Shows how many users are currently online on the exact same webpage with zero servers or databases.

---

## 🏛️ Architecture

WebRoom is designed from the ground up as a **fully decentralized peer network**. There is no central server, Node.js backend, WebSocket server, cloud database, or popup UI overhead. Presence is rendered as an isolated floating widget directly on webpage contexts.

```
                    ┌─────────────────────────┐
                    │     Current Webpage     │
                    │   (window.location.href)│
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Canonicalize & SHA-256 │
                    │      Room ID Hash       │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Presence Manager      │
                    │  (Heartbeat & Timeouts) │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    Transport Interface  │
                    │   (Swappable P2P Layer) │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ BroadcastChannel (V0)   │
                    │   webroom:<room_id>     │
                    │  (Future: WebRTC / P2P) │
                    └─────────────────────────┘
```

### Clean Modular Structure

```
src/
├── background.ts             # Extension background service worker
├── content/
│   ├── index.tsx             # Content script entry (Shadow DOM injection)
│   └── url-listener.ts       # SPA & standard navigation detector
├── room/
│   ├── room-id.ts            # Canonical URL normalizer & SHA-256 hash
│   ├── room-id.test.ts       # Room ID unit tests
│   ├── room.ts               # Room lifecycle coordinator
│   └── room.test.ts          # Room multi-peer integration tests
├── presence/
│   ├── protocol.ts           # PresenceMessage protocol & runtime validators
│   ├── peer-store.ts         # In-memory peer tracking & eviction
│   ├── presence.ts           # PresenceManager (discovery, heartbeat, timeouts)
│   └── presence.test.ts      # Presence unit tests
├── transport/
│   ├── transport.ts          # Pluggable Transport interface
│   └── broadcast-channel.ts  # BroadcastChannel transport implementation
├── ui/
│   ├── WebRoomIndicator.tsx  # Sleek modern floating pill widget
│   └── indicator-styles.ts   # Scoped Shadow DOM styles (Linear/Raycast dark theme)
└── shared/
    ├── constants.ts          # Centralized intervals, timeouts, and APP_VERSION
    └── version.test.ts       # Strict SemVer & Manifest version validation tests
```

---

## 🏷️ Strict Versioning

WebRoom strictly adheres to [Semantic Versioning (SemVer 2.0.0)](https://semver.org/) and Chrome Extension Manifest version requirements:

* **Current Version:** `0.1.0` (V0 Prototype)
* **Build Validation:** `vite.config.ts` automatically runs runtime regex checks ensuring versions match both SemVer (`MAJOR.MINOR.PATCH`) and Chrome's 1-4 dot-separated integer specification.

---

## ⚙️ Presence Protocol

Every browser context receives a temporary, ephemeral `peerId` (`peer_<uuid>`).

### Message Types

| Message Type | Direction | Description |
| :--- | :--- | :--- |
| `HELLO` | Broadcast | Sent immediately when a tab joins a room. |
| `HEARTBEAT` | Broadcast / Reply | Sent every 2s, or immediately in response to `HELLO`. |
| `GOODBYE` | Broadcast | Sent on tab close / navigation departure. |

### Inactivity & Timeout

* **Heartbeat Interval:** `2000ms` (2 seconds)
* **Peer Timeout:** `6000ms` (6 seconds without heartbeat triggers automatic eviction)
* **Cleanup Scan:** `1000ms` (1 second)

---

## 🚀 Installation & Local Testing

### Prerequisites

* [Bun](https://bun.sh) (or Node.js 18+)

### 1. Build the Extension

```bash
# Install dependencies
bun install

# Run unit and integration tests (20 tests)
bun test

# Build production extension package
bun run build
```

The compiled extension is output to the `dist/` directory.

### 2. Load into Chrome / Edge / Brave

1. Open Chrome and navigate to: `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `dist/` folder from this project directory.
5. The **WebRoom** extension is now installed!

---

## 🧪 Testing Scenarios

### Test 1: Single Tab
1. Open `https://example.com` in a browser tab.
2. The bottom-right floating indicator displays: `👥 1`.

### Test 2: Two Tabs in Same Room
1. Open `https://example.com` in a second tab or window.
2. Both tabs immediately update to: `👥 2`.

### Test 3: Three Tabs
1. Open `https://example.com` in a third tab.
2. All three tabs update to: `👥 3`.

### Test 4: Tab Closure / Timeout
1. Close Tab 3.
2. Tab 3 sends `GOODBYE` (or times out after 6 seconds).
3. Remaining tabs update back to: `👥 2`.

### Test 5: Distinct Rooms (URL Isolation)
1. In Tab A, open `https://example.com/page-1` -> `👥 1`.
2. In Tab B, open `https://example.com/page-2` -> `👥 1`.
3. They are in separate rooms and do not see each other.

### Test 6: Tracking Parameters Canonicalization
1. Open `https://example.com/article?id=123&utm_source=twitter&fbclid=XYZ`.
2. Open `https://example.com/article?id=123` in another tab.
3. Both resolve to the same canonical room ID and show `👥 2`.

---

## 🔮 Future Roadmap (Beyond V0)

1. **WebRTCTransport**: Swap `BroadcastChannelTransport` with WebRTC DataChannels for global peer connectivity.
2. **P2P Ephemeral Chat**: URL-scoped peer-to-peer text messaging.
3. **Collaborative Cursors & Presence**: Real-time cursor coordinates and presence halos.
