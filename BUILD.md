# Building WebRoom from Source for Mozilla AMO Review

This document contains step-by-step instructions for reproducing the WebRoom Firefox Add-on build from this source code package.

## Prerequisites

- **Bun**: v1.1.0 or newer (Recommended), OR **Node.js**: v20.x or newer
- **Operating System**: Linux, macOS, or Windows

To install Bun (if not already installed):

```bash
curl -fsSL https://bun.sh/install | bash
```

## Step-by-Step Build Instructions

### 1. Install Dependencies

Run the following command from the root of this source archive:

```bash
bun install --frozen-lockfile
```

_(Alternatively, if using npm: `npm ci`)_

### 2. Run Tests (Optional)

```bash
bun test
```

### 3. Build the Firefox Extension

Run the build script:

```bash
bun run build:firefox
```

_(Alternatively: `npx cross-env TARGET=firefox vite build`)_

### 4. Verify Output

The build will output the extension files into the `./dist` directory:

- `dist/manifest.json` — Manifest V3 configuration for Firefox
- `dist/src/background/index.js` — Background service/relay script (unminified)
- `dist/src/content/index.js` — Content script (unminified)
- `dist/icon/` — Extension icons

### 5. Validate with `web-ext`

To run Mozilla's official extension linter on the built bundle:

```bash
bunx web-ext lint --source-dir=dist
```

## Build Process & Security Notes

- **No Code Obfuscation**: The build uses TypeScript and Vite. Minification and code mangling are disabled (`minify: false`) for Firefox builds so that all generated code is fully readable and reviewable.
- **No Remote Code**: The extension contains no remote script injection, `eval()`, or dynamic code execution.
- **License**: MIT
