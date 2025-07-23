package handlers

import (
	"sync"

	"github.com/google/uuid"
)

type Room struct {
	ID       uuid.UUID
	RoomName string
	Peers    map[string]PeerInfo
	mu       sync.Mutex
}

func NewRoom(roomName string) *Room {
	return &Room{
		ID:       uuid.New(),
		RoomName: roomName,
		Peers:    make(map[string]PeerInfo),
	}
}

func (r *Room) AddPeer(peerID string, info PeerInfo) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Peers[peerID] = info
}

func (r *Room) RemovePeer(peerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.Peers, peerID)
}
