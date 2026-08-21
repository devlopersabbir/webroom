# WebRoom

**WebRoom** is a decentralized browser extension that turns every webpage into a real-time room. People visiting the same webpage can discover each other and communicate directly without a central server.

> **The web page is the room. The people on that page are the participants.**

## Features

- 👥 **Online Presence** — See how many people are currently on the same webpage.
- 💬 **Real-time Chat** — Send and receive text messages with other people in the same room.
- 🐸 **Random Emoji Avatars** — Each participant gets a random emoji as their temporary identity.
- 🌐 **URL-based Rooms** — Every webpage acts as its own room.
- 🔒 **Decentralized Architecture** — No WebRoom backend, database, account, or centralized chat server.
- ⚡ **Floating Interface** — Access WebRoom directly from a small floating indicator on the webpage.
- 🧹 **Ephemeral Sessions** — Presence and chat exist only during the active session.

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
- [ ] Video chat
- [ ] File sharing
- [ ] Screen sharing
- [ ] More real-time collaboration features

## Installation

### Chrome

WebRoom is available for Chrome:

[Chrome Web Store](https://chromewebstore.google.com/)

### Firefox

WebRoom is available for Firefox:

[Firefox Add-ons](https://addons.mozilla.org/en-US/developers/addon/webroom)

> Store links are currently placeholders and will be replaced with the official WebRoom listing URLs.

### Development

Clone the repository:

```bash
git clone <repository-url>
cd webroom
```

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

Then load the generated extension from the `dist` directory using your browser's extension management page.

## Usage

1. Install the WebRoom extension.
2. Open any webpage.
3. The WebRoom floating indicator appears on the page.
4. The indicator shows how many people are currently on the same webpage.
5. Click the indicator to open the WebRoom panel.
6. Send messages through the chat.
7. Open the same webpage in another browser context to test presence and chat.

For example:

```text
https://example.com/article
        ↓
     WebRoom
        ↓
   👥 2 people
        ↓
      💬 Chat
```

Different URLs represent different rooms:

```text
example.com/page-a → Room A
example.com/page-b → Room B
```

## License

[MIT License](LICENSE)
