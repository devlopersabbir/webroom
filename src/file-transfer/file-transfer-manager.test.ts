import { describe, expect, it } from "vitest";
import { WebRoomMessage } from "../presence/protocol";
import { BinaryDataHandler, BinaryProgressHandler, MessageHandler, Transport } from "../transport/transport";
import { FileTransferManager } from "./file-transfer-manager";

class MockTestTransport implements Transport {
  public sentMessages: WebRoomMessage[] = [];
  public sentBinaries: { data: ArrayBuffer; options?: any }[] = [];
  private handlers = new Set<MessageHandler>();
  private binaryHandlers = new Set<BinaryDataHandler>();
  private binaryProgressHandlers = new Set<BinaryProgressHandler>();

  public start(): void {}
  public close(): void {}

  public send(message: WebRoomMessage, _targetPeerId?: string): void {
    this.sentMessages.push(message);
  }

  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public async sendBinary(data: ArrayBuffer | Uint8Array, options?: any): Promise<void> {
    const buffer = (data instanceof Uint8Array ? data.buffer : data) as ArrayBuffer;
    this.sentBinaries.push({ data: buffer, options });
    options?.onProgress?.(1.0);
  }

  public onBinaryMessage(handler: BinaryDataHandler): () => void {
    this.binaryHandlers.add(handler);
    return () => this.binaryHandlers.delete(handler);
  }

  public onBinaryReceiveProgress(handler: BinaryProgressHandler): () => void {
    this.binaryProgressHandlers.add(handler);
    return () => this.binaryProgressHandlers.delete(handler);
  }

  public emitMessage(msg: WebRoomMessage): void {
    for (const handler of this.handlers) {
      handler(msg);
    }
  }

  public emitBinary(data: ArrayBuffer, context: { peerId: string; metadata: any }): void {
    for (const handler of this.binaryHandlers) {
      handler(data, context);
    }
  }
}

describe("FileTransferManager Unit Tests", () => {
  it("initializes in empty idle state", () => {
    const transport = new MockTestTransport();
    const manager = new FileTransferManager("room1", "peer_alice", "🐱", transport);
    manager.start();

    expect(manager.getOutboundTransfer()).toBeNull();
    expect(manager.getInboundTransfer()).toBeNull();
    manager.destroy();
  });

  it("offers a file and sends FILE_OFFER with targetPeerId", async () => {
    const transport = new MockTestTransport();
    const manager = new FileTransferManager("room1", "peer_alice", "🐱", transport);
    manager.start();

    const fakeFile = new File(["hello antigravity"], "greeting.txt", { type: "text/plain" });
    const transferId = await manager.requestSendFile("peer_bob", "🐶", fakeFile);

    expect(transferId).toBeDefined();
    const outbound = manager.getOutboundTransfer();
    expect(outbound?.status).toBe("AWAITING_CONSENT");
    expect(outbound?.file.name).toBe("greeting.txt");

    expect(transport.sentMessages.length).toBe(1);
    const sent = transport.sentMessages[0];
    expect(sent.type).toBe("FILE_OFFER");
    expect((sent as any).targetPeerId).toBe("peer_bob");
    expect((sent as any).fileMeta.name).toBe("greeting.txt");

    manager.destroy();
  });

  it("handles incoming offer, accept, and reject flows", async () => {
    const transport = new MockTestTransport();
    const manager = new FileTransferManager("room1", "peer_bob", "🐶", transport);
    manager.start();

    // Alice sends offer to Bob
    transport.emitMessage({
      type: "FILE_OFFER",
      transferId: "tx_999",
      roomId: "room1",
      senderPeerId: "peer_alice",
      senderAvatar: "🐱",
      targetPeerId: "peer_bob",
      fileMeta: {
        id: "f_1",
        name: "test.pdf",
        size: 1024,
        type: "application/pdf",
      },
      timestamp: Date.now(),
    });

    const inbound = manager.getInboundTransfer();
    expect(inbound).not.toBeNull();
    expect(inbound?.transferId).toBe("tx_999");
    expect(inbound?.status).toBe("AWAITING_ACCEPTANCE");
    expect(inbound?.senderAvatar).toBe("🐱");

    // Bob accepts
    manager.acceptTransfer("tx_999");
    expect(manager.getInboundTransfer()?.status).toBe("RECEIVING");

    expect(transport.sentMessages.length).toBe(1);
    expect(transport.sentMessages[0].type).toBe("FILE_ACCEPT");
    expect((transport.sentMessages[0] as any).targetPeerId).toBe("peer_alice");

    manager.destroy();
  });

  it("handles end-to-end stream completion when receiving binary payload", () => {
    const transport = new MockTestTransport();
    const manager = new FileTransferManager("room1", "peer_bob", "🐶", transport);
    manager.start();

    // Inbound transfer waiting
    transport.emitMessage({
      type: "FILE_OFFER",
      transferId: "tx_binary_1",
      roomId: "room1",
      senderPeerId: "peer_alice",
      senderAvatar: "🐱",
      targetPeerId: "peer_bob",
      fileMeta: {
        id: "f_1",
        name: "sample.txt",
        size: 11,
        type: "text/plain",
      },
      timestamp: Date.now(),
    });

    manager.acceptTransfer("tx_binary_1");

    // Alice streams binary payload
    const testData = new TextEncoder().encode("hello world").buffer;
    transport.emitBinary(testData, {
      peerId: "peer_alice",
      metadata: { transferId: "tx_binary_1" },
    });

    const completedInbound = manager.getInboundTransfer();
    expect(completedInbound?.status).toBe("COMPLETED");
    expect(completedInbound?.progress).toBe(1.0);
    expect(completedInbound?.bytesReceived).toBe(testData.byteLength);

    manager.destroy();
  });

  it("handles peer departure during pending transfer", async () => {
    const transport = new MockTestTransport();
    const manager = new FileTransferManager("room1", "peer_alice", "🐱", transport);
    manager.start();

    const fakeFile = new File(["data"], "doc.txt", { type: "text/plain" });
    await manager.requestSendFile("peer_bob", "🐶", fakeFile);

    expect(manager.getOutboundTransfer()?.status).toBe("AWAITING_CONSENT");

    // Bob leaves the room
    manager.handlePeerLeft("peer_bob");

    expect(manager.getOutboundTransfer()?.status).toBe("CANCELLED");
    manager.destroy();
  });
});
