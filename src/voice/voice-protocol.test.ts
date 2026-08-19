import { describe, expect, it } from "vitest";
import { isValidWebRoomMessage } from "../presence/protocol";
import {
  isValidVoiceSignalingMessage,
  VoiceAnswerMessage,
  VoiceIceCandidateMessage,
  VoiceOfferMessage,
  VoiceStateMessage,
} from "./voice-protocol";

describe("Voice Protocol & Message Validation", () => {
  const roomId = "room-abc";
  const peerId = "peer_1";
  const targetPeerId = "peer_2";

  it("validates a well-formed VOICE_OFFER message", () => {
    const offer: VoiceOfferMessage = {
      type: "VOICE_OFFER",
      roomId,
      peerId,
      targetPeerId,
      sdp: { type: "offer", sdp: "v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" },
      timestamp: Date.now(),
    };

    expect(isValidVoiceSignalingMessage(offer, roomId)).toBe(true);
    expect(isValidWebRoomMessage(offer, roomId)).toBe(true);
  });

  it("validates a well-formed VOICE_ANSWER message", () => {
    const answer: VoiceAnswerMessage = {
      type: "VOICE_ANSWER",
      roomId,
      peerId,
      targetPeerId,
      sdp: { type: "answer", sdp: "v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" },
      timestamp: Date.now(),
    };

    expect(isValidVoiceSignalingMessage(answer, roomId)).toBe(true);
    expect(isValidWebRoomMessage(answer, roomId)).toBe(true);
  });

  it("validates a well-formed VOICE_ICE_CANDIDATE message", () => {
    const candidateMsg: VoiceIceCandidateMessage = {
      type: "VOICE_ICE_CANDIDATE",
      roomId,
      peerId,
      targetPeerId,
      candidate: { candidate: "candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host", sdpMid: "0", sdpMLineIndex: 0 },
      timestamp: Date.now(),
    };

    expect(isValidVoiceSignalingMessage(candidateMsg, roomId)).toBe(true);
    expect(isValidWebRoomMessage(candidateMsg, roomId)).toBe(true);
  });

  it("validates a well-formed VOICE_STATE message", () => {
    const stateMsg: VoiceStateMessage = {
      type: "VOICE_STATE",
      roomId,
      peerId,
      isMicOn: true,
      timestamp: Date.now(),
    };

    expect(isValidVoiceSignalingMessage(stateMsg, roomId)).toBe(true);
    expect(isValidWebRoomMessage(stateMsg, roomId)).toBe(true);
  });

  it("rejects messages with mismatched roomId", () => {
    const offer: VoiceOfferMessage = {
      type: "VOICE_OFFER",
      roomId: "other-room",
      peerId,
      targetPeerId,
      sdp: { type: "offer", sdp: "sdp-data" },
      timestamp: Date.now(),
    };

    expect(isValidVoiceSignalingMessage(offer, roomId)).toBe(false);
    expect(isValidWebRoomMessage(offer, roomId)).toBe(false);
  });

  it("rejects malformed or incomplete messages", () => {
    expect(isValidVoiceSignalingMessage(null)).toBe(false);
    expect(isValidVoiceSignalingMessage({})).toBe(false);
    expect(isValidVoiceSignalingMessage({ type: "VOICE_OFFER", roomId, peerId })).toBe(false);
    expect(isValidVoiceSignalingMessage({ type: "VOICE_STATE", roomId, peerId, isMicOn: "not-a-boolean", timestamp: 123 })).toBe(false);
  });
});
