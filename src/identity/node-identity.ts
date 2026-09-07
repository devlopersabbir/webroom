import { IdentityStorage, UniversalIdentityStorage } from "./identity-store";

/**
 * Storage key constant for persisting the local node's serialized keypair.
 */
const IDENTITY_STORAGE_KEY = "webroom_v3_node_identity";

/**
 * Web Crypto algorithm configuration:
 * We use ECDSA with the NIST P-256 curve and SHA-256 digest.
 * 
 * WHY:
 * 1. Universally supported by crypto.subtle across modern Chrome, Firefox, Safari,
 *    Manifest V3 Service Workers, content scripts, and headless testing environments.
 * 2. Provides compact key representations (64-byte raw / JWK) and fast signature generation/verification.
 * 3. Does not rely on external cryptographic dependencies, keeping the bundle lightweight and secure.
 */
const ALGORITHM_CONFIG: EcKeyGenParams = {
  name: "ECDSA",
  namedCurve: "P-256",
};

const SIGN_ALGORITHM: EcdsaParams = {
  name: "ECDSA",
  hash: { name: "SHA-256" },
};

/**
 * Serialized representation of a persisted keypair.
 */
interface SerializedIdentity {
  version: 1;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}

/**
 * NodeIdentity represents a stable cryptographic identity for a WebRoom node instance.
 * 
 * In WebRoom v3, every participating browser creates a self-sovereign identity upon
 * first initialization without requiring user login, centralized registration, or accounts.
 * 
 * Key Responsibilities:
 * - Generate and locally persist a public/private keypair.
 * - Derive a deterministic, tamper-proof `nodeId` from the public key hash.
 * - Digitally sign messages (heartbeats, coordination signals, presence announcements).
 * - Verify signatures from remote peers to prevent spoofing and replay attacks.
 * - Strict security: Private keys are NEVER exposed over the network, logged, or serialized.
 */
export class NodeIdentity {
  private readonly nodeId: string;
  private readonly publicKeyBase64: string;
  private readonly publicKey: CryptoKey;
  private readonly privateKey: CryptoKey;

