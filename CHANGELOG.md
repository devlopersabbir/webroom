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
