// vite.config.ts
import { defineConfig } from "file:///C:/Users/Sabbir/Documents/webroom/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/Sabbir/Documents/webroom/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/Users/Sabbir/Documents/webroom/node_modules/@tailwindcss/vite/dist/index.mjs";
import webExtension, { readJsonFile } from "file:///C:/Users/Sabbir/Documents/webroom/node_modules/vite-plugin-web-extension/dist/index.js";
function validateStrictVersion(version) {
  const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  const manifestVersionPattern = /^\d+(\.\d+){1,3}$/;
  if (!semverPattern.test(version)) {
    throw new Error(
      `[WebRoom Build Error] Invalid SemVer version in package.json: "${version}". Version must strictly follow SemVer (e.g. 0.1.0).`
    );
  }
  const baseVersion = version.split("-")[0].split("+")[0];
  if (!manifestVersionPattern.test(baseVersion)) {
    throw new Error(
      `[WebRoom Build Error] Version "${baseVersion}" is not a valid Extension manifest version (1-4 dot-separated integers).`
    );
  }
}
var targetBrowser = process.env.TARGET || "chrome";
function generateManifest() {
  const pkg = readJsonFile("package.json");
  if (!pkg.version || typeof pkg.version !== "string") {
    throw new Error(
      "[WebRoom Build Error] Missing or non-string version in package.json"
    );
  }
  validateStrictVersion(pkg.version);
  const cleanManifestVersion = pkg.version.split("-")[0].split("+")[0];
  const background = targetBrowser === "firefox" ? { scripts: ["src/background.ts"] } : { service_worker: "src/background.ts" };
  const browserSpecificSettings = targetBrowser === "firefox" ? {
    gecko: {
      id: "webroom@devlopersabbir.github.io",
      strict_min_version: "142.0",
      data_collection_permissions: {
        required: ["none"]
      }
    }
  } : void 0;
  return {
    manifest_version: 3,
    name: "WebRoom",
    description: pkg.description || "Decentralized real-time presence layer on top of the web",
    version: cleanManifestVersion,
    homepage_url: "https://github.com/devlopersabbir/webroom",
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png"
    },
    background,
    content_scripts: [
      {
        matches: ["http://*/*", "https://*/*"],
        js: ["src/content/index.tsx"],
        run_at: "document_idle"
      }
    ],
    ...browserSpecificSettings ? { browser_specific_settings: browserSpecificSettings } : {}
  };
}
function extensionSecuritySanitizerPlugin() {
  return {
    name: "vite-plugin-extension-security-sanitizer",
    renderChunk(code, chunk) {
      if (!chunk.fileName.endsWith(".js")) {
        return null;
      }
      let updatedCode = code;
      let hasReplacements = false;
      if (updatedCode.includes("innerHTML")) {
        const helperName = "__webroom_safe_set_inner_html";
        const helperDef = `function ${helperName}(el, val) { if (!el) return; el.textContent = ''; if (val) { try { var doc = new DOMParser().parseFromString(val, 'text/html'); while (doc.body.firstChild) { el.appendChild(doc.body.firstChild); } } catch (e) { el.textContent = String(val); } } }
`;
        const codeWithInnerHtmlSanitized = updatedCode.replace(
          /(?<!['"`])\b([a-zA-Z0-9_$]+)\.innerHTML\s*=\s*([^;,}\n]+)/g,
          (_, target, value) => {
            hasReplacements = true;
            return `${helperName}(${target}, ${value})`;
          }
        );
        if (hasReplacements) {
          updatedCode = helperDef + codeWithInnerHtmlSanitized;
        }
      }
      if (updatedCode.includes('Function("r"')) {
        updatedCode = updatedCode.replace(
          /Function\(["']r["'],\s*["']regeneratorRuntime\s*=\s*r["']\)/g,
          '(function(r){ if (typeof globalThis !== "undefined") globalThis.regeneratorRuntime = r; })'
        );
        hasReplacements = true;
      }
      if (updatedCode.includes('Function("binder"')) {
        updatedCode = updatedCode.replace(
          /Function\s*\(\s*["']binder["']\s*,[\s\S]*?binder\.apply\(this,\s*arguments\);?\s*\}["']\s*\)/g,
          "(function(binder){ return function(){ return binder.apply(this, arguments); }; })"
        );
        hasReplacements = true;
      }
      if (updatedCode.includes('"%eval%":eval') || updatedCode.includes("'%eval%':eval")) {
        updatedCode = updatedCode.replace(/["']%eval%["']\s*:\s*eval\b/g, '"%eval%":undefined');
        hasReplacements = true;
      }
      if (updatedCode.includes("isReactNativeBrowser") && updatedCode.includes("isWebWorker")) {
        updatedCode = updatedCode.replace(
          /return\s+([a-zA-Z0-9_$]+)\.default\s*&&\s*!\1\.isWebWorker\s*&&\s*!\1\.isReactNativeBrowser\s*\?\s*([a-zA-Z0-9_$]+)\s*:\s*([a-zA-Z0-9_$]+)/g,
          "return $3"
        );
        hasReplacements = true;
      }
      if (hasReplacements) {
        return {
          code: updatedCode,
          map: null
        };
      }
      return null;
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [
    extensionSecuritySanitizerPlugin(),
    react(),
    tailwindcss(),
    webExtension({
      manifest: generateManifest,
      browser: targetBrowser
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxTYWJiaXJcXFxcRG9jdW1lbnRzXFxcXHdlYnJvb21cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXFNhYmJpclxcXFxEb2N1bWVudHNcXFxcd2Vicm9vbVxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvU2FiYmlyL0RvY3VtZW50cy93ZWJyb29tL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xyXG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSBcIkB0YWlsd2luZGNzcy92aXRlXCI7XHJcbmltcG9ydCB3ZWJFeHRlbnNpb24sIHsgcmVhZEpzb25GaWxlIH0gZnJvbSBcInZpdGUtcGx1Z2luLXdlYi1leHRlbnNpb25cIjtcclxuXHJcbi8qKlxyXG4gKiBTdHJpY3QgdmVyc2lvbiB2YWxpZGF0b3IgYWRoZXJpbmcgdG8gU2VtVmVyIGFuZCBDaHJvbWUvRmlyZWZveCBFeHRlbnNpb24gc3BlY2lmaWNhdGlvbnMuXHJcbiAqL1xyXG5mdW5jdGlvbiB2YWxpZGF0ZVN0cmljdFZlcnNpb24odmVyc2lvbjogc3RyaW5nKTogdm9pZCB7XHJcbiAgY29uc3Qgc2VtdmVyUGF0dGVybiA9XHJcbiAgICAvXigwfFsxLTldXFxkKilcXC4oMHxbMS05XVxcZCopXFwuKDB8WzEtOV1cXGQqKSg/Oi0oKD86MHxbMS05XVxcZCp8XFxkKlthLXpBLVotXVswLTlhLXpBLVotXSopKD86XFwuKD86MHxbMS05XVxcZCp8XFxkKlthLXpBLVotXVswLTlhLXpBLVotXSopKSopKT8oPzpcXCsoWzAtOWEtekEtWi1dKyg/OlxcLlswLTlhLXpBLVotXSspKikpPyQvO1xyXG4gIGNvbnN0IG1hbmlmZXN0VmVyc2lvblBhdHRlcm4gPSAvXlxcZCsoXFwuXFxkKyl7MSwzfSQvO1xyXG5cclxuICBpZiAoIXNlbXZlclBhdHRlcm4udGVzdCh2ZXJzaW9uKSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICBgW1dlYlJvb20gQnVpbGQgRXJyb3JdIEludmFsaWQgU2VtVmVyIHZlcnNpb24gaW4gcGFja2FnZS5qc29uOiBcIiR7dmVyc2lvbn1cIi4gVmVyc2lvbiBtdXN0IHN0cmljdGx5IGZvbGxvdyBTZW1WZXIgKGUuZy4gMC4xLjApLmAsXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgLy8gRXh0cmFjdCBiYXNlIHZlcnNpb24gZm9yIG1hbmlmZXN0ICh3aXRob3V0IHByZXJlbGVhc2UvYnVpbGQgbWV0YWRhdGEgaWYgYW55KVxyXG4gIGNvbnN0IGJhc2VWZXJzaW9uID0gdmVyc2lvbi5zcGxpdChcIi1cIilbMF0uc3BsaXQoXCIrXCIpWzBdO1xyXG4gIGlmICghbWFuaWZlc3RWZXJzaW9uUGF0dGVybi50ZXN0KGJhc2VWZXJzaW9uKSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICBgW1dlYlJvb20gQnVpbGQgRXJyb3JdIFZlcnNpb24gXCIke2Jhc2VWZXJzaW9ufVwiIGlzIG5vdCBhIHZhbGlkIEV4dGVuc2lvbiBtYW5pZmVzdCB2ZXJzaW9uICgxLTQgZG90LXNlcGFyYXRlZCBpbnRlZ2VycykuYCxcclxuICAgICk7XHJcbiAgfVxyXG59XHJcblxyXG5jb25zdCB0YXJnZXRCcm93c2VyID0gKHByb2Nlc3MuZW52LlRBUkdFVCBhcyBcImNocm9tZVwiIHwgXCJmaXJlZm94XCIpIHx8IFwiY2hyb21lXCI7XHJcbi8vIGNvbnN0IHRhcmdldEJyb3dzZXIgPSBcImNocm9tZVwiO1xyXG5cclxuZnVuY3Rpb24gZ2VuZXJhdGVNYW5pZmVzdCgpIHtcclxuICBjb25zdCBwa2cgPSByZWFkSnNvbkZpbGUoXCJwYWNrYWdlLmpzb25cIik7XHJcblxyXG4gIGlmICghcGtnLnZlcnNpb24gfHwgdHlwZW9mIHBrZy52ZXJzaW9uICE9PSBcInN0cmluZ1wiKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgIFwiW1dlYlJvb20gQnVpbGQgRXJyb3JdIE1pc3Npbmcgb3Igbm9uLXN0cmluZyB2ZXJzaW9uIGluIHBhY2thZ2UuanNvblwiLFxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIHZhbGlkYXRlU3RyaWN0VmVyc2lvbihwa2cudmVyc2lvbik7XHJcblxyXG4gIGNvbnN0IGNsZWFuTWFuaWZlc3RWZXJzaW9uID0gcGtnLnZlcnNpb24uc3BsaXQoXCItXCIpWzBdLnNwbGl0KFwiK1wiKVswXTtcclxuXHJcbiAgY29uc3QgYmFja2dyb3VuZCA9XHJcbiAgICB0YXJnZXRCcm93c2VyID09PSBcImZpcmVmb3hcIlxyXG4gICAgICA/IHsgc2NyaXB0czogW1wic3JjL2JhY2tncm91bmQudHNcIl0gfVxyXG4gICAgICA6IHsgc2VydmljZV93b3JrZXI6IFwic3JjL2JhY2tncm91bmQudHNcIiB9O1xyXG5cclxuICBjb25zdCBicm93c2VyU3BlY2lmaWNTZXR0aW5ncyA9XHJcbiAgICB0YXJnZXRCcm93c2VyID09PSBcImZpcmVmb3hcIlxyXG4gICAgICA/IHtcclxuICAgICAgICAgIGdlY2tvOiB7XHJcbiAgICAgICAgICAgIGlkOiBcIndlYnJvb21AZGV2bG9wZXJzYWJiaXIuZ2l0aHViLmlvXCIsXHJcbiAgICAgICAgICAgIHN0cmljdF9taW5fdmVyc2lvbjogXCIxNDIuMFwiLFxyXG4gICAgICAgICAgICBkYXRhX2NvbGxlY3Rpb25fcGVybWlzc2lvbnM6IHtcclxuICAgICAgICAgICAgICByZXF1aXJlZDogW1wibm9uZVwiXSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfVxyXG4gICAgICA6IHVuZGVmaW5lZDtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIG1hbmlmZXN0X3ZlcnNpb246IDMsXHJcbiAgICBuYW1lOiBcIldlYlJvb21cIixcclxuICAgIGRlc2NyaXB0aW9uOlxyXG4gICAgICBwa2cuZGVzY3JpcHRpb24gfHxcclxuICAgICAgXCJEZWNlbnRyYWxpemVkIHJlYWwtdGltZSBwcmVzZW5jZSBsYXllciBvbiB0b3Agb2YgdGhlIHdlYlwiLFxyXG4gICAgdmVyc2lvbjogY2xlYW5NYW5pZmVzdFZlcnNpb24sXHJcbiAgICBob21lcGFnZV91cmw6IFwiaHR0cHM6Ly9naXRodWIuY29tL2RldmxvcGVyc2FiYmlyL3dlYnJvb21cIixcclxuICAgIGljb25zOiB7XHJcbiAgICAgIFwiMTZcIjogXCJpY29uLzE2LnBuZ1wiLFxyXG4gICAgICBcIjMyXCI6IFwiaWNvbi8zMi5wbmdcIixcclxuICAgICAgXCI0OFwiOiBcImljb24vNDgucG5nXCIsXHJcbiAgICAgIFwiMTI4XCI6IFwiaWNvbi8xMjgucG5nXCIsXHJcbiAgICB9LFxyXG4gICAgYmFja2dyb3VuZCxcclxuICAgIGNvbnRlbnRfc2NyaXB0czogW1xyXG4gICAgICB7XHJcbiAgICAgICAgbWF0Y2hlczogW1wiaHR0cDovLyovKlwiLCBcImh0dHBzOi8vKi8qXCJdLFxyXG4gICAgICAgIGpzOiBbXCJzcmMvY29udGVudC9pbmRleC50c3hcIl0sXHJcbiAgICAgICAgcnVuX2F0OiBcImRvY3VtZW50X2lkbGVcIixcclxuICAgICAgfSxcclxuICAgIF0sXHJcbiAgICAuLi4oYnJvd3NlclNwZWNpZmljU2V0dGluZ3NcclxuICAgICAgPyB7IGJyb3dzZXJfc3BlY2lmaWNfc2V0dGluZ3M6IGJyb3dzZXJTcGVjaWZpY1NldHRpbmdzIH1cclxuICAgICAgOiB7fSksXHJcbiAgfTtcclxufVxyXG5cclxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cclxuLyoqXHJcbiAqIFZpdGUgcGx1Z2luIHRvIGVsaW1pbmF0ZSB1bnNhZmUgYGlubmVySFRNTGAgYXNzaWdubWVudHMgYW5kIGBldmFsYC9gRnVuY3Rpb25gIHBvbHlmaWxscyBpbiBvdXRwdXQgYnVuZGxlcy5cclxuICogR3VhcmFudGVlcyAwLXdhcm5pbmcgLyAwLWVycm9yIGNvbXBsaWFuY2Ugd2l0aCBGaXJlZm94IEFNTyBhbmQgQ2hyb21lIFdlYiBTdG9yZSBsaW50ZXJzLlxyXG4gKi9cclxuZnVuY3Rpb24gZXh0ZW5zaW9uU2VjdXJpdHlTYW5pdGl6ZXJQbHVnaW4oKSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIG5hbWU6IFwidml0ZS1wbHVnaW4tZXh0ZW5zaW9uLXNlY3VyaXR5LXNhbml0aXplclwiLFxyXG4gICAgcmVuZGVyQ2h1bmsoY29kZTogc3RyaW5nLCBjaHVuazogeyBmaWxlTmFtZTogc3RyaW5nIH0pIHtcclxuICAgICAgaWYgKCFjaHVuay5maWxlTmFtZS5lbmRzV2l0aChcIi5qc1wiKSkge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBsZXQgdXBkYXRlZENvZGUgPSBjb2RlO1xyXG4gICAgICBsZXQgaGFzUmVwbGFjZW1lbnRzID0gZmFsc2U7XHJcblxyXG4gICAgICAvLyAxLiBTYW5pdGl6ZSBpbm5lckhUTUwgYXNzaWdubWVudHNcclxuICAgICAgaWYgKHVwZGF0ZWRDb2RlLmluY2x1ZGVzKFwiaW5uZXJIVE1MXCIpKSB7XHJcbiAgICAgICAgY29uc3QgaGVscGVyTmFtZSA9IFwiX193ZWJyb29tX3NhZmVfc2V0X2lubmVyX2h0bWxcIjtcclxuICAgICAgICBjb25zdCBoZWxwZXJEZWYgPSBgZnVuY3Rpb24gJHtoZWxwZXJOYW1lfShlbCwgdmFsKSB7IGlmICghZWwpIHJldHVybjsgZWwudGV4dENvbnRlbnQgPSAnJzsgaWYgKHZhbCkgeyB0cnkgeyB2YXIgZG9jID0gbmV3IERPTVBhcnNlcigpLnBhcnNlRnJvbVN0cmluZyh2YWwsICd0ZXh0L2h0bWwnKTsgd2hpbGUgKGRvYy5ib2R5LmZpcnN0Q2hpbGQpIHsgZWwuYXBwZW5kQ2hpbGQoZG9jLmJvZHkuZmlyc3RDaGlsZCk7IH0gfSBjYXRjaCAoZSkgeyBlbC50ZXh0Q29udGVudCA9IFN0cmluZyh2YWwpOyB9IH0gfVxcbmA7XHJcblxyXG4gICAgICAgIGNvbnN0IGNvZGVXaXRoSW5uZXJIdG1sU2FuaXRpemVkID0gdXBkYXRlZENvZGUucmVwbGFjZShcclxuICAgICAgICAgIC8oPzwhWydcImBdKVxcYihbYS16QS1aMC05XyRdKylcXC5pbm5lckhUTUxcXHMqPVxccyooW147LH1cXG5dKykvZyxcclxuICAgICAgICAgIChfLCB0YXJnZXQsIHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgIGhhc1JlcGxhY2VtZW50cyA9IHRydWU7XHJcbiAgICAgICAgICAgIHJldHVybiBgJHtoZWxwZXJOYW1lfSgke3RhcmdldH0sICR7dmFsdWV9KWA7XHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGlmIChoYXNSZXBsYWNlbWVudHMpIHtcclxuICAgICAgICAgIHVwZGF0ZWRDb2RlID0gaGVscGVyRGVmICsgY29kZVdpdGhJbm5lckh0bWxTYW5pdGl6ZWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyAyLiBTYW5pdGl6ZSByZWdlbmVyYXRvclJ1bnRpbWUgRnVuY3Rpb24gY29uc3RydWN0b3IgaW4gcG9seWZpbGxzXHJcbiAgICAgIGlmICh1cGRhdGVkQ29kZS5pbmNsdWRlcygnRnVuY3Rpb24oXCJyXCInKSkge1xyXG4gICAgICAgIHVwZGF0ZWRDb2RlID0gdXBkYXRlZENvZGUucmVwbGFjZShcclxuICAgICAgICAgIC9GdW5jdGlvblxcKFtcIiddcltcIiddLFxccypbXCInXXJlZ2VuZXJhdG9yUnVudGltZVxccyo9XFxzKnJbXCInXVxcKS9nLFxyXG4gICAgICAgICAgJyhmdW5jdGlvbihyKXsgaWYgKHR5cGVvZiBnbG9iYWxUaGlzICE9PSBcInVuZGVmaW5lZFwiKSBnbG9iYWxUaGlzLnJlZ2VuZXJhdG9yUnVudGltZSA9IHI7IH0pJyxcclxuICAgICAgICApO1xyXG4gICAgICAgIGhhc1JlcGxhY2VtZW50cyA9IHRydWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIDMuIFNhbml0aXplIEZ1bmN0aW9uKFwiYmluZGVyXCIsIC4uLikgY29uc3RydWN0b3IgaW4gZnVuY3Rpb24tYmluZCAvIGVzLWFic3RyYWN0IHBvbHlmaWxsc1xyXG4gICAgICBpZiAodXBkYXRlZENvZGUuaW5jbHVkZXMoJ0Z1bmN0aW9uKFwiYmluZGVyXCInKSkge1xyXG4gICAgICAgIHVwZGF0ZWRDb2RlID0gdXBkYXRlZENvZGUucmVwbGFjZShcclxuICAgICAgICAgIC9GdW5jdGlvblxccypcXChcXHMqW1wiJ11iaW5kZXJbXCInXVxccyosW1xcc1xcU10qP2JpbmRlclxcLmFwcGx5XFwodGhpcyxcXHMqYXJndW1lbnRzXFwpOz9cXHMqXFx9W1wiJ11cXHMqXFwpL2csXHJcbiAgICAgICAgICAnKGZ1bmN0aW9uKGJpbmRlcil7IHJldHVybiBmdW5jdGlvbigpeyByZXR1cm4gYmluZGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7IH07IH0pJyxcclxuICAgICAgICApO1xyXG4gICAgICAgIGhhc1JlcGxhY2VtZW50cyA9IHRydWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIDQuIFNhbml0aXplIFwiJWV2YWwlXCI6ZXZhbCBpbiBnZXQtaW50cmluc2ljIHBvbHlmaWxsXHJcbiAgICAgIGlmICh1cGRhdGVkQ29kZS5pbmNsdWRlcygnXCIlZXZhbCVcIjpldmFsJykgfHwgdXBkYXRlZENvZGUuaW5jbHVkZXMoXCInJWV2YWwlJzpldmFsXCIpKSB7XHJcbiAgICAgICAgdXBkYXRlZENvZGUgPSB1cGRhdGVkQ29kZS5yZXBsYWNlKC9bXCInXSVldmFsJVtcIiddXFxzKjpcXHMqZXZhbFxcYi9nLCAnXCIlZXZhbCVcIjp1bmRlZmluZWQnKTtcclxuICAgICAgICBoYXNSZXBsYWNlbWVudHMgPSB0cnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyA1LiBTYW5pdGl6ZSB3b3JrZXItdGltZXJzIGluIE1RVFQgdG8gdXNlIG5hdGl2ZSB0aW1lcnMgaW5zdGVhZCBvZiBibG9iOiB3b3JrZXJzIChhdm9pZHMgd2VicGFnZSBDU1AgdmlvbGF0aW9ucylcclxuICAgICAgaWYgKHVwZGF0ZWRDb2RlLmluY2x1ZGVzKFwiaXNSZWFjdE5hdGl2ZUJyb3dzZXJcIikgJiYgdXBkYXRlZENvZGUuaW5jbHVkZXMoXCJpc1dlYldvcmtlclwiKSkge1xyXG4gICAgICAgIHVwZGF0ZWRDb2RlID0gdXBkYXRlZENvZGUucmVwbGFjZShcclxuICAgICAgICAgIC9yZXR1cm5cXHMrKFthLXpBLVowLTlfJF0rKVxcLmRlZmF1bHRcXHMqJiZcXHMqIVxcMVxcLmlzV2ViV29ya2VyXFxzKiYmXFxzKiFcXDFcXC5pc1JlYWN0TmF0aXZlQnJvd3NlclxccypcXD9cXHMqKFthLXpBLVowLTlfJF0rKVxccyo6XFxzKihbYS16QS1aMC05XyRdKykvZyxcclxuICAgICAgICAgIFwicmV0dXJuICQzXCIsXHJcbiAgICAgICAgKTtcclxuICAgICAgICBoYXNSZXBsYWNlbWVudHMgPSB0cnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoaGFzUmVwbGFjZW1lbnRzKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGNvZGU6IHVwZGF0ZWRDb2RlLFxyXG4gICAgICAgICAgbWFwOiBudWxsLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfSxcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtcclxuICAgIGV4dGVuc2lvblNlY3VyaXR5U2FuaXRpemVyUGx1Z2luKCksXHJcbiAgICByZWFjdCgpLFxyXG4gICAgdGFpbHdpbmRjc3MoKSxcclxuICAgIHdlYkV4dGVuc2lvbih7XHJcbiAgICAgIG1hbmlmZXN0OiBnZW5lcmF0ZU1hbmlmZXN0LFxyXG4gICAgICBicm93c2VyOiB0YXJnZXRCcm93c2VyLFxyXG4gICAgfSksXHJcbiAgXSxcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1IsU0FBUyxvQkFBb0I7QUFDNVQsT0FBTyxXQUFXO0FBQ2xCLE9BQU8saUJBQWlCO0FBQ3hCLE9BQU8sZ0JBQWdCLG9CQUFvQjtBQUszQyxTQUFTLHNCQUFzQixTQUF1QjtBQUNwRCxRQUFNLGdCQUNKO0FBQ0YsUUFBTSx5QkFBeUI7QUFFL0IsTUFBSSxDQUFDLGNBQWMsS0FBSyxPQUFPLEdBQUc7QUFDaEMsVUFBTSxJQUFJO0FBQUEsTUFDUixrRUFBa0UsT0FBTztBQUFBLElBQzNFO0FBQUEsRUFDRjtBQUdBLFFBQU0sY0FBYyxRQUFRLE1BQU0sR0FBRyxFQUFFLENBQUMsRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDO0FBQ3RELE1BQUksQ0FBQyx1QkFBdUIsS0FBSyxXQUFXLEdBQUc7QUFDN0MsVUFBTSxJQUFJO0FBQUEsTUFDUixrQ0FBa0MsV0FBVztBQUFBLElBQy9DO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTSxnQkFBaUIsUUFBUSxJQUFJLFVBQW1DO0FBR3RFLFNBQVMsbUJBQW1CO0FBQzFCLFFBQU0sTUFBTSxhQUFhLGNBQWM7QUFFdkMsTUFBSSxDQUFDLElBQUksV0FBVyxPQUFPLElBQUksWUFBWSxVQUFVO0FBQ25ELFVBQU0sSUFBSTtBQUFBLE1BQ1I7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVBLHdCQUFzQixJQUFJLE9BQU87QUFFakMsUUFBTSx1QkFBdUIsSUFBSSxRQUFRLE1BQU0sR0FBRyxFQUFFLENBQUMsRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDO0FBRW5FLFFBQU0sYUFDSixrQkFBa0IsWUFDZCxFQUFFLFNBQVMsQ0FBQyxtQkFBbUIsRUFBRSxJQUNqQyxFQUFFLGdCQUFnQixvQkFBb0I7QUFFNUMsUUFBTSwwQkFDSixrQkFBa0IsWUFDZDtB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
