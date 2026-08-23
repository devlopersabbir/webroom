import { describe, expect, it } from "vitest";
import { MemoryIdentityStorage } from "./identity-store";
import { NodeIdentity } from "./node-identity";

describe("NodeIdentity Subsystem (WebRoom v3 Phase 1)", () => {
  it("generates a new cryptographic keypair and derives a valid nodeId on first initialization", async () => {
    const storage = new MemoryIdentityStorage();
    const identity = await NodeIdentity.initialize(storage);

    expect(identity).toBeDefined();
    expect(identity.getNodeId()).toMatch(/^node_[a-f0-9]{32}$/);
    expect(identity.getPublicKey()).toBeDefined();
    expect(typeof identity.getPublicKey()).toBe("string");
    expect(identity.getPublicKey().length).toBeGreaterThan(30);
  });

  it("persists and restores the identical nodeId and public key on subsequent initializations", async () => {
    const storage = new MemoryIdentityStorage();
    const identity1 = await NodeIdentity.initialize(storage);
    const nodeId1 = identity1.getNodeId();
    const pubKey1 = identity1.getPublicKey();

    // Re-initialize with the same storage
    const identity2 = await NodeIdentity.initialize(storage);
    expect(identity2.getNodeId()).toBe(nodeId1);
    expect(identity2.getPublicKey()).toBe(pubKey1);
  });

  it("signs and verifies string and binary payloads successfully", async () => {
    const storage = new MemoryIdentityStorage();
    const identity = await NodeIdentity.initialize(storage);

    const messageString = "webroom:heartbeat:payload:test-123";
    const signature1 = await identity.sign(messageString);

    expect(typeof signature1).toBe("string");
    expect(signature1.length).toBeGreaterThan(0);

    const isValidString = await identity.verify(messageString, signature1);
    expect(isValidString).toBe(true);

    const binaryData = new Uint8Array([1, 2, 3, 4, 5, 42, 255]);
    const signature2 = await identity.sign(binaryData);
    const isValidBinary = await identity.verify(binaryData, signature2);
    expect(isValidBinary).toBe(true);
  });

  it("rejects tampered payloads", async () => {
    const storage = new MemoryIdentityStorage();
    const identity = await NodeIdentity.initialize(storage);

    const originalData = "original message payload";
    const signature = await identity.sign(originalData);

    const tamperedData = "tampered message payload";
    const isValid = await identity.verify(tamperedData, signature);
    expect(isValid).toBe(false);
  });

  it("verifies signatures using remote public keys and detects key mismatches", async () => {
    const storageA = new MemoryIdentityStorage();
    const storageB = new MemoryIdentityStorage();

    const nodeA = await NodeIdentity.initialize(storageA);
    const nodeB = await NodeIdentity.initialize(storageB);

    expect(nodeA.getNodeId()).not.toBe(nodeB.getNodeId());

    const message = "control:assign_relay:node_target";
    const signatureA = await nodeA.sign(message);

    // nodeB verifies message using nodeA's public key
    const isVerifiedByB = await nodeB.verify(message, signatureA, nodeA.getPublicKey());
    expect(isVerifiedByB).toBe(true);

    // Static helper verification
    const isVerifiedStatic = await NodeIdentity.verifySignature(
      message,
      signatureA,
      nodeA.getPublicKey()
    );
    expect(isVerifiedStatic).toBe(true);

    // Should fail if verified against nodeB's public key
    const isInvalidWithWrongKey = await nodeA.verify(message, signatureA, nodeB.getPublicKey());
    expect(isInvalidWithWrongKey).toBe(false);
  });

  it("gracefully regenerates a fresh keypair when corrupted data exists in storage", async () => {
    const storage = new MemoryIdentityStorage();
    await storage.set("webroom_v3_node_identity", "{ invalid json structure");

    const identity = await NodeIdentity.initialize(storage);
    expect(identity).toBeDefined();
    expect(identity.getNodeId()).toMatch(/^node_[a-f0-9]{32}$/);
  });

  it("never exposes private key material in toString(), toJSON(), or JSON.stringify()", async () => {
    const storage = new MemoryIdentityStorage();
    const identity = await NodeIdentity.initialize(storage);

    const stringified = JSON.stringify(identity);
    expect(stringified).toContain(identity.getNodeId());
    expect(stringified).toContain(identity.getPublicKey());
    expect(stringified).not.toContain("privateKey");
    expect(stringified).not.toContain('"d":'); // JWK private key scalar parameter

    const parsed = JSON.parse(stringified);
    expect(parsed).not.toHaveProperty("privateKey");
    expect(parsed).not.toHaveProperty("privateKeyJwk");

    expect(identity.toString()).toContain(identity.getNodeId());
    expect(identity.toString()).not.toContain("privateKey");
  });
});
