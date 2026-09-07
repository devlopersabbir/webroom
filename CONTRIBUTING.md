# Contributing to WebRoom

First off, thank you for taking the time to contribute! 🎉

WebRoom is an open-source, decentralized real-time presence layer for the web. We welcome contributions of all kinds: bug reports, documentation improvements, feature requests, and code contributions.

---

## 📜 Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [devlopersabbir@gmail.com](mailto:devlopersabbir@gmail.com).

---

## 🚀 Getting Started

### Prerequisites

- **[Bun](https://bun.sh/)**: v1.1.0 or newer *(Recommended)*
- **[Node.js](https://nodejs.org/)**: v20.x or newer *(Required for web-ext & tooling)*
- **Git**

### Setup Repository

1. Fork the repository on GitHub: [https://github.com/devlopersabbir/webroom](https://github.com/devlopersabbir/webroom)
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/webroom.git
   cd webroom
   ```
3. Install dependencies using Bun:
   ```bash
   bun install --frozen-lockfile
   ```

---

## 🌿 Branching Strategy

Our branching workflow keeps production code stable and releases automated:

- **`main`**: Represents the current stable production release. Direct pushes are protected. Only release PRs from `dev` merge into `main`.
- **`dev`**: The active integration branch for upcoming releases. All feature and bug-fix PRs must target `dev`.
- **`feat/<feature-name>`**: Feature branches branched off `dev`.
- **`fix/<bug-name>`**: Bug fix branches branched off `dev`.

```text
main  ───────────────────────────● (v3.0.0 Release)
                                 ▲
dev   ──────●─────────●──────────┘
            ▲         ▲
feat/voice  ┘         │
fix/relay   ──────────┘
```

---

## 📝 Commit Conventions & Semantic Release

WebRoom uses **[Conventional Commits](https://www.conventionalcommits.org/)** and **Semantic Release** to automate versioning, changelog generation, and releases.

### Format

```text
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

### Types & Release Impact

| Type | Release Type | Description |
| :--- | :--- | :--- |
| `fix:` | **Patch** (`3.0.0` $\rightarrow$ `3.0.1`) | Bug fixes |
| `feat:` | **Minor** (`3.0.0` $\rightarrow$ `3.1.0`) | New features or non-breaking additions |
| `feat!:` or `BREAKING CHANGE:` | **Major** (`3.0.0` $\rightarrow$ `4.0.0`) | Breaking API or protocol changes |
| `perf:` | **Patch** | Performance improvements |
| `refactor:` | None / Patch | Code restructuring without behavior changes |
| `docs:` | None | Documentation updates |
| `chore:` | None | Dependencies, build scripts, tooling |
| `test:` | None | Unit or integration tests |

> [!IMPORTANT]
> Because Semantic Release automates version numbers based on commit headers and footers, **always** use lowercase types (`feat:`, `fix:`, etc.). If introducing a breaking change, include `!` or `BREAKING CHANGE: <reason>`.

---

## 🛠️ Development Workflow

### Useful Makefile Commands

We provide an automated [`Makefile`](Makefile) for everyday development:

```bash
make help          # View all available targets and descriptions
make install       # Install dependencies with Bun
make dev           # Start Chrome extension development mode
make dev-firefox   # Start Firefox extension development mode
make test          # Run the unit test suite (bun test)
make lint          # Build and run strict Firefox AMO linter
make build         # Build production bundles for Chrome & Firefox
make pre           # Generate unpacked preview directories (v3.0.0_chrome & v3.0.0_firefox)
make pack          # Package zip archives for Chrome Web Store & Firefox AMO
```

### Running Tests Locally

Before submitting a pull request, ensure all tests pass:

```bash
bun test
```

### Verifying Extension Builds

Build and validate both browser targets:

```bash
# Verify Chrome Extension build
bun run build:chrome

# Verify Firefox Add-on build & strict AMO linting (0 errors, 0 warnings)
bun run lint:firefox
```

---

## 📬 Submitting a Pull Request (PR)

1. **Target the Right Branch**: Target **`dev`** for all new features and fixes.
2. **Follow PR Template**: Fill out the provided [Pull Request Template](.github/pull_request_template.md).
3. **Keep PRs Focused**: Avoid bundling unrelated changes into a single PR.
4. **Code Reviews**: WebRoom uses [`.github/CODEOWNERS`](.github/CODEOWNERS). Pull requests require review and approval from repository maintainers (`@devlopersabbir`) prior to merge.

---

## 🛡️ Security Guidelines

- **No Unsafe DOM Injection**: Never use raw `innerHTML` or `dangerouslySetInnerHTML`. Use sanitized DOM utilities or React elements.
- **Zero Remote Code**: Dynamic script loading, `eval()`, and remote code execution are strictly prohibited to comply with Web Store and Mozilla AMO security policies.
- **Privacy First**: WebRoom does not collect analytics, track users, or transmit browsing history to any centralized server.
