package main

import (
	"encoding/json"
	"hash/fnv"
	"sync"
	"sync/atomic"
	"time"
)

const (
	numHubShards      = 64
	sendBufferSize    = 64
	defaultMaxPerRoom = 250
)

// Client represents a single connected WebSocket peer in a room.
type Client struct {
	peerID string
	roomID string
	send   chan []byte
	closed atomic.Bool
}

func newClient(roomID, peerID string) *Client {
	return &Client{
		peerID: peerID,
		roomID: roomID,
		send:   make(chan []byte, sendBufferSize),
	}
}

// Enqueue attempts a non-blocking write to the client's outbound buffer.
// Returns false if the client is closed or its buffer is full (slow consumer).
func (c *Client) Enqueue(msg []byte) bool {
	if c.closed.Load() {
		return false
	}
	select {
	case c.send <- msg:
		return true
	default:
		// Drop slow consumer to protect room fan-out latency
		c.Close()
		return false
	}
}

func (c *Client) Close() {
	if c.closed.CompareAndSwap(false, true) {
		close(c.send)
	}
}

// Room holds the active clients for a single hashed roomId.
type Room struct {
	mu      sync.RWMutex
	clients map[string]*Client // peerID -> *Client
}

type hubShard struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

// Hub manages all active rooms sharded across 64 buckets to minimize lock contention
// under high concurrency (tens to hundreds of thousands of connections).
type Hub struct {
	shards       [numHubShards]hubShard
	maxPerRoom   int
	totalConns   atomic.Int64
	totalRooms   atomic.Int64
}

func NewHub(maxPerRoom int) *Hub {
	if maxPerRoom <= 0 {
		maxPerRoom = defaultMaxPerRoom
	}
	h := &Hub{maxPerRoom: maxPerRoom}
	for i := range h.shards {
		h.shards[i].rooms = make(map[string]*Room)
	}
	return h
}

func (h *Hub) shardFor(roomID string) *hubShard {
	hasher := fnv.New32a()
	_, _ = hasher.Write([]byte(roomID))
	return &h.shards[hasher.Sum32()%numHubShards]
}

func (h *Hub) Stats() (conns int64, rooms int64) {
	return h.totalConns.Load(), h.totalRooms.Load()
}

// Join registers a client in its room, replacing any stale socket for the same peerID.
// Returns the list of already-connected peerIDs (excluding self) or false if room is full.
func (h *Hub) Join(c *Client) (activePeers []string, ok bool) {
	shard := h.shardFor(c.roomID)

	shard.mu.Lock()
	room, exists := shard.rooms[c.roomID]
	if !exists {
		room = &Room{clients: make(map[string]*Client)}
		shard.rooms[c.roomID] = room
		h.totalRooms.Add(1)
	}
	shard.mu.Unlock()

	room.mu.Lock()
	if existing, dup := room.clients[c.peerID]; dup {
		existing.Close()
		delete(room.clients, c.peerID)
		h.totalConns.Add(-1)
	} else if len(room.clients) >= h.maxPerRoom {
		room.mu.Unlock()
		return nil, false
	}

	activePeers = make([]string, 0, len(room.clients))
	for pid := range room.clients {
		activePeers = append(activePeers, pid)
	}

	room.clients[c.peerID] = c
	h.totalConns.Add(1)
	room.mu.Unlock()

	// Send welcome snapshot to joining client
	welcomeBytes, err := json.Marshal(welcomeEnvelope{
		Type:      "welcome",
		RoomID:    c.roomID,
		PeerID:    c.peerID,
		Peers:     activePeers,
		Timestamp: time.Now().UnixMilli(),
	})
	if err == nil {
		c.Enqueue(welcomeBytes)
	}

	// Notify existing peers of the new arrival
	joinBytes, err := json.Marshal(peerLifecycleEnvelope{
		Type:      "peer_join",
		RoomID:    c.roomID,
		PeerID:    c.peerID,
		Timestamp: time.Now().UnixMilli(),
	})
	if err == nil {
		h.broadcastRaw(room, c, joinBytes)
	}

	return activePeers, true
}

