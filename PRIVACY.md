# Privacy Policy for WebRoom

**Last Updated:** September 2026

**WebRoom** ("we", "our", or "the extension") is a decentralized browser extension dedicated to preserving user privacy. WebRoom connects users visiting the same webpage into a real-time peer-to-peer collaboration room.

WebRoom operates on a strict **zero-data-collection policy**. We do not collect, store, transmit, monetize, or share any personal information.

---

## 1. Information We Do Not Collect

* **No Personally Identifiable Information (PII):** We do not collect your name, email address, physical address, phone number, IP address, or payment details.
* **No Browsing History or Page Content:** WebRoom computes room identifiers locally in your browser based on the active tab's canonical URL. Your browsing history, visited URLs, and webpage contents are never transmitted to any WebRoom server or third-party database.
* **No Analytics or Telemetry:** WebRoom contains no tracking scripts, advertising SDKs, crash logging services, or analytics providers (e.g., Google Analytics, Mixpanel).
* **No Cloud Storage of Messages, Voice, or Files:** All chat messages, voice audio streams, cursor positions, and file transfers operate directly peer-to-peer over WebRTC. No central server intercepts, records, or stores your communications.

---

## 2. Local Browser Storage Usage

WebRoom uses the browser's local extension storage API (`chrome.storage.local` / `browser.storage.local`) solely for:

1. **Local Cryptographic Identity:** Storing a locally generated ECDSA/Ed25519 keypair. The private key never leaves your local browser storage. The derived public key serves as an ephemeral node identifier within the room to prevent message spoofing.
2. **User Preferences:** Storing user settings, such as your chosen display theme and voluntary resource contribution toggles (relay slots and bandwidth budget).

None of this stored data is synced to external servers or accessible to third parties.

---

## 3. Peer-to-Peer (WebRTC) Communications

* When connecting to peers on the same URL, public WebRTC signaling brokers (such as BitTorrent trackers or public MQTT brokers provided by the open-source Trystero library) are used temporarily to negotiate direct browser-to-browser connections.
* Once established, all data channels and audio streams flow directly between participants' browsers and are encrypted by WebRTC standards (DTLS/SRTP).
* When a user leaves a webpage or closes the browser tab, all ephemeral session data and connections are immediately terminated.

---

## 4. Permissions Disclosure

WebRoom requests only the minimum permissions required for its functionality:

| Permission | Purpose |
| :--- | :--- |
| `storage` | To locally store user preferences and the local cryptographic keypair across browser restarts. |
| `activeTab` / `<all_urls>` | To read the current URL for room naming and display the floating collaboration interface on webpages. |

WebRoom does not inject advertising, modify page contents, or sell user attention.

---

## 5. Third-Party Services

WebRoom does not integrate with any third-party marketing, tracking, or data-broker services. The source code is open source and auditable.

---

## 6. Open Source & Auditability

WebRoom is completely open source under the MIT License. The code is available for public inspection:
- Repository: [https://github.com/devlopersabbir/webroom](https://github.com/devlopersabbir/webroom)

---

## 7. Contact Us

If you have questions or suggestions regarding this Privacy Policy, please reach out:
* **GitHub Issues:** [https://github.com/devlopersabbir/webroom/issues](https://github.com/devlopersabbir/webroom/issues)
* **Email:** [devlopersabbir@gmail.com](mailto:devlopersabbir@gmail.com)
