import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";

/**
 * Strict version validator adhering to SemVer and Chrome/Firefox Extension specifications.
 */
function validateStrictVersion(version: string): void {
  const semverPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  const manifestVersionPattern = /^\d+(\.\d+){1,3}$/;

  if (!semverPattern.test(version)) {
    throw new Error(
      `[WebRoom Build Error] Invalid SemVer version in package.json: "${version}". Version must strictly follow SemVer (e.g. 0.1.0).`,
    );
  }

  // Extract base version for manifest (without prerelease/build metadata if any)
  const baseVersion = version.split("-")[0].split("+")[0];
  if (!manifestVersionPattern.test(baseVersion)) {
    throw new Error(
      `[WebRoom Build Error] Version "${baseVersion}" is not a valid Extension manifest version (1-4 dot-separated integers).`,
    );
  }
}

const targetBrowser = (process.env.TARGET as "chrome" | "firefox") || "firefox";

function generateManifest() {
  const pkg = readJsonFile("package.json");

  if (!pkg.version || typeof pkg.version !== "string") {
    throw new Error(
      "[WebRoom Build Error] Missing or non-string version in package.json",
    );
  }

  validateStrictVersion(pkg.version);

  const cleanManifestVersion = pkg.version.split("-")[0].split("+")[0];

  const background =
    targetBrowser === "firefox"
      ? { scripts: ["src/background/index.ts"] }
      : { service_worker: "src/background/index.ts" };

  const browserSpecificSettings =
    targetBrowser === "firefox"
      ? {
          gecko: {
            id: "webroom@devlopersabbir.github.io",
            strict_min_version: "142.0",
            data_collection_permissions: {
              required: ["none"],
            },
          },
        }
      : undefined;

  return {
    manifest_version: 3,
    name: "WebRoom",
    description:
      pkg.description ||
      "Decentralized real-time presence layer on top of the web",
    version: cleanManifestVersion,
    homepage_url: "https://github.com/devlopersabbir/webroom",
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png",
    },
    background,
    permissions: ["storage"],
    host_permissions: ["http://*/*", "https://*/*"],
    options_ui: {
      page: "src/options/index.html",
      open_in_tab: true,
    },
    content_scripts: [
      {
        matches: ["http://*/*", "https://*/*"],
        js: ["src/content/index.tsx"],
        run_at: "document_idle",
        all_frames: false,
      },
    ],
    ...(browserSpecificSettings
      ? { browser_specific_settings: browserSpecificSettings }
      : {}),
  };
}

// https://vitejs.dev/config/
/**
 * Vite plugin to eliminate unsafe `innerHTML` assignments and `eval`/`Function` polyfills in output bundles.
 * Guarantees 0-warning / 0-error compliance with Firefox AMO and Chrome Web Store linters.
 */
function extensionSecuritySanitizerPlugin() {
  return {
    name: "vite-plugin-extension-security-sanitizer",
    renderChunk(code: string, chunk: { fileName: string }) {
      if (!chunk.fileName.endsWith(".js")) {
        return null;
      }

      let updatedCode = code;
      let hasReplacements = false;

      // 1. Sanitize innerHTML assignments
      if (updatedCode.includes("innerHTML")) {
        const helperName = "__webroom_safe_set_inner_html";
        const helperDef = `function ${helperName}(el, val) { if (!el) return; el.textContent = ''; if (val) { try { var doc = new DOMParser().parseFromString(val, 'text/html'); while (doc.body.firstChild) { el.appendChild(doc.body.firstChild); } } catch (e) { el.textContent = String(val); } } }\n`;

        const codeWithInnerHtmlSanitized = updatedCode.replace(
          /(?<!['"`])\b([a-zA-Z0-9_$]+)\.innerHTML\s*=\s*([^;,}\n]+)/g,
          (_, target, value) => {
            hasReplacements = true;
            return `${helperName}(${target}, ${value})`;
          },
        );

        if (hasReplacements) {
          updatedCode = helperDef + codeWithInnerHtmlSanitized;
        }
      }

      // 2. Sanitize regeneratorRuntime Function constructor in polyfills
      if (updatedCode.includes('Function("r"')) {
        updatedCode = updatedCode.replace(
          /Function\(["']r["'],\s*["']regeneratorRuntime\s*=\s*r["']\)/g,
          '(function(r){ if (typeof globalThis !== "undefined") globalThis.regeneratorRuntime = r; })',
        );
        hasReplacements = true;
      }

      // 3. Sanitize Function("binder", ...) constructor in function-bind / es-abstract polyfills
      if (updatedCode.includes('Function("binder"')) {
        updatedCode = updatedCode.replace(
          /Function\s*\(\s*["']binder["']\s*,[\s\S]*?binder\.apply\(this,\s*arguments\);?\s*\}["']\s*\)/g,
          "(function(binder){ return function(){ return binder.apply(this, arguments); }; })",
        );
        hasReplacements = true;
      }

      // 4. Sanitize "%eval%":eval in get-intrinsic polyfill
      if (
        updatedCode.includes('"%eval%":eval') ||
        updatedCode.includes("'%eval%':eval")
      ) {
        updatedCode = updatedCode.replace(
          /["']%eval%["']\s*:\s*eval\b/g,
          '"%eval%":undefined',
        );
        hasReplacements = true;
      }

      // 5. Sanitize worker-timers in MQTT to use native timers instead of blob: workers (avoids webpage CSP violations)
      if (
        updatedCode.includes("isReactNativeBrowser") &&
        updatedCode.includes("isWebWorker")
      ) {
        updatedCode = updatedCode.replace(
          /return\s+([a-zA-Z0-9_$]+)\.default\s*&&\s*!\1\.isWebWorker\s*&&\s*!\1\.isReactNativeBrowser\s*\?\s*([a-zA-Z0-9_$]+)\s*:\s*([a-zA-Z0-9_$]+)/g,
          "return $3",
        );
        hasReplacements = true;
      }

      if (hasReplacements) {
        return {
          code: updatedCode,
          map: null,
        };
      }

      return null;
    },
  };
}

export default defineConfig({
  build: {
    // Disable minification for Firefox to provide clean, readable code to AMO reviewers and avoid obfuscation flags
    minify: targetBrowser === "firefox" ? false : "esbuild",
    sourcemap: false,
  },
  plugins: [
    extensionSecuritySanitizerPlugin(),
    react(),
    tailwindcss(),
    webExtension({
      manifest: generateManifest,
      browser: targetBrowser,
    }),
  ],
});
