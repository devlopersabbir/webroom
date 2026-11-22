package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func startTestServer(t *testing.T) (*httptest.Server, *Hub) {
	t.Helper()
	hub := NewHub(250)
	cfg := ServerConfig{
		MaxPerRoom:   250,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 5 * time.Second,
		PingInterval: 5 * time.Second,
	}
	srv := httptest.NewServer(newRelayHandler(hub, cfg))
	t.Cleanup(srv.Close)
	return srv, hub
}

func dialPeer(t *testing.T, srv *httptest.Server, roomID, peerID string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/room/" + roomID + "?peerId=" + peerID
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial %s: %v", wsURL, err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return conn
}

func readJSON(t *testing.T, conn *websocket.Conn) map[string]any {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read error: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatalf("unmarshal error for %q: %v", string(data), err)
	}
	return out
}

func TestHealthEndpointAndStats(t *testing.T) {
	srv, _ := startTestServer(t)

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("health request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}
	if body["ok"] != true || body["service"] != "webroom-relay-go" {
		t.Fatalf("unexpected health body: %#v", body)
	}
}

func TestRoomDiscoveryRelayAndLeave(t *testing.T) {
	srv, hub := startTestServer(t)

	// Peer A joins room_1
	connA := dialPeer(t, srv, "room_1", "peer_A")
	welcomeA := readJSON(t, connA)
	if welcomeA["type"] != "welcome" || welcomeA["peerId"] != "peer_A" {
		t.Fatalf("unexpected welcome for A: %#v", welcomeA)
	}

	// Peer B joins room_1
	connB := dialPeer(t, srv, "room_1", "peer_B")
	welcomeB := readJSON(t, connB)
	if welcomeB["type"] != "welcome" {
		t.Fatalf("expected welcome for B, got %#v", welcomeB)
	}
	peersB, _ := welcomeB["peers"].([]any)
	if len(peersB) != 1 || peersB[0] != "peer_A" {
		t.Fatalf("expected peer_A in B's welcome peers, got %#v", peersB)
	}

	// Peer A receives peer_join for B
	joinA := readJSON(t, connA)
	if joinA["type"] != "peer_join" || joinA["peerId"] != "peer_B" {
		t.Fatalf("expected peer_join for peer_B, got %#v", joinA)
	}

	// Ping/Pong keepalive
	if err := connA.WriteMessage(websocket.TextMessage, []byte("ping")); err != nil {
		t.Fatalf("ping write failed: %v", err)
	}
	_ = connA.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, pong, err := connA.ReadMessage()
	if err != nil || string(pong) != "pong" {
		t.Fatalf("expected pong, got %q (err=%v)", string(pong), err)
	}

	// Peer A broadcasts a relay message -> Peer B receives it
	relayMsg := `{"type":"relay","payload":{"type":"CHAT_MESSAGE","roomId":"room_1","peerId":"peer_A","text":"hello"}}`
	if err := connA.WriteMessage(websocket.TextMessage, []byte(relayMsg)); err != nil {
		t.Fatalf("relay write failed: %v", err)
	}
	gotB := readJSON(t, connB)
	if gotB["type"] != "relay" || gotB["fromPeerId"] != "peer_A" {
		t.Fatalf("unexpected relay on B: %#v", gotB)
	}

	// Peer C joins room_1 and tests targeted rtc_signal (B -> C only)
	connC := dialPeer(t, srv, "room_1", "peer_C")
	_ = readJSON(t, connC) // welcome
	_ = readJSON(t, connA) // peer_join C
	_ = readJSON(t, connB) // peer_join C

	sigMsg := `{"type":"rtc_signal","targetPeerId":"peer_C","signal":{"kind":"offer","sdp":{"type":"offer","sdp":"v=0"}}}`
	if err := connB.WriteMessage(websocket.TextMessage, []byte(sigMsg)); err != nil {
		t.Fatalf("rtc_signal write failed: %v", err)
	}
	gotC := readJSON(t, connC)
	if gotC["type"] != "rtc_signal" || gotC["fromPeerId"] != "peer_B" {
		t.Fatalf("expected rtc_signal on C from B, got %#v", gotC)
	}

	// Peer C disconnects -> Peer A & B receive peer_leave immediately
	_ = connC.Close()
	leaveA := readJSON(t, connA)
	if leaveA["type"] != "peer_leave" || leaveA["peerId"] != "peer_C" {
		t.Fatalf("expected peer_leave for C on A, got %#v", leaveA)
	}

	// Disconnect remaining peers -> empty room is evicted
	_ = connA.Close()
	_ = connB.Close()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		conns, rooms := hub.Stats()
		if conns == 0 && rooms == 0 {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	conns, rooms := hub.Stats()
	t.Fatalf("expected 0 conns and 0 rooms after cleanup, got conns=%d rooms=%d", conns, rooms)
}
