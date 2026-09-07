import { describe, expect, it } from "vitest";
import {
  formatFileSize,
  isValidFileMetadata,
  isValidFileTransferMessage,
} from "./file-transfer-protocol";

describe("File Transfer Protocol & Message Validation", () => {
  it("formats file size into human-readable strings correctly", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(2048 * 1024)).toBe("2.0 MB");
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe("1.50 GB");
  });

  it("validates well-formed FileMetadata", () => {
    expect(
      isValidFileMetadata({
        id: "f_123",
        name: "test.pdf",
        size: 1024,
        type: "application/pdf",
      }),
    ).toBe(true);

    expect(isValidFileMetadata(null)).toBe(false);
    expect(isValidFileMetadata({})).toBe(false);
    expect(
      isValidFileMetadata({
        id: "",
        name: "test.pdf",
        size: 1024,
        type: "application/pdf",
      }),
    ).toBe(false);
  });

  it("validates a well-formed FILE_OFFER message", () => {
    const offer = {
      type: "FILE_OFFER",
      transferId: "tx_123",
      roomId: "room_alpha",
      senderPeerId: "peer_alice",
      senderAvatar: "🐱",
      targetPeerId: "peer_bob",
      fileMeta: {
        id: "f_123",
        name: "document.pdf",
        size: 5000,
        type: "application/pdf",
      },
      timestamp: Date.now(),
    };

    expect(isValidFileTransferMessage(offer)).toBe(true);
    expect(isValidFileTransferMessage(offer, "room_alpha")).toBe(true);
    expect(isValidFileTransferMessage(offer, "room_beta")).toBe(false);
  });

  it("validates FILE_ACCEPT, FILE_REJECT, and FILE_CANCEL messages", () => {
    const accept = {
      type: "FILE_ACCEPT",
      transferId: "tx_123",
      roomId: "room_alpha",
      receiverPeerId: "peer_bob",
      targetPeerId: "peer_alice",
      timestamp: Date.now(),
    };
    expect(isValidFileTransferMessage(accept)).toBe(true);

    const reject = {
      type: "FILE_REJECT",
      transferId: "tx_123",
      roomId: "room_alpha",
      receiverPeerId: "peer_bob",
      targetPeerId: "peer_alice",
      reason: "User declined",
      timestamp: Date.now(),
    };
    expect(isValidFileTransferMessage(reject)).toBe(true);

    const cancel = {
      type: "FILE_CANCEL",
      transferId: "tx_123",
      roomId: "room_alpha",
      peerId: "peer_alice",
      targetPeerId: "peer_bob",
      reason: "Sender cancelled",
      timestamp: Date.now(),
    };
    expect(isValidFileTransferMessage(cancel)).toBe(true);
  });

  it("rejects malformed messages", () => {
    expect(isValidFileTransferMessage(null)).toBe(false);
    expect(isValidFileTransferMessage("random string")).toBe(false);
    expect(isValidFileTransferMessage({ type: "UNKNOWN" })).toBe(false);
    expect(
      isValidFileTransferMessage({
        type: "FILE_OFFER",
        transferId: "tx_1",
        roomId: "room_1",
        senderPeerId: "alice",
        targetPeerId: "bob",
        // missing avatar and fileMeta
      }),
    ).toBe(false);
  });
});
