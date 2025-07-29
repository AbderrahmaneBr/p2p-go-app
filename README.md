# P2P WebRTC Signaling Server (Go)

A lightweight WebSocket-based signaling server written in Go that helps browser clients establish peer-to-peer WebRTC connections.  
It provides:

- Client authentication / identification
- Room creation & membership management
- Relay of SDP offers / answers and ICE candidates
- Simple in-memory state (no external database required)

> The server **does not** proxy media or chat data – once peers discover each other they communicate directly.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Project Structure](#project-structure)
3. [WebSocket Message Flow](#websocket-message-flow)
4. [Running the Example Client](#running-the-example-client)
5. [Development](#development)
6. [Deployment](#deployment)
7. [Contributing](#contributing)
8. [License](#license)

---

## Getting Started

### Prerequisites

- Go ≥ **1.21** (any modern Go release should work)  
  Download from <https://go.dev/dl/>.
- (Optional) [Node.js](https://nodejs.org/) if you want to rebuild the demo client with your own tooling.

### Installation & Run

Clone the repository and launch the server:

```bash
# clone
$ git clone https://github.com/AbderrahmaneBr/p2p-go-app.git
$ cd p2p-server

# download Go dependencies
$ go mod tidy

# run
$ go run ./...
# → WebSocket server listening on :8080
```

By default the server:

- Accepts WebSocket upgrade requests at `ws://localhost:8080/ws`
- Serves the static demo client from the `client/` folder on `http://localhost:8080`

The port can be changed in `main.go`:

```go
port := ":8080" // update to your liking, e.g. ":80" or os.Getenv("PORT")
```

---

## Project Structure

```
.
├── api/                # (optional place for future REST endpoints)
├── client/             # Static HTML/CSS/JS demo client
│   └── index.html
├── handlers/           # Pure data & helper types used by the server
│   ├── clients.go
│   ├── messages.go
│   ├── rooms.go
│   └── server.go       # Message DTOs
├── internal/
│   ├── server/         # WebSocket server implementation
│   │   └── server.go
│   └── utils/          # Misc helpers (auth responses, etc.)
├── main.go             # Application entry point
└── README.md           # ← you are here
```

---

## WebSocket Message Flow

Below is a high-level overview of the messages exchanged between client(s) and the signaling server.
All JSON keys use **camelCase**.

### 1. Identification

| Direction       | Type           | Payload                                                                            |
| --------------- | -------------- | ---------------------------------------------------------------------------------- |
| Client → Server | `IDENTIFY`     | `{ "type":"IDENTIFY", "username":"alice" }`                                        |
| Server → Client | `AUTH_SUCCESS` | `{ "type":"AUTH_SUCCESS", "status":"success", "username":"alice" }`                |
| Server → Client | `AUTH_ERROR`   | `{ "type":"AUTH_ERROR",  "status":"error",   "message":"Username already taken" }` |

A connection is rejected if the user name is missing or already in use.

### 2. Join Room

| Direction        | Type               | Payload                                        |
| ---------------- | ------------------ | ---------------------------------------------- |
| Client → Server  | `JOIN_ROOM`        | `{ "type":"JOIN_ROOM", "roomId":"cool-room" }` |
| Server → Client  | `ROOM_MEMBERS`     | List of peers currently in the room            |
| Server → _Peers_ | `NEW_PEER_IN_ROOM` | Broadcast when a new peer joins                |

### 3. WebRTC Signaling

| Direction       | Type                       | Notes                                              |
| --------------- | -------------------------- | -------------------------------------------------- |
| Client ↔ Server | `SDP_OFFER` / `SDP_ANSWER` | Relayed to the target peer specified in `toPeerId` |
| Client ↔ Server | `ICE_CANDIDATE`            | Same as above                                      |

> The server validates and rewrites the `fromPeerId` field to avoid spoofing.

For a complete description of every JSON shape refer to the Go structs in [`handlers/messages.go`](handlers/messages.go).

---

## Running the Example Client

Open the following URL in **two browser tabs** (or separate machines) after starting the server:

```
http://localhost:8080
```

Enter the same room name in both tabs – you should see the WebRTC connection being negotiated and a simple chat exchange happen **peer-to-peer** (no messages travel through the server after setup).

---

## Development

Typical developer loop:

```bash
# auto-reload on file changes (requires https://github.com/cosmtrek/air)
$ air
```

Debugger attachments can be configured in VS Code or GoLand – the project uses standard `go run` tooling.

Tests are currently TBD; contributions are welcome.

---

## Deployment

### Build a Static Binary

```bash
$ go build -o bin/p2p-server ./...
```

### Docker

A minimal multi-stage image can be built like so:

```dockerfile
# docker/Dockerfile
FROM golang:1.22 AS builder
WORKDIR /app
COPY . .
RUN go build -o /p2p-server ./...

FROM gcr.io/distroless/base-debian11
COPY --from=builder /p2p-server /usr/local/bin/p2p-server
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/p2p-server"]
```

Then:

```bash
$ docker build -t p2p-server -f docker/Dockerfile .
$ docker run -p 8080:8080 p2p-server
```

---

## Contributing

1. Fork the repository and create your branch from `main`.
2. Ensure `go vet ./...` and `go test ./...` pass.
3. Open a Pull Request describing your change.

Please follow conventional commit messages (feat:, fix:, docs:, etc.) and keep PRs focused.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
