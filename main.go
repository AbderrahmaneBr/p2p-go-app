package main

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

// WebSocket upgrader from HTTP
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // Allow all connections for testing
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	// Upgrade the connection to WebSocket
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer ws.Close()

	// Log that a client has connected
	clientIP := r.RemoteAddr
	log.Printf("New client connected: %s\n", clientIP)

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			log.Printf("Client %s disconnected.\n", clientIP)
			break
		}
		log.Printf("Received from %s: %s\n", clientIP, msg)
	}
}

func main() {
	http.HandleFunc("/ws", handleConnections)

	log.Println("WebSocket server listening on :8080")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal("ListenAndServe error:", err)
	}
}
