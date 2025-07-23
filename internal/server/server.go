package server

import (
	"encoding/json"
	"log"
	"net/http"
	"p2p-server/handlers"
	"p2p-server/internal/utils"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// Server encapsulates the WebSocket server's state and logic.
type Server struct {
	// WebSocket upgrader
	upgrader websocket.Upgrader

	// Global Maps
	clients           map[uuid.UUID]*handlers.Client
	clientsByUsername map[string]*handlers.Client
	clientsMutex      *sync.Mutex

	rooms      map[string]*handlers.Room // Map roomID (string) to Room
	roomsMutex *sync.Mutex
}

// NewServer creates and initializes a new WebSocket server instance.
func NewServer() *Server {
	return &Server{
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins for simplicity in example
			},
		},
		clients:           make(map[uuid.UUID]*handlers.Client),
		clientsByUsername: make(map[string]*handlers.Client),
		clientsMutex:      &sync.Mutex{},
		rooms:             make(map[string]*handlers.Room),
		roomsMutex:        &sync.Mutex{},
	}
}

// HandleConnections is the HTTP handler for WebSocket upgrades.
func (s *Server) HandleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	clientID := uuid.New()
	clientIP := r.RemoteAddr

	client := &handlers.Client{
		ID:   clientID,
		Conn: ws,
		IP:   clientIP,
	}

	log.Printf("New client connected: ID=%s, IP=%s\n", clientID, clientIP)

	// Initial message for identification (timeout for this read)
	ws.SetReadDeadline(time.Now().Add(5 * time.Second))
	messageType, p, err := ws.ReadMessage()
	ws.SetReadDeadline(time.Time{}) // Clear deadline

	if err != nil {
		if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
			log.Printf("Client %s (%s) initial read error or disconnected prematurely: %v\n", clientID, clientIP, err)
		} else {
			log.Printf("Client %s (%s) initial read error: %v\n", clientID, clientIP, err)
		}
		ws.Close()
		return
	}

	var identifyMsg handlers.ClientIdentifyMessage
	if messageType != websocket.TextMessage || json.Unmarshal(p, &identifyMsg) != nil || identifyMsg.Type != "IDENTIFY" {
		log.Printf("Client %s (%s) sent invalid initial message (expected 'IDENTIFY'): %s\n", clientID, clientIP, p)
		utils.SendAuthError(ws, "Invalid initial message. Expected type 'IDENTIFY'.")
		ws.Close()
		return
	}

	if identifyMsg.Username == "" {
		log.Printf("Client %s (%s) sent empty username.\n", clientID, clientIP)
		utils.SendAuthError(ws, "Username cannot be empty.")
		ws.Close()
		return
	}

	s.clientsMutex.Lock()
	// Check for username collision (optional, but good for unique IDs)
	if _, exists := s.clientsByUsername[identifyMsg.Username]; exists {
		s.clientsMutex.Unlock()
		log.Printf("Client %s (%s) attempted to use taken username: %s\n", clientID, clientIP, identifyMsg.Username)
		utils.SendAuthError(ws, "Username already taken.")
		ws.Close()
		return
	}

	client.AddPeerID(clientID.String()) // Set the PeerID for WebRTC signaling
	client.AddUsername(identifyMsg.Username)
	s.clients[clientID] = client
	s.clientsByUsername[client.Username] = client
	s.clientsMutex.Unlock()

	log.Printf("Client identified: ID=%s, PeerID=%s, Username=%s, IP=%s\n", clientID, client.PeerID, client.Username, clientIP)
	utils.SendAuthSuccess(ws, client.Username)

	// Make sure client's data gets cleaned up when connection is closed
	defer func() {
		s.clientsMutex.Lock()
		delete(s.clients, clientID)
		delete(s.clientsByUsername, client.Username)
		s.clientsMutex.Unlock()

		// Remove client from any room they were in
		if client.RoomID != "" {
			s.removeClientFromRoom(client.RoomID, client.PeerID)
		}

		log.Printf("Client %s (%s) disconnected.\n", clientID, client.Username)
		ws.Close() // Ensure the connection is closed
	}()

	for {
		// For each message send in server by client
		messageType, msgBytes, err := ws.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Read error for client %s (%s): %v\n", clientID, client.Username, err)
			}
			break // Exit the loop on read error (client disconnected)
		}

		if messageType != websocket.TextMessage {
			log.Printf("Client %s (%s) sent non-text message type %d. Skipping.", clientID, client.Username, messageType)
			continue
		}

		var baseMessage handlers.ChatMessage // To peek at the "Type" field
		if err := json.Unmarshal(msgBytes, &baseMessage); err != nil {
			log.Printf("Client %s (%s) sent invalid JSON or missing 'type': %v - %s\n", clientID, client.Username, err, msgBytes)
			continue
		}

		switch baseMessage.Type {
		case "JOIN_ROOM":
			var joinMsg handlers.JoinRoomMessage
			if err := json.Unmarshal(msgBytes, &joinMsg); err != nil {
				log.Printf("Client %s (%s) sent invalid JOIN_ROOM JSON: %v - %s\n", clientID, client.Username, err, msgBytes)
				continue
			}
			roomID := joinMsg.RoomID
			if roomID == "" {
				log.Printf("Client %s (%s) sent JOIN_ROOM with empty roomId.\n", clientID, client.Username)
				continue
			}
			log.Printf("Client %s (%s) requested to join room: %s\n", clientID, client.Username, roomID)
			s.handleJoinRoom(client, roomID) // Call method on Server instance

		case "SDP_OFFER", "SDP_ANSWER", "ICE_CANDIDATE":
			var signalingMsg handlers.SignalingMessage
			if err := json.Unmarshal(msgBytes, &signalingMsg); err != nil {
				log.Printf("Client %s (%s) sent invalid Signaling Message JSON: %v - %s\n", clientID, client.Username, err, msgBytes)
				continue
			}
			signalingMsg.FromPeerID = client.PeerID // Set FromPeerID to prevent spoofing
			s.handleSignalingMessage(signalingMsg)  // Call method on Server instance

		case "CHAT_MESSAGE":
			log.Printf("Client %s (%s) sent CHAT_MESSAGE to server. This should now be P2P. Content: %s\n", clientID, client.Username, baseMessage.Content)

		default:
			log.Printf("Client %s (%s) sent unknown message type: %s\n", clientID, client.Username, baseMessage.Type)
		}
	}
}

