import { zip } from "zip-a-folder";
import { readJsonFile } from "vite-plugin-web-extension";
import { rmSync } from "fs";
import { execSync } from "child_process";

const compress = async (target: "chrome" | "firefox", version: string) => {
  console.log(`\n[WebRoom Release] Building ${target} bundle...`);
  execSync(`bun run build:${target}`, {
    stdio: "inherit",
    env: { ...process.env, TARGET: target },
  });
  const zipPath = `./v${version}_${target}.zip`;
  await zip("dist", zipPath);
  console.log(`[WebRoom Release] Successfully created ${zipPath}`);
  rmSync("dist", { recursive: true, force: true });
};

(async () => {
  try {
    const pkg = readJsonFile("package.json");
    const args = process.argv.slice(2);
    const cliArg =
      args.find((a) => a.startsWith("TARGET="))?.split("=")[1] ||
      args.find((a) => a === "chrome" || a === "firefox" || a === "all");
    const target = (cliArg || process.env.TARGET)?.toLowerCase() as
      | "chrome"
      | "firefox"
      | "all"
      | undefined;

    if (target === "chrome" || target === "firefox") {
      await compress(target, pkg.version);
    } else {
      await compress("chrome", pkg.version);
      await compress("firefox", pkg.version);
    }
    console.log("\n[WebRoom Release] All zip packages ready for release.\n");
    process.exit(0);
  } catch (err) {
    console.error("\n[WebRoom Release] Packaging failed:", err);
    process.exit(1);
  }
})();
