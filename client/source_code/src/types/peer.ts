export interface Peer {
  username: string;
  avatarStyle: {
    color: string;
    textColor: string;
  };
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  status: "connecting" | "connected" | "disconnected";
}

export interface PeerInfo {
  id: string;
  username: string;
}
