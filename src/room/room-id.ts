import { KNOWN_TRACKING_PARAMS } from "../shared/constants";

/**
 * Normalizes and canonicalizes a URL string for deterministic room identification.
 * 
 * Rules:
 * - Normalizes scheme to lowercase (e.g. HTTP -> http)
 * - Normalizes host to lowercase (e.g. EXAMPLE.COM -> example.com)
 * - Removes standard default ports (:80 for http, :443 for https)
 * - Normalizes pathname (removes duplicate slashes, strips trailing slash if not root)
 * - Strips known marketing/tracking query parameters (utm_*, fbclid, gclid, etc.)
 * - Sorts remaining query parameters alphabetically by key and value
 * - Discards URL fragment/hash
 */
export function canonicalizeUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    // If URL parsing fails, trim and return as is
    return rawUrl.trim().toLowerCase();
  }

  // Only handle standard web protocols
  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();

  // Normalize port
  let port = parsed.port;
  if ((protocol === "http:" && port === "80") || (protocol === "https:" && port === "443")) {
    port = "";
  }

  // Normalize pathname: collapse multiple slashes, remove trailing slash if path != "/"
  let pathname = parsed.pathname.replace(/\/+/g, "/");
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  if (!pathname) {
    pathname = "/";
  }

  // Filter and sort query parameters
  const filteredParams: [string, string][] = [];
  parsed.searchParams.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (!KNOWN_TRACKING_PARAMS.has(lowerKey) && !lowerKey.startsWith("utm_")) {
      filteredParams.push([key, value]);
    }
  });

  // Sort query params deterministically by key, then value
  filteredParams.sort((a, b) => {
    const keyCompare = a[0].localeCompare(b[0]);
    if (keyCompare !== 0) return keyCompare;
    return a[1].localeCompare(b[1]);
  });

  const searchParams = new URLSearchParams();
  for (const [k, v] of filteredParams) {
    searchParams.append(k, v);
  }

  const searchString = searchParams.toString();
  const hostWithPort = port ? `${hostname}:${port}` : hostname;
  const canonical = `${protocol}//${hostWithPort}${pathname}${searchString ? `?${searchString}` : ""}`;

  return canonical;
}

/**
 * Computes a deterministic SHA-256 room ID from a webpage URL.
 * 
 * @param url The raw URL string
 * @returns 64-character hexadecimal SHA-256 hash
 */
export async function getRoomId(url: string): Promise<string> {
  const canonical = canonicalizeUrl(url);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexString = hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return hexString;
}
