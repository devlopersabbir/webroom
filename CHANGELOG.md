# [1.3.0](https://github.com/devlopersabbir/webroom/compare/v1.2.0...v1.3.0) (2026-08-19)


### Features

* add @semantic-release/exec to devDependencies and update project dependencies ([005625d](https://github.com/devlopersabbir/webroom/commit/005625df7337ee185a243d9b71dfae6bfa1f626a))
* add automatic cleanup and recreation of release directory before packaging ([ab450c0](https://github.com/devlopersabbir/webroom/commit/ab450c02dd017cf5efc815c3b713fe88a1823899))
* update build script to output browser-specific zip files directly to root and configure release assets ([a754217](https://github.com/devlopersabbir/webroom/commit/a754217853476acb5735d8314069f546f56106f2))

# [1.2.0](https://github.com/devlopersabbir/webroom/compare/v1.1.0...v1.2.0) (2026-08-19)


### Features

* implement core WebRoom architecture including voice signaling protocol, presence management, and room lifecycle logic ([1def989](https://github.com/devlopersabbir/webroom/commit/1def9898200ef14b0850a8980f5c35a4c89c3514))
* implement emoji picker component with search functionality and unit tests ([6279a0e](https://github.com/devlopersabbir/webroom/commit/6279a0ed1c0a304327818fb23d8e199c0bfd4d31))
* implement room presence management, peer discovery, and follow-mode protocol systems ([6a06a11](https://github.com/devlopersabbir/webroom/commit/6a06a11461fe55735e51b3cd71f8313979b03316))

# [1.1.0](https://github.com/devlopersabbir/webroom/compare/v1.0.0...v1.1.0) (2026-08-19)


### Features

* implement ephemeral P2P chat, cross-browser manifest generation, and Firefox deployment automation ([cf258fe](https://github.com/devlopersabbir/webroom/commit/cf258fe783cb1c24def93a8a3c8a8dd6d46b2c15))

# Changelog

All notable changes to this project will be documented in this file automatically.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-08-19

### 🚀 Features

- **Ephemeral P2P Text Chat**: Real-time text messaging between peers on the same URL with zero backend or persistent database.
- **Temporary Emoji Avatars**: Automatic random avatar assignment (e.g. 🐸, 🦊, 🐼) for session-based identity without login or profile setup.
- **Decentralized Presence**: URL canonicalization, deterministic room ID generation, online peer counting, and heartbeat/timeout lifecycle.
- **Transport Abstraction**: Unified `WebRoomMessage` transport layer designed for current local tab communication and future WebRTC DataChannels.
- **Firefox Deployment Automation**: Added build scripts and GitHub Actions pipeline for Mozilla Developer Hub (AMO) submission.

### 🛠️ Refactoring & Improvements

- **Keyboard & Host Page Shortcut Isolation**: Isolated all keyboard, mouse, and composer events to prevent host page shortcuts (e.g. YouTube fullscreen/pause) while focused inside WebRoom.
- **Smooth Spring Transitions & UI Polish**: Added fluid opening/closing animations, smooth message entry transitions, and custom dark aesthetics.
- **Simplified Indicator UX**: Removed redundant hover tooltip in favor of a clean, direct toggleable floating pill.
- **Manual AMO Deployment Workflow**: Configured manual `workflow_dispatch` trigger with customizable channel and release notes.

### 📚 Documentation & Chores

- **Documentation**: Rewrote README with complete product architecture, usage guides, and roadmap.
- **Store Metadata**: Added AMO metadata, categories, description, and icons.
