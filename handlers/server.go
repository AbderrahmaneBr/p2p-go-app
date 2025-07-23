package handlers

// Requests
type ClientIdentifyMessage struct {
	Type     string `json:"type"`
	Username string `json:"username"`
}

// Responses
type ServerAuthResponse struct {
	Type     string `json:"type"`              // "AUTH_SUCCESS" or "AUTH_ERROR"
	Status   string `json:"status"`            // "success" or "error"
	Username string `json:"username"`          // The accepted username
	Message  string `json:"message,omitempty"` // Error message if status is "error"
}

// Server Types
type IncomingChatMessage struct {
	Type    string `json:"type"`    // Expected to be "CHAT_MESSAGE"
	Content string `json:"content"` // The chat message content
}

type BroadcastChatMessage struct {
	Type      string `json:"type"`      // "CHAT_MESSAGE"
	Username  string `json:"username"`  // Sender's username
	Content   string `json:"content"`   // Message content
	Timestamp int64  `json:"timestamp"` // Unix timestamp
}

type JoinRoomMessage struct {
	Type   string `json:"type"` // Expected: "JOIN_ROOM"
	RoomID string `json:"roomId"`
}

type ChatMessage struct {
	Type    string `json:"type"`    // Expected: "CHAT_MESSAGE"
	Content string `json:"content"` // The actual message
}
