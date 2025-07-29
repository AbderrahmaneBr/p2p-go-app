package main

import (
	"log"
	"net/http"

	"p2p-server/internal/server"
)

func main() {
	// Create a new server instance
	wsServer := server.NewServer()

	// Register the WebSocket handler
	http.HandleFunc("/ws", wsServer.HandleConnections)

	// Serve static files for your client (assuming 'client' folder at project root)
	http.Handle("/", http.FileServer(http.Dir("./client")))

	port := ":8080"
	log.Printf("WebSocket server listening on %s\n", port)
	err := http.ListenAndServe(port, nil)
	if err != nil {
		log.Fatal("ListenAndServe error:", err)
	}
}
