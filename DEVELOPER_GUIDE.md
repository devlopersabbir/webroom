# WebRoom Developer Guide

Welcome to the internal engineering guide for **WebRoom**. This document explains the architecture, directory layout, multi-peer testing workflows, and best practices for developing on WebRoom.

---

## 🏛️ System Architecture

WebRoom transforms any visited webpage into a real-time decentralized room without relying on a centralized database or chat server.

```text
┌─────────────────────────────────────────────────────────────────┐
│                       Browser Web Page                          │
│                                                                 │
│  ┌──────────────────────┐        ┌───────────────────────────┐  │
│  │   Floating Pill /    │◄──────►│       WebRoomPanel        │  │
│  │   Presence Counter   │        │ (Chat, Voice, Follow, UI) │  │
│  └──────────────────────┘        └───────────────────────────┘  │
│                            ▲                                    │
│                            │ (DOM Events / State)               │
│                            ▼                                    │
│                  ┌───────────────────┐                          │
│                  │   RoomManager     │                          │
│                  └───────────────────┘                          │
│                            ▲                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │ (Extension Message Bridge)
┌────────────────────────────┼────────────────────────────────────┐
│ Background Layer           ▼                                    │
│                  ┌───────────────────┐                          │
│                  │  TrysteroTransport│                          │
│                  └───────────────────┘                          │
│                            ▲                                    │
│                            │                                    │
│        ┌───────────────────┼───────────────────┐                │
│        ▼                   ▼                   ▼                │
│ ┌──────────────┐   ┌──────────────┐    ┌───────────────┐        │
│ │ NodeIdentity │   │  Membership  │    │  RoleManager  │        │
│ │  (Ed25519)   │   │  (Liveness)  │    │ (Coordinator) │        │
│ └──────────────┘   └──────────────┘    └───────────────┘        │
│                            ▲                                    │
│                            ▼                                    │
│                ┌───────────────────────┐                        │
│                │   MediaRoutingLayer   │                        │
│                │ (Direct / Relay Mesh) │                        │
│                └───────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📂 Codebase Directory Layout

| Directory | Purpose |
| :--- | :--- |
| `src/content/` | Content script entry (`index.tsx`) injected into web pages. Renders floating badges and interactive panels. |
| `src/background/` | Background script / service worker (`index.ts`) handling transports, relay bridges, and storage persistence. |
| `src/options/` | Standalone `OptionsApp` dashboard (`src/options/OptionsApp.tsx`) for telemetry, node health, and contribution limits. |
| `src/room/` | High-level `Room` orchestration coordinating identity, presence, chat, voice, and file transfer. |
| `src/identity/` | Cryptographic node identity (`node-identity.ts`) providing public keys and verifiable message signatures. |
| `src/membership/` | Distributed node discovery, signed heartbeat gossip, and node liveness tracking (`membership-manager.ts`). |
| `src/roles/` | Deterministic coordinator election, standby node assignment, and sticky role protocol (`role-manager.ts`). |
| `src/routing/` | Adaptive media routing layer (`media-routing-layer.ts`) switching between direct P2P mesh and bounded relay trees. |
| `src/resources/` | User-configurable relay slot budgets and CPU/bandwidth contribution toggles (`resource-manager.ts`). |
| `src/voice/` | WebRTC multi-party voice signaling, microphone acquisition, and peer audio stream playback. |
| `src/follow/` | Shared scrolling, viewport following, and real-time cursor broadcast synchronization. |
| `src/file-transfer/` | Peer-to-peer file transfer engine (`file-transfer-manager.ts`, `file-transfer-protocol.ts`). Implements offer/accept signaling, chunked binary streaming via WebRTC data channels, progress tracking, and anti-spam rate limiting. |
| `src/transport/` | Trystero WebRTC transport wrappers, binary stream support, and fallback broadcast channel bridges. |
| `src/ui/` | Modular React components: `WebRoomPanel`, `ParticipantList`, `SettingsModal`, `SendFileModal`, `IncomingFileModal`, and theme styles. |

---

## 💻 Local Development Workflow

### 1. Starting Watch Mode

Run Vite with live-reload watching source changes:

```bash
# For Chrome (Manifest V3 Service Worker)
bun run dev:chrome

# For Firefox (Manifest V3 Background Scripts)
bun run dev:firefox
```

### 2. Loading the Unpacked Extension

#### Google Chrome / Brave / Edge:
1. Open `chrome://extensions`.
2. Enable **Developer mode** (toggle in top-right corner).
3. Click **Load unpacked**.
4. Select the `./dist` directory (or `./v3.0.0_chrome` if using `make pre`).

#### Mozilla Firefox:
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `dist/manifest.json` (or `./v3.0.0_firefox/manifest.json`).

---

## 🧪 Testing Multi-Peer P2P Locally

WebRoom relies on WebRTC peer-to-peer data channels. To test two or more participants interacting in real time:

1. **Open Two Distinct Browser Profiles**:
   - Option A: Open Google Chrome in normal mode, and open a second Google Chrome instance using a separate Profile or Guest Window.
   - Option B: Open Chrome and Firefox simultaneously.
2. **Navigate to the Same HTTPS URL**:
   - WebRoom rooms are scoped by page URL.
   - Navigate both browser windows to the same URL, e.g.:  
     `https://en.wikipedia.org/wiki/Main_Page` or `https://github.com/devlopersabbir/webroom`.
3. **Verify Connection**:
   - Both browser windows should show the WebRoom indicator with `2 online`.
   - Open the panel and verify bidirectional text chat and cursor synchronization.

> [!NOTE]
> WebRoom requires an `https://` protocol scheme. It intentionally skips internal schemes (`chrome://`, `about:`, `file://`) and plain `http://` for security.

---

## 🛡️ Mozilla AMO & Chrome Web Store Compliance

WebRoom enforces strict compliance rules embedded in build scripts:

1. **Zero Obfuscation for Firefox**:
   In `vite.config.ts`, `minify: false` is enforced when `TARGET=firefox`. This generates clean, human-readable code that passes Mozilla AMO automated and manual security reviews without flags.
2. **DOM Sanitization**:
   Raw `innerHTML` is strictly sanitized using `DOMParser` in `extensionSecuritySanitizerPlugin()` to avoid XSS vulnerabilities.
3. **Manifest Version Pinning**:
   `strict_min_version` is pinned to `"142.0"` in Gecko settings to guarantee compatibility with Mozilla's mandatory `data_collection_permissions`.

---

## ⚙️ Useful Verification Commands

```bash
# Run unit test suite
bun test

# Strict Firefox AMO linting (must report 0 errors, 0 warnings)
bun run lint:firefox

# Build both unpacked preview bundles
make pre
```
