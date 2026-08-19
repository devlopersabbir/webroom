import { describe, expect, it } from "vitest";
import { canonicalizeUrl, getRoomId } from "./room-id";

describe("Room ID & URL Canonicalization", () => {
  it("normalizes scheme and hostname to lowercase", () => {
    const url1 = "HTTPS://EXAMPLE.COM/page";
    const url2 = "https://example.com/page";
    expect(canonicalizeUrl(url1)).toBe("https://example.com/page");
    expect(canonicalizeUrl(url1)).toBe(canonicalizeUrl(url2));
  });

  it("removes standard default ports (:80, :443)", () => {
    const url1 = "https://example.com:443/watch?v=123";
    const url2 = "https://example.com/watch?v=123";
    const urlHttp1 = "http://example.com:80/test";
    const urlHttp2 = "http://example.com/test";

    expect(canonicalizeUrl(url1)).toBe("https://example.com/watch?v=123");
    expect(canonicalizeUrl(url1)).toBe(canonicalizeUrl(url2));
    expect(canonicalizeUrl(urlHttp1)).toBe(canonicalizeUrl(urlHttp2));
  });

  it("normalizes trailing slashes and multiple slashes", () => {
    const url1 = "https://example.com/page/";
    const url2 = "https://example.com/page";
    const url3 = "https://example.com//page";

    expect(canonicalizeUrl(url1)).toBe("https://example.com/page");
    expect(canonicalizeUrl(url2)).toBe("https://example.com/page");
    expect(canonicalizeUrl(url3)).toBe("https://example.com/page");
  });

  it("strips common marketing and tracking query parameters", () => {
    const rawWithTracking =
      "https://example.com/article?id=123&utm_source=twitter&utm_medium=social&fbclid=XYZ123&gclid=ABC789";
    const cleanUrl = "https://example.com/article?id=123";

    expect(canonicalizeUrl(rawWithTracking)).toBe(canonicalizeUrl(cleanUrl));
  });

  it("sorts query parameters deterministically", () => {
    const urlA = "https://example.com/search?b=2&a=1&z=9";
    const urlB = "https://example.com/search?z=9&a=1&b=2";

    expect(canonicalizeUrl(urlA)).toBe("https://example.com/search?a=1&b=2&z=9");
    expect(canonicalizeUrl(urlA)).toBe(canonicalizeUrl(urlB));
  });

  it("discards URL fragments/hashes", () => {
    const urlWithHash = "https://example.com/docs#section-1";
    const urlNoHash = "https://example.com/docs";

    expect(canonicalizeUrl(urlWithHash)).toBe("https://example.com/docs");
    expect(canonicalizeUrl(urlWithHash)).toBe(canonicalizeUrl(urlNoHash));
  });

  it("generates deterministic SHA-256 room ID", async () => {
    const url1 = "https://youtube.com/watch?v=ABC123&utm_source=share";
    const url2 = "https://youtube.com/watch?v=ABC123";

    const roomId1 = await getRoomId(url1);
    const roomId2 = await getRoomId(url2);

    expect(roomId1).toHaveLength(64);
    expect(roomId1).toBe(roomId2);
  });

  it("produces different room IDs for distinct URLs", async () => {
    const roomIdA = await getRoomId("https://example.com/page-a");
    const roomIdB = await getRoomId("https://example.com/page-b");

    expect(roomIdA).not.toBe(roomIdB);
  });
});
