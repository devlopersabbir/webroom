import { zip } from "zip-a-folder";
import { readJsonFile } from "vite-plugin-web-extension";
import { rmSync, mkdirSync } from "fs";
import { execSync } from "child_process";

const compress = async (target: "chrome" | "firefox", version: string) => {
  console.log(`\n[WebRoom Release] Building ${target} bundle...`);
  execSync(`bun run build:${target}`, { stdio: "inherit" });
  mkdirSync("./release", { recursive: true });
  const zipPath = `./release/v${version}_${target}.zip`;
  await zip("dist", zipPath);
  console.log(`[WebRoom Release] Successfully created ${zipPath}`);
  rmSync("dist", { recursive: true, force: true });
};

(async () => {
  const pkg = readJsonFile("package.json");
  const args = process.argv[2];
  const target = args?.split("TARGET=")[1]?.toLowerCase() as "chrome" | "firefox" | "all" | undefined;

  if (target === "chrome" || target === "firefox") {
    await compress(target, pkg.version);
  } else {
    await compress("chrome", pkg.version);
    await compress("firefox", pkg.version);
  }
  console.log("\n[WebRoom Release] All zip packages ready in ./release folder.\n");
})();
