import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./constants";
import pkg from "../../package.json";

describe("Strict Versioning Verification", () => {
  const semverRegex =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  const chromeManifestVersionRegex = /^\d+(\.\d+){1,3}$/;

  it("ensures package.json version adheres strictly to SemVer", () => {
    expect(pkg.version).toBeDefined();
    expect(typeof pkg.version).toBe("string");
    expect(semverRegex.test(pkg.version)).toBe(true);
  });

  it("ensures package.json version is compatible with Chrome Manifest version requirements", () => {
    const baseVersion = pkg.version.split("-")[0].split("+")[0];
    expect(chromeManifestVersionRegex.test(baseVersion)).toBe(true);
  });

  it("ensures APP_VERSION constant matches package.json version", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});
