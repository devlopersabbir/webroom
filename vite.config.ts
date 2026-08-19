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

const targetBrowser = (process.env.TARGET as "chrome" | "firefox") || "chrome";

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
      ? { scripts: ["src/background.ts"] }
      : { service_worker: "src/background.ts" };

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
    content_scripts: [
      {
        matches: ["http://*/*", "https://*/*"],
        js: ["src/content/index.tsx"],
        run_at: "document_idle",
      },
    ],
    ...(browserSpecificSettings
      ? { browser_specific_settings: browserSpecificSettings }
      : {}),
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    webExtension({
      manifest: generateManifest,
      browser: targetBrowser,
    }),
  ],
});