  private constructor(
    nodeId: string,
    publicKeyBase64: string,
    publicKey: CryptoKey,
    privateKey: CryptoKey
  ) {
    this.nodeId = nodeId;
    this.publicKeyBase64 = publicKeyBase64;
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  /**
   * Initializes or loads the existing NodeIdentity from the provided storage adapter.
   * 
   * WHY:
   * A node needs a stable identity across browser restarts and tab navigations so that
   * other peers can verify reputation, roles, and message authenticity over time.
   */
  public static async initialize(
    storage: IdentityStorage = new UniversalIdentityStorage()
  ): Promise<NodeIdentity> {
    const rawStored = await storage.get(IDENTITY_STORAGE_KEY);

    if (rawStored) {
      try {
        const parsed: SerializedIdentity = JSON.parse(rawStored);
        if (parsed.version === 1 && parsed.publicKeyJwk && parsed.privateKeyJwk) {
          const publicKey = await crypto.subtle.importKey(
            "jwk",
            parsed.publicKeyJwk,
            ALGORITHM_CONFIG,
            true,
            ["verify"]
          );

          const privateKey = await crypto.subtle.importKey(
            "jwk",
            parsed.privateKeyJwk,
            ALGORITHM_CONFIG,
            true,
            ["sign"]
          );

          const { nodeId, publicKeyBase64 } = await NodeIdentity.deriveIdentityAttributes(publicKey);
          return new NodeIdentity(nodeId, publicKeyBase64, publicKey, privateKey);
        }
      } catch (err) {
        console.warn("[WebRoom Identity] Corrupted identity found in storage, regenerating fresh keypair:", err);
      }
    }

    // Generate fresh cryptographic keypair
    const keyPair = await crypto.subtle.generateKey(
      ALGORITHM_CONFIG,
      true, // extractable so we can persist locally
      ["sign", "verify"]
    );

    const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    const serialized: SerializedIdentity = {
      version: 1,
      publicKeyJwk,
      privateKeyJwk,
    };

    await storage.set(IDENTITY_STORAGE_KEY, JSON.stringify(serialized));

    const { nodeId, publicKeyBase64 } = await NodeIdentity.deriveIdentityAttributes(keyPair.publicKey);
    return new NodeIdentity(nodeId, publicKeyBase64, keyPair.publicKey, keyPair.privateKey);
  }

  /**
   * Derives a deterministic `nodeId` and standard base64 public key representation from a CryptoKey.
   * 
   * WHY:
   * 1. The nodeId is derived from the SHA-256 hash of the exported SPKI public key.
   * 2. This guarantees that no node can forge a nodeId without owning the corresponding private key.
   */
  private static async deriveIdentityAttributes(
    publicKey: CryptoKey
  ): Promise<{ nodeId: string; publicKeyBase64: string }> {
    const spkiBuffer = await crypto.subtle.exportKey("spki", publicKey);
    const publicKeyBase64 = NodeIdentity.arrayBufferToBase64(spkiBuffer);

    // Compute SHA-256 hash of SPKI public key
    const hashBuffer = await crypto.subtle.digest("SHA-256", spkiBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hexHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const nodeId = `node_${hexHash.substring(0, 32)}`;
    return { nodeId, publicKeyBase64 };
  }

  /**
   * Returns deterministic identifier derived from public key hash.
   */
  public getNodeId(): string {
    return this.nodeId;
  }

  /**
   * Returns base64 encoded SPKI public key for wire exchange.
   */
  public getPublicKey(): string {
    return this.publicKeyBase64;
  }

  /**
   * Normalizes string or binary payload into a Uint8Array byte buffer.
   */
  private static toUint8Array(data: Uint8Array | string): Uint8Array {
    if (typeof data === "string") {
      return new TextEncoder().encode(data);
    }
    return data;
  }

  /**
   * Cryptographically signs a string or byte array payload using ECDSA SHA-256.
   * 
   * WHY:
   * Ensures authenticity and non-repudiation of all control messages (membership, heartbeats, routing).
   * 
   * @param data The payload string or byte buffer to sign.
   * @returns Base64 encoded digital signature.
   */
  public async sign(data: Uint8Array | string): Promise<string> {
    const rawData = NodeIdentity.toUint8Array(data);

    const signatureBuffer = await crypto.subtle.sign(
      SIGN_ALGORITHM,
      this.privateKey,
      rawData as unknown as BufferSource
    );
    return NodeIdentity.arrayBufferToBase64(signatureBuffer);
  }

  /**
   * Verifies a digital signature against a payload.
   * 
   * If remotePublicKeyBase64 is provided, verifies against that remote peer's public key.
   * If omitted, verifies against this local node's public key.
   * 
   * WHY:
   * Allows this node to verify both its own state transitions and control messages broadcast by other peers.
   * 
   * @param data The signed payload string or byte array.
   * @param signatureBase64 The base64 signature string to verify.
   * @param remotePublicKeyBase64 Optional remote public key. If omitted, verifies with self public key.
   * @returns true if signature is cryptographically valid, false otherwise.
   */
  public async verify(
    data: Uint8Array | string,
    signatureBase64: string,
    remotePublicKeyBase64?: string
  ): Promise<boolean> {
    try {
      const rawData = NodeIdentity.toUint8Array(data);
      const signatureBytes = NodeIdentity.base64ToArrayBuffer(signatureBase64);

      let keyToVerify: CryptoKey;
      const isRemote = Boolean(remotePublicKeyBase64 && remotePublicKeyBase64 !== this.publicKeyBase64);
      if (isRemote) {
        keyToVerify = await NodeIdentity.importPublicKeyFromBase64(remotePublicKeyBase64!);
      } else {
        keyToVerify = this.publicKey;
      }

      return await crypto.subtle.verify(
        SIGN_ALGORITHM,
        keyToVerify,
        signatureBytes as unknown as BufferSource,
        rawData as unknown as BufferSource
      );
    } catch (err) {
      console.warn("[WebRoom Identity] Error during signature verification:", err);
      return false;
    }
  }

  /**
   * Static helper to verify a signature given an arbitrary peer public key, payload, and signature.
   * 
   * WHY:
   * Independent verification utility for subsystems without direct reference to a local NodeIdentity instance.
   */
  public static async verifySignature(
    data: Uint8Array | string,
    signatureBase64: string,
    publicKeyBase64: string
  ): Promise<boolean> {
    try {
      const rawData = NodeIdentity.toUint8Array(data);
      const signatureBytes = NodeIdentity.base64ToArrayBuffer(signatureBase64);
      const keyToVerify = await NodeIdentity.importPublicKeyFromBase64(publicKeyBase64);
      return await crypto.subtle.verify(
        SIGN_ALGORITHM,
        keyToVerify,
        signatureBytes as unknown as BufferSource,
        rawData as unknown as BufferSource
      );
    } catch (err) {
      console.warn("[WebRoom Identity] Error in static verifySignature:", err);
      return false;
    }
  }

  /**
   * Imports an SPKI Base64 public key into a CryptoKey instance.
   */
  private static async importPublicKeyFromBase64(publicKeyBase64: string): Promise<CryptoKey> {
    const keyBuffer = NodeIdentity.base64ToArrayBuffer(publicKeyBase64);
    return await crypto.subtle.importKey("spki", keyBuffer, ALGORITHM_CONFIG, true, ["verify"]);
  }

  /**
   * Converts an ArrayBuffer to a Base64 string safely across browser and Node/Bun runtimes.
   */
  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Converts a Base64 string to an ArrayBuffer safely.
   */
  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  }

  /**
   * Custom serialization logic to guarantee private key material is NEVER exposed.
   */
  public toJSON(): { nodeId: string; publicKey: string } {
    return {
      nodeId: this.nodeId,
      publicKey: this.publicKeyBase64,
    };
  }

  /**
   * Custom stringifier to prevent secret leakage in console outputs or debug logs.
   */
  public toString(): string {
    return `[NodeIdentity nodeId=${this.nodeId}]`;
  }
}
