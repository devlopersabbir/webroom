# WebRoom

**WebRoom** is a decentralized browser extension that turns every webpage into a real-time collaboration room. People visiting the same webpage can discover each other, chat, talk over voice, share files, and follow each other's browsing — all directly peer-to-peer, with no central server and no account required.

> **The web page is the room. The people on that page are the participants.**

## Features

- 👥 **Online Presence** — See who is currently on the same webpage in real time.
- 💬 **Real-time Chat** — Send and receive text messages with everyone in the same room.
- 🎙️ **Voice Chat** — Talk to other participants with full WebRTC peer-to-peer audio. No dial-in code. No conference service.
- 📁 **Peer-to-Peer File Transfer** — Send files directly to another participant in the room. Files travel directly browser-to-browser with no upload to any server.
- 👁️ **Follow Mode** — Follow another participant and have your viewport and scroll position stay in sync with theirs in real time.
- 🖱️ **Cursor Sharing** — Broadcast your cursor position so other participants can see where you are on the page.
- 🐸 **Random Emoji Avatars** — Each participant gets a random emoji as their ephemeral identity.
- 🌐 **URL-based Rooms** — Every webpage is its own room. Different URL = different room. No room codes.
- 🔒 **Fully Decentralized** — No WebRoom backend, no database, no accounts, no central chat server. WebRTC and signed peer heartbeats only.
- 🧠 **Cryptographic Node Identity** — Each installation generates a persistent ECDSA keypair. Node IDs are derived from public keys. Signed membership messages prevent identity spoofing.
- ⚡ **Self-Organizing Infrastructure** — In large rooms, volunteer browser nodes automatically act as lightweight audio relays to reduce upstream bandwidth pressure for speakers. Resource contribution is opt-out.
- 🛡️ **Conservative Resource Budget** — Relay contribution is bounded: max 2 relay slots and 500 Kbps upload per node. Users can disable resource sharing at any time with zero impact on their ability to speak and listen.
- 🧹 **Ephemeral Sessions** — No data persists between sessions. When you close the tab, your presence is gone.

## Roadmap

- [x] Online presence
- [x] URL-based rooms
- [x] Random emoji identities
- [x] Real-time text chat
- [x] Floating WebRoom panel
- [x] Participant list
- [x] Peer-to-peer WebRTC transport
- [x] Voice chat
- [x] Cursor sharing
- [x] Follow another participant
- [x] Shared scrolling / page interaction
- [x] Peer-to-peer file sharing
- [x] Voluntary resource contribution (relay mesh)
- [x] Cryptographic node identity
- [x] Deterministic coordinator election
- [ ] Video chat
- [ ] Screen sharing
- [ ] More real-time collaboration features

## Installation

### Chrome

WebRoom is available for Chrome on the Chrome Web Store:

[Chrome Web Store — WebRoom](https://chromewebstore.google.com/)

### Firefox

WebRoom is available for Firefox on Mozilla Add-ons:

[Firefox Add-ons — WebRoom](https://addons.mozilla.org/en-US/firefox/addon/webroom)

### Development (Load Unpacked)

Clone the repository:

```bash
git clone https://github.com/devlopersabbir/webroom.git
cd webroom
```

Install dependencies:

```bash
bun install
```

Build the extension:

```bash
# Chrome
bun run build:chrome

# Firefox
bun run build:firefox
```

Load the generated bundle from the `dist/` directory using your browser's extension management page (`chrome://extensions` or `about:debugging`).

See [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for detailed local setup, multi-peer testing, and AMO/CWS compliance instructions.

## Usage

1. Install the WebRoom extension.
2. Open any `https://` webpage.
3. The WebRoom floating indicator appears in the bottom-right corner.
4. The indicator shows how many people are currently on the same URL.
5. Click the indicator to open the WebRoom panel.

From the panel you can:

- **Chat** — Type a message and hit Enter to broadcast it to everyone in the room.
- **Voice** — Click the microphone button to join the voice channel. A speaker icon controls your audio output.
- **Participant list** — See all active participants and their emoji avatars.
- **Follow** — Click a participant's avatar to lock your scroll/viewport to theirs.
- **Send a file** — Click the file icon next to a participant to send them a file directly P2P.
- **Settings** — Open settings to view your cryptographic Node ID, cluster role, and toggle voluntary resource contribution.

### How rooms work

```text
https://example.com/article  →  Room A  (participants on this URL)
https://example.com/pricing  →  Room B  (separate room)
```

URL tracking parameters (UTM tags, click IDs, session tokens) are automatically stripped so everyone reading the same page lands in the same room even if their links look different.

## Documentation & Contributing

- 📖 **[Developer Guide](DEVELOPER_GUIDE.md)** — Architecture deep-dive, local setup, multi-peer testing, and debugging.
- 🤝 **[Contributing Guidelines](CONTRIBUTING.md)** — How to contribute, commit conventions, and branch workflow.
- 📜 **[Code of Conduct](CODE_OF_CONDUCT.md)** — Community standards and enforcement.
- 🛡️ **[Security Policy](SECURITY.md)** — Vulnerability disclosure policy and supported versions.
- 🔨 **[Build from Source](BUILD.md)** — AMO reproducible build instructions.

## License

[MIT License](LICENSE)
