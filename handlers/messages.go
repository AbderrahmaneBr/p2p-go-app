package handlers

// SignalingMessage represents a generic message for WebRTC signaling
type SignalingMessage struct {
	Type         string        `json:"type"`                   // "SDP_OFFER", "SDP_ANSWER", "ICE_CANDIDATE"
	FromPeerID   string        `json:"fromPeerId"`             // Sender's UUID
	ToPeerID     string        `json:"toPeerId"`               // Recipient's UUID
	SDP          *SDP          `json:"sdp,omitempty"`          // For SDP_OFFER/SDP_ANSWER
	ICECandidate *ICECandidate `json:"iceCandidate,omitempty"` // For ICE_CANDIDATE
}

// SDP struct for Session Description Protocol
type SDP struct {
	Type string `json:"type"` // "offer" or "answer"
	SDP  string `json:"sdp"`
}

// ICECandidate struct for Interactive Connectivity Establishment candidate
type ICECandidate struct {
	Candidate     string `json:"candidate"`
	SDPMid        string `json:"sdpMid"`
	SDPMLineIndex uint16 `json:"sdpMLineIndex"`
}

// RoomMembersMessage: Server tells a client who is in a room.
type RoomMembersMessage struct {
	Type    string     `json:"type"` // "ROOM_MEMBERS"
	RoomID  string     `json:"roomId"`
	Members []PeerInfo `json:"members"` // List of peers in the room
}

// NewPeerInRoomMessage: Server tells existing clients about a new peer.
type NewPeerInRoomMessage struct {
	Type   string   `json:"type"` // "NEW_PEER_IN_ROOM"
	RoomID string   `json:"roomId"`
	Peer   PeerInfo `json:"peer"` // Info about the new peer
}

// PeerInfo: Basic info for a peer, for discovery purposes
type PeerInfo struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}
