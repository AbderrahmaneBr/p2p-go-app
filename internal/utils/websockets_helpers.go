package utils

import (
	"log"
	"p2p-server/handlers"

	"github.com/gorilla/websocket"
)

// SendAuthError sends an authentication error message to a client.
func SendAuthError(ws *websocket.Conn, message string) {
	resp := handlers.ServerAuthResponse{
		Type:    "AUTH_ERROR",
		Status:  "error",
		Message: message,
	}
	if err := ws.WriteJSON(resp); err != nil {
		log.Printf("Error sending auth error: %v", err)
	}
}

// SendAuthSuccess sends an authentication success message to a client.
func SendAuthSuccess(ws *websocket.Conn, username string) {
	resp := handlers.ServerAuthResponse{
		Type:     "AUTH_SUCCESS",
		Status:   "success",
		Username: username,
	}
	if err := ws.WriteJSON(resp); err != nil {
		log.Printf("Error sending auth success: %v", err)
	}
}