// Leave removes a client from its room, notifies remaining peers, and evicts empty rooms.
func (h *Hub) Leave(c *Client) {
	shard := h.shardFor(c.roomID)

	shard.mu.RLock()
	room, exists := shard.rooms[c.roomID]
	shard.mu.RUnlock()
	if !exists {
		return
	}

	room.mu.Lock()
	current, ok := room.clients[c.peerID]
	if !ok || current != c {
		// Already replaced by a newer connection for the same peerID
		room.mu.Unlock()
		return
	}
	delete(room.clients, c.peerID)
	h.totalConns.Add(-1)
	isEmpty := len(room.clients) == 0
	room.mu.Unlock()

	if isEmpty {
		// Re-check under shard lock before evicting to avoid racing with a concurrent Join
		shard.mu.Lock()
		if r, stillExists := shard.rooms[c.roomID]; stillExists && r == room {
			room.mu.RLock()
			if len(room.clients) == 0 {
				delete(shard.rooms, c.roomID)
				h.totalRooms.Add(-1)
			}
			room.mu.RUnlock()
		}
		shard.mu.Unlock()
		return
	}

	leaveBytes, err := json.Marshal(peerLifecycleEnvelope{
		Type:      "peer_leave",
		RoomID:    c.roomID,
		PeerID:    c.peerID,
		Timestamp: time.Now().UnixMilli(),
	})
	if err == nil {
		h.broadcastRaw(room, c, leaveBytes)
	}
}

// Relay forwards a payload to a specific targetPeerID or broadcasts to all other peers in the room.
func (h *Hub) Relay(sender *Client, targetPeerID string, payload json.RawMessage) {
	shard := h.shardFor(sender.roomID)
	shard.mu.RLock()
	room := shard.rooms[sender.roomID]
	shard.mu.RUnlock()
	if room == nil {
		return
	}

	outbound, err := json.Marshal(outboundRelayEnvelope{
		Type:       "relay",
		FromPeerID: sender.peerID,
		Payload:    payload,
	})
	if err != nil {
		return
	}

	if targetPeerID != "" {
		h.sendToPeerRaw(room, targetPeerID, sender, outbound)
	} else {
		h.broadcastRaw(room, sender, outbound)
	}
}

// ForwardRtcSignal delivers a WebRTC offer/answer/ICE signal directly to targetPeerID.
func (h *Hub) ForwardRtcSignal(sender *Client, targetPeerID string, signal json.RawMessage) {
	if targetPeerID == "" || len(signal) == 0 {
		return
	}
	shard := h.shardFor(sender.roomID)
	shard.mu.RLock()
	room := shard.rooms[sender.roomID]
	shard.mu.RUnlock()
	if room == nil {
		return
	}

	outbound, err := json.Marshal(outboundRtcSignalEnvelope{
		Type:       "rtc_signal",
		FromPeerID: sender.peerID,
		Signal:     signal,
	})
	if err != nil {
		return
	}

	h.sendToPeerRaw(room, targetPeerID, sender, outbound)
}

func (h *Hub) sendToPeerRaw(room *Room, targetPeerID string, sender *Client, data []byte) {
	room.mu.RLock()
	target := room.clients[targetPeerID]
	room.mu.RUnlock()

	if target != nil && target != sender {
		target.Enqueue(data)
	}
}

func (h *Hub) broadcastRaw(room *Room, sender *Client, data []byte) {
	room.mu.RLock()
	for _, peer := range room.clients {
		if peer == sender {
			continue
		}
		peer.Enqueue(data)
	}
	room.mu.RUnlock()
}

// --- Wire protocol envelopes (compatible with src/transport/relay-transport.ts) ---

type welcomeEnvelope struct {
	Type      string   `json:"type"`
	RoomID    string   `json:"roomId"`
	PeerID    string   `json:"peerId"`
	Peers     []string `json:"peers"`
	Timestamp int64    `json:"timestamp"`
}

type peerLifecycleEnvelope struct {
	Type      string `json:"type"`
	RoomID    string `json:"roomId"`
	PeerID    string `json:"peerId"`
	Timestamp int64  `json:"timestamp"`
}

type outboundRelayEnvelope struct {
	Type       string          `json:"type"`
	FromPeerID string          `json:"fromPeerId"`
	Payload    json.RawMessage `json:"payload"`
}

type outboundRtcSignalEnvelope struct {
	Type       string          `json:"type"`
	FromPeerID string          `json:"fromPeerId"`
	Signal     json.RawMessage `json:"signal"`
}

type inboundEnvelope struct {
	Type         string          `json:"type"`
	TargetPeerID string          `json:"targetPeerId,omitempty"`
	Payload      json.RawMessage `json:"payload,omitempty"`
	Signal       json.RawMessage `json:"signal,omitempty"`
}

type payloadTargetPeek struct {
	TargetPeerID string `json:"targetPeerId"`
}
