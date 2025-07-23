package handlers

import (
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// Entities
type Client struct {
	ID       uuid.UUID
	PeerID   string `json:"id"`
	Conn     *websocket.Conn
	Username string `json:"username"`
	IP       string
	RoomID   string
}

func NewClient(IP string) *Client {
	return &Client{
		ID: uuid.New(),
		IP: IP,
	}
}

func (c *Client) AddConn(conn *websocket.Conn) {
	c.Conn = conn
}

func (c *Client) AddPeerID(peerID string) {
	c.PeerID = peerID
}

func (c *Client) AddUsername(username string) {
	c.Username = username
}

func (c *Client) AddRoomID(roomID string) {
	c.RoomID = roomID
}
