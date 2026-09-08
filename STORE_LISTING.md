# WebRoom — Store Listing Details & Metadata

Use these exact copy-paste details when submitting and managing your listing on the **Mozilla Add-on Developer Hub (AMO)** and **Chrome Web Store**.

---

## 🏷️ Basic Information

* **Extension Name:** `WebRoom`
* **Short Summary / Tagline:**
  > Real-time presence, voice chat, and peer-to-peer file sharing for every webpage. No accounts, no servers, no central backend.
* **Category:** Social & Communication / Productivity
* **Version:** `3.0.2`
* **Homepage / Repository:** `https://github.com/devlopersabbir/webroom`
* **Support Email:** `devlopersabbir@gmail.com`
* **Support Website:** `https://github.com/devlopersabbir/webroom/issues`
* **License:** `MIT License`

---

## 📝 Full Description (AMO & Chrome Web Store)

```
WebRoom turns every webpage on the internet into a live collaboration room.

When you and other people open the same URL, WebRoom quietly connects your browsers into a decentralized real-time room — no accounts, no conference codes, no backend server required.

✨ WHAT YOU CAN DO:

👥 See Who's Here — A live counter in the corner of every page shows how many people are browsing the same URL right now. Click it to open the WebRoom panel.

💬 Real-Time Chat — Send and receive text messages instantly with everyone in the same room.

🎙️ Voice Chat — Talk directly to other participants using full WebRTC peer-to-peer audio. No dial-in number, no conference service, no account. Click the microphone to join.

📁 Peer-to-Peer File Transfer — Send any file directly to another participant. Files travel browser-to-browser with zero server upload or storage. The recipient gets a download prompt when the transfer completes.

👁️ Follow Mode — Click a participant's avatar to lock your scroll position and viewport to theirs in real time. Ideal for walkthroughs and remote pair work.

🖱️ Cursor Sharing — See where other participants are pointing on the page in real time.

🔒 Cryptographic Identity — Every WebRoom installation generates a local ECDSA keypair on first launch. Your Node ID is derived from your public key. Signed membership messages prevent spoofing. No login, no account, no email.

⚡ Self-Organizing Infrastructure — In rooms with more than 3 participants, willing browsers automatically coordinate as lightweight audio relays so speakers do not have to upload audio to every listener simultaneously. This is voluntary and bounded.

🛡️ Conservative Resource Budget — Relay contribution is capped at 2 relay slots and 500 Kbps upload maximum per node. You can disable resource contribution at any time from Settings with no loss of voice or chat capability.

🧹 Ephemeral & Private — No data is stored between sessions. When you close the tab, your presence immediately disappears. No history, no logs, no cloud sync.

---

🔒 PRIVACY & SECURITY:

• WebRoom does not collect, store, or transmit any personal data.
• There are no analytics, advertisements, tracking scripts, or telemetry endpoints.
• All communication is direct WebRTC peer-to-peer. No WebRoom server sees your messages, voice, or files.
• Peer identifiers are temporary random UUIDs, scoped to the browser session, never written to disk.
• Fully open source and auditable: https://github.com/devlopersabbir/webroom

---

🌐 HOW ROOMS WORK:

Every URL is its own room. Two people on https://example.com/article are in Room A. Someone on https://example.com/pricing is in a completely separate Room B. URL tracking parameters (UTM tags, click IDs, session tokens) are automatically stripped so everyone reading the same content lands in the same room.
```

---

## 🔐 Permissions Justification (For AMO & CWS Review Forms)

When reviewers ask why each permission is required:

| Permission | Reason |
| :--- | :--- |
| `tabs` | Required to read the current tab's URL so WebRoom can compute the correct room ID for the active page. |
| `storage` | Used exclusively to persist the local cryptographic node identity (Ed25519 keypair) and the user's resource-sharing preference across browser restarts. No personal data is stored. |
| `activeTab` | Required to inject the WebRoom floating indicator and panel into the currently active webpage. |
| WebRTC (via content script) | All voice, chat, cursor, file transfer, and presence signals are transported over WebRTC data channels and audio streams. No intermediary server handles the content of these channels. |
| `<all_urls>` host permission | WebRoom is a cross-site presence layer — it needs to operate on any HTTPS page the user visits, not just specific domains. It does not read page content; it only injects its own UI overlay. |

---

## 🛡️ Privacy Policy Statement (For AMO & CWS Review Forms)

```text
WebRoom operates on a strict zero-data-collection policy:

1. No Personal Data: The extension does not collect, store, or sell any personally identifiable information (PII).

2. Ephemeral Presence: Peer identifiers are temporary random UUIDs created per browser session and are never persisted to disk or transmitted to any WebRoom server.

3. Cryptographic Identity: A local ECDSA keypair is generated on first install and stored exclusively in the user's own browser storage. The private key never leaves the device. The public key is used only to derive a node ID shared with peers in the same room.

4. No Central Server: All communication (presence heartbeats, chat, voice, file transfer) operates over direct WebRTC peer-to-peer connections. WebRoom operates no signaling server, relay server, or database.

5. No Telemetry or Analytics: WebRoom contains no third-party trackers, advertisements, crash reporters, or telemetry endpoints of any kind.

6. File Transfers: Files sent via WebRoom travel directly between browsers over an encrypted WebRTC data channel. No file data is uploaded to or stored on any WebRoom-operated server.
```

---

## 🏷️ Tags & Keywords

`webroom`, `presence`, `real-time`, `peer-to-peer`, `decentralized`, `voice-chat`, `file-sharing`, `collaboration`, `webrtc`, `social`, `url-room`, `developer-tools`, `ephemeral`, `privacy`
