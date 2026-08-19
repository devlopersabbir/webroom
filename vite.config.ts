import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";

/**
 * Strict version validator adhering to SemVer and Chrome Extension Manifest specifications.
 * Chrome requires 1 to 4 dot-separated integers between 0 and 65535 with no leading zeroes (except 0 itself).
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
      `[WebRoom Build Error] Version "${baseVersion}" is not a valid Chrome Extension manifest version (1-4 dot-separated integers).`,
    );
  }
}

function generateManifest() {
  const manifest = readJsonFile("src/manifest.json");
  const pkg = readJsonFile("package.json");

  if (!pkg.version || typeof pkg.version !== "string") {
    throw new Error(
      "[WebRoom Build Error] Missing or non-string version in package.json",
    );
  }

  validateStrictVersion(pkg.version);

  // Chrome manifest version strictly uses the numeric dot-separated base
  const cleanManifestVersion = pkg.version.split("-")[0].split("+")[0];

  return {
    name: "WebRoom",
    description:
      pkg.description ||
      "Decentralized real-time presence layer on top of the web",
    version: cleanManifestVersion,
    ...manifest,
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    webExtension({
      manifest: generateManifest,
      browser: "firefox",
    }),
  ],
});
