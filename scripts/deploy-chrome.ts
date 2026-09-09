import { existsSync, createReadStream, readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";
import chromeWebstoreUpload from "chrome-webstore-upload";

/**
 * Loads Chrome Web Store OAuth2 credentials from environment or local secret files
 */
function getCredentials(): {
  extensionId: string;
  publisherId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
} {
  let extensionId = process.env.CHROME_EXTENSION_ID || "";
  let publisherId = process.env.CHROME_PUBLISHER_ID || "";
  let clientId = process.env.CHROME_CLIENT_ID || "";
  let clientSecret = process.env.CHROME_CLIENT_SECRET || "";
  let refreshToken = process.env.CHROME_REFRESH_TOKEN || "";

  // Optional: Check local chrome_secrets.json or secret.txt if not in env
  const secretJsonPath = resolve(process.cwd(), "chrome_secrets.json");
  if ((!extensionId || !publisherId || !clientId || !clientSecret || !refreshToken) && existsSync(secretJsonPath)) {
    try {
      const data = JSON.parse(readFileSync(secretJsonPath, "utf-8"));
      if (!extensionId && data.extensionId) extensionId = data.extensionId;
      if (!publisherId && data.publisherId) publisherId = data.publisherId;
      if (!clientId && data.clientId) clientId = data.clientId;
      if (!clientSecret && data.clientSecret) clientSecret = data.clientSecret;
      if (!refreshToken && data.refreshToken) refreshToken = data.refreshToken;
    } catch {
      // Ignore JSON parse errors
    }
  }

  if (!extensionId || !publisherId || !clientId || !clientSecret || !refreshToken) {
    const missing: string[] = [];
    if (!extensionId) missing.push("CHROME_EXTENSION_ID");
    if (!publisherId) missing.push("CHROME_PUBLISHER_ID");
    if (!clientId) missing.push("CHROME_CLIENT_ID");
    if (!clientSecret) missing.push("CHROME_CLIENT_SECRET");
    if (!refreshToken) missing.push("CHROME_REFRESH_TOKEN");

    throw new Error(
      `[Chrome Deploy] Missing Chrome Web Store API credentials: ${missing.join(", ")}.\n` +
        "Please provide them as environment variables or inside chrome_secrets.json."
    );
  }

  return { extensionId, publisherId, clientId, clientSecret, refreshToken };
}

async function main() {
  console.log("🚀 [WebRoom] Preparing Chrome Extension for Chrome Web Store...");

  const args = process.argv.slice(2);
  const shouldPublish =
    args.includes("--publish") || process.env.CHROME_AUTO_PUBLISH === "true";
  const targetArg = args.find((a) => a.startsWith("--target="))?.split("=")[1];
  const publishTarget = (targetArg || process.env.CHROME_PUBLISH_TARGET || "default") as
    | "default"
    | "trustedTesters";

  const { extensionId, publisherId, clientId, clientSecret, refreshToken } = getCredentials();

  // 1. Read package version
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8"));
  const version = pkg.version;
  const zipPath = resolve(process.cwd(), `v${version}_chrome.zip`);

  // 2. Build Chrome extension bundle
  console.log(`📦 Building Chrome bundle (v${version})...`);
  const buildResult = spawnSync("bun", ["run", "build:chrome"], {
    stdio: "inherit",
    shell: true,
  });

  if (buildResult.status !== 0) {
    console.error("❌ Failed to build Chrome bundle.");
    process.exit(buildResult.status || 1);
  }

  // 3. Package extension into zip
  console.log("🗜️ Packaging Chrome extension zip...");
  const zipResult = spawnSync("bun", ["./zip.ts", "TARGET=chrome"], {
    stdio: "inherit",
    shell: true,
  });

  if (zipResult.status !== 0 || !existsSync(zipPath)) {
    console.error(`❌ Failed to create zip package at ${zipPath}`);
    process.exit(zipResult.status || 1);
  }

  // 4. Upload to Chrome Web Store
  console.log(`📤 Uploading ${zipPath} to Chrome Web Store (Extension ID: ${extensionId}, Publisher ID: ${publisherId})...`);
  const client = chromeWebstoreUpload({
    extensionId,
    publisherId,
    clientId,
    clientSecret,
    refreshToken,
  });

  try {
    const uploadStream = createReadStream(zipPath);
    const uploadRes = await client.uploadExisting(uploadStream);

    if (uploadRes.uploadState === "FAILED") {
      console.error("❌ Chrome Web Store upload failed:", uploadRes);
      process.exit(1);
    }

    console.log("✅ Successfully uploaded extension draft to Chrome Web Store!");
    console.log(`   Item ID: ${uploadRes.itemId}`);
    console.log(`   Upload State: ${uploadRes.uploadState}`);

    // 5. Optionally submit for review / publish
    if (shouldPublish) {
      console.log(`📢 Submitting item for review / publishing (target: ${publishTarget})...`);
      const publishRes = await client.publish(publishTarget);
      console.log("✅ Extension submitted for review / published!");
      console.log("   State:", publishRes.state || "SUBMITTED");
    } else {
      console.log("ℹ️ Extension uploaded as draft. To publish immediately, pass --publish or set CHROME_AUTO_PUBLISH=true.");
    }

    console.log(`🔗 Dashboard: https://chrome.google.com/webstore/devconsole/${publisherId}/${extensionId}`);
  } catch (err: any) {
    console.error("❌ Chrome Web Store deployment error:", err.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ " + (err?.message || err));
  process.exit(1);
});