// handleJoinRoom: Client requests to join a room
func (s *Server) handleJoinRoom(joiningClient *handlers.Client, roomID string) {
	s.roomsMutex.Lock()
	defer s.roomsMutex.Unlock()

	// If client was in another room, remove them from it first
	if joiningClient.RoomID != "" && joiningClient.RoomID != roomID {
		log.Printf("Client %s (%s) leaving room %s to join %s.\n", joiningClient.PeerID, joiningClient.Username, joiningClient.RoomID, roomID)
		s.removeClientFromRoom(joiningClient.RoomID, joiningClient.PeerID) // Use method on Server instance
	}

	// Create room if it doesn't exist
	room, ok := s.rooms[roomID]
	if !ok {
		room = handlers.NewRoom(roomID) // Use the constructor from pkg/handlers/models.go
		s.rooms[roomID] = room
		log.Printf("Created new room: %s\n", roomID)
	}

	// Add client to the room's peer list
	peerInfo := handlers.PeerInfo{
		ID:       joiningClient.PeerID,
		Username: joiningClient.Username,
	}
	room.AddPeer(joiningClient.PeerID, peerInfo) // Use method on Room instance

	joiningClient.RoomID = roomID // Update client's current room

	log.Printf("Client %s (%s) joined room %s.\n", joiningClient.PeerID, joiningClient.Username, roomID)

	// 1. Send ROOM_MEMBERS to the joining client
	membersList := make([]handlers.PeerInfo, 0, len(room.Peers)-1) // Capacity without self
	for id, peerInfo := range room.Peers {
		if id != joiningClient.PeerID { // Don't send self in the list
			membersList = append(membersList, peerInfo)
		}
	}
	membersMessage := handlers.RoomMembersMessage{
		Type:    "ROOM_MEMBERS",
		RoomID:  roomID,
		Members: membersList,
	}
	if err := joiningClient.Conn.WriteJSON(membersMessage); err != nil {
		log.Printf("Error sending ROOM_MEMBERS to %s (%s): %v\n", joiningClient.PeerID, joiningClient.Username, err)
	}

	// 2. Broadcast NEW_PEER_IN_ROOM to all other existing clients in the room
	newPeerMessage := handlers.NewPeerInRoomMessage{
		Type:   "NEW_PEER_IN_ROOM",
		RoomID: roomID,
		Peer: handlers.PeerInfo{
			ID:       joiningClient.PeerID,
			Username: joiningClient.Username,
		},
	}
	for id, peerInfo := range room.Peers {
		if id != joiningClient.PeerID { // Don't send to self
			s.clientsMutex.Lock() // Lock global clients map for lookup
			targetClient, ok := s.clients[uuid.MustParse(id)]
			s.clientsMutex.Unlock()
			if ok {
				if err := targetClient.Conn.WriteJSON(newPeerMessage); err != nil {
					log.Printf("Error sending NEW_PEER_IN_ROOM to %s (%s): %v\n", targetClient.PeerID, targetClient.Username, err)
				}
			} else {
				log.Printf("Peer %s (%s) in room %s not found in global clients map. Possible stale entry.", id, peerInfo.Username, roomID)
			}
		}
	}
}

// removeClientFromRoom: Removes a client from a specific room
func (s *Server) removeClientFromRoom(roomID string, peerID string) {
	s.roomsMutex.Lock()
	defer s.roomsMutex.Unlock()

	if room, ok := s.rooms[roomID]; ok {
		room.RemovePeer(peerID) // Use method on Room instance
		log.Printf("Client %s removed from room %s.\n", peerID, roomID)

		// If room becomes empty, delete it
		if len(room.Peers) == 0 {
			delete(s.rooms, roomID)
			log.Printf("Room %s is now empty and deleted.\n", roomID)
		} else {
			// Optional: Broadcast USER_LEFT_ROOM to remaining clients in the room
			// For simplicity, we'll omit this in this example, but it's a good feature.
		}
	}
}

// handleSignalingMessage: Relays SDP offers/answers and ICE candidates
func (s *Server) handleSignalingMessage(msg handlers.SignalingMessage) {
	// Find the target client by ToPeerID
	s.clientsMutex.Lock()
	targetUUID, err := uuid.Parse(msg.ToPeerID)
	if err != nil {
		s.clientsMutex.Unlock()
		log.Printf("Invalid ToPeerID received in signaling message: %s\n", msg.ToPeerID)
		return
	}
	targetClient, ok := s.clients[targetUUID]
	s.clientsMutex.Unlock()

	if !ok {
		log.Printf("Target client %s not found for signaling message from %s. Message type: %s\n", msg.ToPeerID, msg.FromPeerID, msg.Type)
		return
	}

	// Relay the message
	if err := targetClient.Conn.WriteJSON(msg); err != nil {
		log.Printf("Error relaying signaling message from %s to %s (%s): %v\n", msg.FromPeerID, msg.ToPeerID, targetClient.Username, err)
	} else {
		log.Printf("Relayed %s from %s to %s\n", msg.Type, msg.FromPeerID, msg.ToPeerID)
	}
}
