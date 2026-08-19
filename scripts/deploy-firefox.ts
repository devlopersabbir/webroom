import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

/**
 * Loads AMO credentials from environment or local secret.txt file
 */
function getCredentials(): { issuer: string; secret: string; id?: string } {
  let issuer = process.env.AMO_JWT_ISSUER || "";
  let secret = process.env.AMO_JWT_SECRET || "";
  const id = process.env.AMO_EXTENSION_ID || "webroom@devlopersabbir.github.io";

  // Fallback to local secret.txt if environment variables are not set
  const secretPath = resolve(process.cwd(), "secret.txt");
  if ((!issuer || !secret) && existsSync(secretPath)) {
    const content = readFileSync(secretPath, "utf-8");
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length >= 2) {
      if (!issuer) issuer = lines[0];
      if (!secret) secret = lines[1];
    }
  }

  if (!issuer || !secret) {
    throw new Error(
      "[Firefox Deploy] Missing AMO API credentials. Please set AMO_JWT_ISSUER and AMO_JWT_SECRET in environment or secret.txt."
    );
  }

  return { issuer, secret, id };
}

async function main() {
  console.log("🚀 [WebRoom] Preparing Firefox Add-on for Mozilla Developer Hub (AMO)...");

  const { issuer, secret, id } = getCredentials();

  // 1. Build Firefox extension
  console.log("📦 Building Firefox bundle...");
  const buildResult = spawnSync("bun", ["run", "build:firefox"], {
    stdio: "inherit",
    shell: true,
  });

  if (buildResult.status !== 0) {
    console.error("❌ Failed to build Firefox bundle.");
    process.exit(buildResult.status || 1);
  }

  // 2. Validate with web-ext lint
  console.log("🔍 Linting extension package...");
  const lintResult = spawnSync("bunx", ["web-ext", "lint", "--source-dir=dist"], {
    stdio: "inherit",
    shell: true,
  });

  if (lintResult.status !== 0) {
    console.error("❌ web-ext lint failed.");
    process.exit(lintResult.status || 1);
  }

  // 3. Create sources archive for Mozilla Review requirement
  console.log("🗜️ Archiving source code for Mozilla review...");
  spawnSync("git", ["archive", "--format=zip", "--output=sources.zip", "HEAD"], {
    stdio: "inherit",
    shell: true,
  });

  // 4. Submit / Sign to Mozilla Add-ons (AMO)
  const channel = (process.env.AMO_CHANNEL as "listed" | "unlisted") || "listed";

  console.log(`📤 Submitting to Mozilla Add-ons (Channel: ${channel})...`);
  const signArgs = [
    "web-ext",
    "sign",
    "--source-dir=dist",
    existsSync("sources.zip") ? "--source-code=sources.zip" : "",
    `--channel=${channel}`,
    `--api-key=${issuer}`,
    `--api-secret=${secret}`,
    `--id=${id}`,
    "--approval-notes=WebRoom is built with TypeScript and Vite. Run 'bun install && bun run build:firefox' to generate the dist bundle.",
  ].filter(Boolean);

  const signResult = spawnSync("bunx", signArgs, {
    stdio: "inherit",
    shell: true,
  });

  if (signResult.status !== 0) {
    console.error("❌ Failed to submit to Mozilla Add-ons.");
    process.exit(signResult.status || 1);
  }

  console.log("✅ Successfully submitted to Mozilla Developer Hub!");
}

main().catch((err) => {
  console.error("❌ Deploy error:", err);
  process.exit(1);
});
