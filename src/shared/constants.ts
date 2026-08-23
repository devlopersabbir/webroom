import pkg from "../../package.json";

/**
 * Constants used across WebRoom presence and room lifecycle.
 */

// Application version dynamically matching package.json release SemVer
export const APP_VERSION = pkg.version;

// Heartbeat transmission interval in milliseconds (2.5 seconds)
export const HEARTBEAT_INTERVAL_MS = 2500;

// Suspected peer failure threshold in milliseconds (5 seconds = 2 missed heartbeats)
export const SUSPECTED_TIMEOUT_MS = 5000;

// Peer inactivity timeout threshold in milliseconds (10 seconds)
// Generous 4x heartbeat window ensures internet jitter never causes false disconnects.
export const PEER_TIMEOUT_MS = 10000;
export const NODE_TIMEOUT_MS = 10000;

// Peer store cleanup scan interval in milliseconds (1 second)
export const CLEANUP_INTERVAL_MS = 1000;

// Transport channel prefix
export const CHANNEL_PREFIX = "webroom:";

// Maximum allowed character length for an ephemeral chat message
export const MAX_MESSAGE_LENGTH = 2000;

// Predefined pool of playful emoji avatars for temporary peer identity
export const AVATARS: readonly string[] = [
  "🐸",
  "🦊",
  "🐼",
  "🐨",
  "🦄",
  "🐙",
  "🐳",
  "🦁",
  "🐯",
  "👻",
  "🤖",
  "👽",
  "🍕",
  "🌮",
  "🚀",
  "🔥",
  "🌈",
];

/**
 * Selects a random emoji avatar from the AVATARS pool.
 */
export function getRandomAvatar(): string {
  const index = Math.floor(Math.random() * AVATARS.length);
  return AVATARS[index] || "🐸";
}

// Common tracking / marketing / referral query parameter names to strip during URL canonicalization
export const KNOWN_TRACKING_PARAMS: ReadonlySet<string> = new Set([
  // Google Analytics & Ads
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_source_platform",
  "utm_creative_format",
  "utm_marketing_tactic",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "_ga",
  "_gl",

  // Facebook / Meta
  "fbclid",

  // Twitter / X
  "twclid",

  // Microsoft / Bing
  "msclkid",

  // TikTok
  "ttclid",

  // Mailchimp & Email services
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",

  // Generic referral & tracking
  "ref",
  "source",
  "ref_src",
  "ref_url",
  "yclid",
  "igshid",
  "si", // Spotify/YouTube share identifiers
]);
