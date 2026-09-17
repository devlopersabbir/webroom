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

  it("strips www. prefix from hostname", () => {
    const withWww = "https://www.example.com/products/item";
    const withoutWww = "https://example.com/products/item";
    expect(canonicalizeUrl(withWww)).toBe("https://example.com/products/item");
    expect(canonicalizeUrl(withWww)).toBe(canonicalizeUrl(withoutWww));
  });

  it("strips default index documents (/index.html, /index.htm, /index.php)", () => {
    const urlHtml = "https://example.com/index.html";
    const urlHtm = "https://example.com/index.htm";
    const urlPhp = "https://example.com/index.php";
    const urlRoot = "https://example.com/";
    const urlSubdirHtml = "https://example.com/blog/index.html";
    const urlSubdir = "https://example.com/blog";

    expect(canonicalizeUrl(urlHtml)).toBe("https://example.com/");
    expect(canonicalizeUrl(urlHtm)).toBe("https://example.com/");
    expect(canonicalizeUrl(urlPhp)).toBe("https://example.com/");
    expect(canonicalizeUrl(urlHtml)).toBe(canonicalizeUrl(urlRoot));
    expect(canonicalizeUrl(urlSubdirHtml)).toBe(canonicalizeUrl(urlSubdir));
  });

  it("strips expanded social/referral parameters like feature, si, channel, spm", () => {
    const raw = "https://youtube.com/watch?v=dQw4w9WgXcQ&feature=shared&si=abcd1234&channel=UC123";
    const clean = "https://youtube.com/watch?v=dQw4w9WgXcQ";
    expect(canonicalizeUrl(raw)).toBe(canonicalizeUrl(clean));
  });

  it("generates deterministic SHA-256 room ID", async () => {
    const url1 = "https://www.youtube.com/watch?v=ABC123&utm_source=share&feature=shared";
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
