package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

const (
	maxMessageBytes = 64 * 1024 // 64 KB cap for JSON presence/chat/signaling
	wsBufferSize    = 1024      // Compact per-connection buffers for high socket density
)

var (
	roomIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`)
	pongBytes     = []byte("pong")
)

type ServerConfig struct {
	Addr          string
	MaxPerRoom    int
	ReadTimeout   time.Duration
	WriteTimeout  time.Duration
	PingInterval  time.Duration
}

func loadConfig() ServerConfig {
	port := envOrDefault("PORT", "8787")
	addr := port
	if !strings.Contains(addr, ":") {
		addr = ":" + addr
	}

	return ServerConfig{
		Addr:         addr,
		MaxPerRoom:   envIntOrDefault("MAX_PEERS_PER_ROOM", defaultMaxPerRoom),
		ReadTimeout:  time.Duration(envIntOrDefault("READ_TIMEOUT_SEC", 70)) * time.Second,
		WriteTimeout: time.Duration(envIntOrDefault("WRITE_TIMEOUT_SEC", 10)) * time.Second,
		PingInterval: time.Duration(envIntOrDefault("PING_INTERVAL_SEC", 30)) * time.Second,
	}
}

func envOrDefault(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envIntOrDefault(key string, fallback int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}

func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Upgrade, Connection")
}

func newRelayHandler(hub *Hub, cfg ServerConfig) http.Handler {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  wsBufferSize,
		WriteBufferSize: wsBufferSize,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}

	mux := http.NewServeMux()

	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		setCORSHeaders(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		conns, rooms := hub.Stats()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":          true,
			"service":     "webroom-relay-go",
			"connections": conns,
			"rooms":       rooms,
			"timestamp":   time.Now().UnixMilli(),
		})
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			healthHandler(w, r)
			return
		}
		setCORSHeaders(w)
		http.NotFound(w, r)
	})
	mux.HandleFunc("/health", healthHandler)

	mux.HandleFunc("/room/", func(w http.ResponseWriter, r *http.Request) {
		setCORSHeaders(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		roomID := strings.TrimPrefix(r.URL.Path, "/room/")
		if strings.Contains(roomID, "/") || !roomIDPattern.MatchString(roomID) {
			http.Error(w, "Invalid roomId", http.StatusBadRequest)
			return
		}

		peerID := strings.TrimSpace(r.URL.Query().Get("peerId"))
		if peerID == "" || len(peerID) > 128 {
			http.Error(w, "Missing or invalid peerId query parameter", http.StatusBadRequest)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		client := newClient(roomID, peerID)
		if _, ok := hub.Join(client); !ok {
			_ = conn.WriteControl(
				websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseTryAgainLater, "Room capacity reached"),
				time.Now().Add(time.Second),
			)
			_ = conn.Close()
			return
		}

		go writePump(conn, client, cfg)
		readPump(conn, client, hub, cfg)
	})

	return mux
}

func readPump(conn *websocket.Conn, client *Client, hub *Hub, cfg ServerConfig) {
	defer func() {
		hub.Leave(client)
		client.Close()
		_ = conn.Close()
	}()

	conn.SetReadLimit(maxMessageBytes)
	_ = conn.SetReadDeadline(time.Now().Add(cfg.ReadTimeout))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(cfg.ReadTimeout))
		return nil
	})

	for {
		msgType, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(cfg.ReadTimeout))

		// Binary frames are not relayed; file transfers stream P2P over WebRTC DataChannels
		if msgType != websocket.TextMessage {
			continue
		}

		if len(raw) == 4 && string(raw) == "ping" {
			client.Enqueue(pongBytes)
			continue
		}

		var env inboundEnvelope
		if err := json.Unmarshal(raw, &env); err != nil {
			continue
		}

		switch env.Type {
		case "relay":
			if len(env.Payload) == 0 {
				continue
			}
			target := env.TargetPeerID
			if target == "" {
				var peek payloadTargetPeek
				if json.Unmarshal(env.Payload, &peek) == nil && peek.TargetPeerID != "" {
					target = peek.TargetPeerID
				}
			}
			hub.Relay(client, target, env.Payload)

		case "rtc_signal":
			if env.TargetPeerID == "" || len(env.Signal) == 0 {
				continue
			}
			hub.ForwardRtcSignal(client, env.TargetPeerID, env.Signal)
		}
	}
}

func writePump(conn *websocket.Conn, client *Client, cfg ServerConfig) {
	ticker := time.NewTicker(cfg.PingInterval)
	defer func() {
		ticker.Stop()
		_ = conn.Close()
	}()

	for {
		select {
		case msg, ok := <-client.send:
			_ = conn.SetWriteDeadline(time.Now().Add(cfg.WriteTimeout))
			if !ok {
				_ = conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			_ = conn.SetWriteDeadline(time.Now().Add(cfg.WriteTimeout))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func main() {
	cfg := loadConfig()
	hub := NewHub(cfg.MaxPerRoom)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           newRelayHandler(hub, cfg),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("[WebRoom Relay] Listening on %s (max %d peers/room)", cfg.Addr, cfg.MaxPerRoom)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[WebRoom Relay] Server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Println("[WebRoom Relay] Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
