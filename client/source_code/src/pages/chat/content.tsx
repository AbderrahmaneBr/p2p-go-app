import { Button } from "@/components/ui/button";
import Header from "./components/header";
import { Input } from "@/components/ui/input";
import { ArrowRight, Download, File, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Peer, PeerInfo } from "@/types/peer";
import { wsUrl, type MESSAGE_TYPE } from "@/lib/constants";
import { rtcConfig } from "@/lib/config";
import { useNavigate } from "react-router-dom";
import type { FileAttachment, FileUploadProgress } from "@/types/global";
import type { Message } from "@/types/message";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn, getRandomColorWithTextColor } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { v4 as uuidv4 } from "uuid";

const ChatPage = () => {
  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const peers = useRef<Map<string, Peer>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processedFiles = useRef<Set<string>>(new Set()); // Track processed files
  const [messages, setMessages] = useState<Message[]>([]);

  // States
  const [peerIds, setPeerIds] = useState<string[]>([]);
  const [peerId, setPeerId] = useState<string>("");
  const [_incomingFiles, setIncomingFiles] = useState<Map<string, any>>(
    new Map()
  );
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [connected, setConnected] = useState(false);
  const [proceed, setProceed] = useState(false);
  const [inputValue, setInputValue] = useState<string>("");

  // File sharing states
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<
    Map<string, FileUploadProgress>
  >(new Map());

  const navigate = useNavigate();

  // File utility functions
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileExtension = (filename: string): string => {
    return filename.split(".").pop()?.toUpperCase() || "FILE";
  };

  const generateFileId = (): string => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  };

  // File handling functions
  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const newAttachment: FileAttachment = {
        file,
        id: generateFileId(),
      };
      setAttachments((prev) => [...prev, newAttachment]);
    });

    // Clear the input
    if (e.target) {
      e.target.value = "";
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const sendFileToAllPeers = async (file: File) => {
    const currentPeers = peers.current;
    const fileId = generateFileId();
    const fileSize = formatFileSize(file.size);
    const fileExtension = getFileExtension(file.name);

    // Add file message to sender's chat immediately
    const fileMessage: Message = {
      isOwn: true,
      timestamp: new Date().getTime(),
      isSystem: false,
      username,
      content: `Sent file: ${file.name}`,
      fileData: {
        fileId: fileId,
        url: URL.createObjectURL(file),
        filename: file.name,
        size: file.size,
        isOwn: true,
      },
    };

    addMessageUI(fileMessage);

    // Initialize progress for all peers
    currentPeers.forEach((peer, peerId) => {
      if (peer.dataChannel && peer.dataChannel.readyState === "open") {
        const progressKey = `${fileId}-${peerId}`;
        setUploadProgress((prev) => {
          const newMap = new Map(prev);
          newMap.set(progressKey, {
            filename: file.name,
            progress: 0,
            isComplete: false,
            peerId,
            size: fileSize,
            extension: fileExtension,
          });
          return newMap;
        });
      }
    });

    // Send file metadata first
    const fileMeta = {
      type: "FILE_META",
      filename: file.name,
      size: file.size,
      mime: file.type,
      fileId: fileId, // Add unique file ID
    };

    currentPeers.forEach((peer, _peerId) => {
      if (peer.dataChannel && peer.dataChannel.readyState === "open") {
        peer.dataChannel.send(JSON.stringify(fileMeta));
      }
    });

    // Send file in chunks
    const chunkSize = 16 * 1024; // 16KB
    const reader = new FileReader();
    let offset = 0;

    return new Promise<void>((resolve, reject) => {
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) {
          reject(new Error("Failed to read file"));
          return;
        }

        const sendChunk = () => {
          const slice = arrayBuffer.slice(offset, offset + chunkSize);
          const isLastChunk = offset + chunkSize >= arrayBuffer.byteLength;
          const progress = Math.min(
            100,
            Math.round((offset / arrayBuffer.byteLength) * 100)
          );

          // Update progress for all peers
          currentPeers.forEach((peer, peerId) => {
            if (peer.dataChannel && peer.dataChannel.readyState === "open") {
              peer.dataChannel.send(slice);

              const progressKey = `${fileId}-${peerId}`;
              setUploadProgress((prev) => {
                const newMap = new Map(prev);
                const existing = newMap.get(progressKey);
                if (existing) {
                  newMap.set(progressKey, {
                    ...existing,
                    progress,
                    isComplete: isLastChunk,
                  });
                }
                return newMap;
              });
            }
          });

          offset += chunkSize;

          if (!isLastChunk) {
            setTimeout(sendChunk, 10);
          } else {
            // Send file end signal
            const fileEndMsg = {
              type: "FILE_END",
              filename: file.name,
              fileId: fileId, // Include file ID
            };

            currentPeers.forEach((peer, _peerId) => {
              if (peer.dataChannel && peer.dataChannel.readyState === "open") {
                peer.dataChannel.send(JSON.stringify(fileEndMsg));
              }
            });

            resolve();
          }
        };

        sendChunk();
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  };

  const cancelUpload = (progressKey: string) => {
    setUploadProgress((prev) => {
      const newMap = new Map(prev);
      newMap.delete(progressKey);
      return newMap;
    });
  };

  // Clean up completed uploads when starting new ones
  const cleanupCompletedUploads = () => {
    setUploadProgress((prev) => {
      const newMap = new Map(prev);
      for (const [key, progress] of newMap.entries()) {
        if (progress.isComplete) {
          newMap.delete(key);
        }
      }
      return newMap;
    });
  };

  // Enhanced send message function
  const sendMessage = async (content: string) => {
    if (!content.trim() && attachments.length === 0) return;

    // Send text message if there's content
    if (content.trim()) {
      const message = {
        content,
        timestamp: Date.now(),
      };

      const currentPeers = peers.current;
      let sentCount = 0;
      currentPeers.forEach((peer, _id) => {
        if (peer.dataChannel && peer.dataChannel.readyState === "open") {
          peer.dataChannel.send(JSON.stringify(message));
          sentCount++;
        }
      });

      if (sentCount === 0) {
        notifySystem("No peers connected - message not sent");
        return;
      }

      addMessageUI({
        isOwn: true,
        timestamp: new Date().getTime(),
        isSystem: false,
        username,
        content,
      });
    }

    if (peerIds.length === 0 && attachments.length > 0) {
      notifySystem("No peers connected - files not sent");
      return;
    }

    // Send files if there are attachments
    if (attachments.length > 0) {
      // Clean up any completed uploads before starting new ones
      cleanupCompletedUploads();

      for (const attachment of attachments) {
        try {
          await sendFileToAllPeers(attachment.file);
        } catch (error) {
          console.error("Error sending file:", error);
          notifySystem(`Failed to send file: ${attachment.file.name}`);
        }
      }

      // Clear attachments after sending
      setAttachments([]);
    }

    setInputValue("");
  };

  // Websockets handlers (keeping existing ones)
  const onWebSocketOpen = () => {
    console.log("WebSocket connected");
    const identifyMsg = {
      type: "IDENTIFY",
      username: username,
    };
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify(identifyMsg));
    }
  };

  const onWebSocketMessage = (event: MessageEvent<any>) => {
    try {
      const message: any = JSON.parse(event.data);
      console.log("Received:", message);

      switch (message.type) {
        case "AUTH_SUCCESS":
          onAuthSuccess(message);
          break;
        case "AUTH_ERROR":
          onAuthError(message);
          break;
        case "ROOM_MEMBERS":
          onRoomMembers(message);
          break;
        case "NEW_PEER_IN_ROOM":
          onNewPeerInRoom(message);
          break;
        case "SDP_OFFER":
          onSdpOffer(message);
          break;
        case "SDP_ANSWER":
          onSdpAnswer(message);
          break;
        case "ICE_CANDIDATE":
          onIceCandidate(message);
          break;
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  };

  const onSdpOffer = async (message: any) => {
    const peer = peers.current.get(message.fromPeerId);
    if (!peer) return;

    try {
      await peer.connection.setRemoteDescription(message.sdp);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);

      sendSignalingMessage("SDP_ANSWER", message.fromPeerId, {
        sdp: {
          type: answer.type,
          sdp: answer.sdp,
        },
      });
    } catch (error) {
      console.error("Error handling SDP offer:", error);
    }
  };

  const onSdpAnswer = async (message: any) => {
    const peer = peers.current.get(message.fromPeerId);
    if (!peer) return;

    try {
      await peer.connection.setRemoteDescription(message.sdp);
    } catch (error) {
      console.error("Error handling SDP answer:", error);
    }
  };

  const onIceCandidate = async (message: any) => {
    const peer = peers.current.get(message.fromPeerId);
    if (!peer) return;

    try {
      await peer.connection.addIceCandidate(message.iceCandidate);
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  };

  const onNewPeerInRoom = (message: any) => {
    console.log("New peer joined:", message.peer);
    notifySystem(`${message.peer.username} joined the room`);
    createPeerConnection(message.peer.id, message.peer.username, false);
  };

  const onRoomMembers = (message: any) => {
    console.log("Room members:", message.members);
    message.members.forEach((peer: PeerInfo) => {
      console.log("Creating peer connection for:", peer.id);
      createPeerConnection(peer.id, peer.username, true);
    });
  };

  const sendSignalingMessage = (
    type: MESSAGE_TYPE,
    toPeerId: string,
    data: any
  ) => {
    const message = {
      type: type,
      toPeerId: toPeerId,
      ...data,
    };

    if (wsRef.current) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const setupDataChannel = (channel: RTCDataChannel, _peerId: string) => {
    const peer = peers.current.get(_peerId);
    if (!peer) return;

    peer.dataChannel = channel;

    channel.onopen = () => {
      console.log(`Data channel open with ${peer.username}`);
      peer.status = "connected";
    };

    channel.onclose = () => {
      console.log(`Data channel closed with ${peer.username}`);
      peer.status = "disconnected";
    };

    channel.onmessage = (event) => {
      try {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data);

          if (message.type === "FILE_META") {
            initFileReception(peer.username, message);
          } else if (message.type === "FILE_END") {
            finishFileReception(
              peer.username,
              message.filename,
              message.fileId
            );
          } else {
            addMessageUI({
              isOwn: false,
              timestamp: new Date().getTime(),
              isSystem: false,
              username: peer.username,
              content: message.content,
            });
          }
        } else {
          receiveFileChunk(peer.username, event.data);
        }
      } catch (error) {
        console.error("Error handling P2P message:", error);
      }
    };
  };

  const initFileReception = (_username: string, meta: any) => {
    const fileKey = `${meta.fileId || meta.filename}-${_username}`; // Use fileId + username for unique key
    setIncomingFiles((prev) => {
      const newMap = new Map(prev);
      newMap.set(fileKey, {
        chunks: [],
        meta,
        sender: _username,
      });
      return newMap;
    });
  };

  const receiveFileChunk = (_username: string, data: any) => {
    setIncomingFiles((prev) => {
      // Find the most recent file entry for this sender that's still receiving
      const senderFiles = Array.from(prev.entries()).filter(
        ([key, file]) => key.includes(_username) && file.sender === _username
      );

      if (senderFiles.length === 0) return prev;

      // Get the most recent file (last in array)
      const [fileKey, fileEntry] = senderFiles[senderFiles.length - 1];
      fileEntry.chunks.push(new Uint8Array(data));

      const newMap = new Map(prev);
      newMap.set(fileKey, fileEntry);
      return newMap;
    });
  };

  const finishFileReception = (
    _username: string,
    filename: string,
    fileId?: string
  ) => {
    const fileKey = fileId
      ? `${fileId}-${_username}`
      : `${filename}-${_username}`;
    const processedKey = `${fileKey}-${Date.now()}`;

    // Check if this exact file transfer has already been processed
    if (processedFiles.current.has(processedKey)) {
      return;
    }

    // Mark as processed
    processedFiles.current.add(processedKey);

    setIncomingFiles((prev) => {
      const fileEntry = prev.get(fileKey);
      if (!fileEntry) return prev;

      const blob = new Blob(fileEntry.chunks, { type: fileEntry.meta.mime });
      const url = URL.createObjectURL(blob);

      // Add a download message bubble for receiver
      const downloadMessage: Message = {
        isOwn: false,
        timestamp: new Date().getTime(),
        isSystem: false,
        username: _username,
        content: `Sent you a file: ${filename}`,
        fileData: {
          fileId: fileId ?? "",
          url,
          filename,
          size: fileEntry.meta.size,
          isOwn: false,
        },
      };

      addMessageUI(downloadMessage);

      const newMap = new Map(prev);
      newMap.delete(fileKey);
      return newMap;
    });

    // Clean up processed files set after some time to prevent memory leaks
    setTimeout(() => {
      processedFiles.current.delete(processedKey);
    }, 60000); // Clean up after 1 minute
  };

  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const createPeerConnection = async (
    _peerId: string,
    _username: string,
    shouldInitiate: boolean
  ) => {
    if (_peerId === peerId) {
      console.log("Skipping self connection");
      return;
    }

    console.log(
      `Creating peer connection for ${_peerId} (${_username}), shouldInitiate: ${shouldInitiate}`
    );

    const peer: Peer = {
      username: _username,
      avatarStyle: getRandomColorWithTextColor(),
      connection: new RTCPeerConnection(rtcConfig),
      dataChannel: null,
      status: "connecting",
    };

    const peerSearch = Array.from(peers.current.entries())
      .map(([key, value]) => ({ peerId: key, peer: value }))
      .find((e) => e.peer.username === _username);
    if (peerSearch) {
      peers.current.delete(peerSearch.peerId);
    }

    peers.current.set(_peerId, peer);
    setPeerIds(Array.from(peers.current.keys()));

    peer.connection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalingMessage("ICE_CANDIDATE", _peerId, {
          iceCandidate: event.candidate,
        });
      }
    };

    peer.connection.onconnectionstatechange = () => {
      console.log(
        `Connection state with ${_username}:`,
        peer.connection.connectionState
      );

      if (peer.connection.connectionState === "connected") {
        peer.status = "connected";
        notifySystem(`Connected to [${_username}]`);
      } else if (peer.connection.connectionState === "disconnected") {
        peer.status = "disconnected";
        notifySystem(`Disconnected from [${_username}]`);
        peers.current.delete(_peerId);
        setPeerIds(Array.from(peers.current.keys()));
      }
    };

    peer.connection.ondatachannel = (event) => {
      const channel = event.channel;
      setupDataChannel(channel, _peerId);
    };

    if (shouldInitiate) {
      peer.dataChannel = peer.connection.createDataChannel("chat", {
        ordered: true,
      });
      setupDataChannel(peer.dataChannel, _peerId);

      try {
        const offer = await peer.connection.createOffer();
        await peer.connection.setLocalDescription(offer);

        sendSignalingMessage("SDP_OFFER", _peerId, {
          sdp: {
            type: offer.type,
            sdp: offer.sdp,
          },
        });
      } catch (error) {
        console.error("Error creating offer:", error);
      }
    }
  };

  const notifySystem = (content: string) => {
    addMessageUI({
      isOwn: false,
      timestamp: new Date().getTime(),
      isSystem: true,
      username: "SYSTEM",
      content: content,
    });
    console.warn(content);
  };

  const addMessageUI = (message: Message) => {
    const id = uuidv4();
    const msg: Message = {
      ...message,
      id,
    };

    // Checking for duplicates
    if (message.fileData) {
      setMessages((prev) => {
        const fileExists = prev.some(
          (m) =>
            m.fileData &&
            m.fileData.fileId === message.fileData!.fileId &&
            m.fileData.filename === message.fileData!.filename &&
            m.username === message.username
        );

        if (!fileExists) {
          return [...prev, msg];
        }
        return prev;
      });
    } else {
      setMessages((prev) => {
        const isDuplicate = prev.some(
          (m) =>
            !m.fileData && // Ensure it's not a file message
            m.content === message.content &&
            m.username === message.username &&
            Math.abs((m.timestamp || 0) - (message.timestamp || 0)) < 1000
        );

        if (!isDuplicate) {
          setInputValue(""); // Only clear input for new messages
          return [...prev, msg];
        }
        return prev; // Return unchanged if duplicate
      });
    }
  };

  const onAuthSuccess = (message: any) => {
    console.log("Authentication successful");
    setPeerId(message.username);
    joinRoom();
  };

  const onAuthError = (message: any) => {
    console.error(message.message);
  };

  const onWebSocketClose = () => {
    console.log("WebSocket disconnected");
    notifySystem("Disconnected from server");
  };

  const onWebSocketError = (error: Event) => {
    console.error("WebSocket error:", error);
    console.error("Connection error");
  };

  const joinRoom = () => {
    const joinMsg = {
      type: "JOIN_ROOM",
      roomId,
    };

    if (wsRef.current) {
      wsRef.current.send(JSON.stringify(joinMsg));
      notifySystem(`Joined room: ${roomId}`);
    }
  };

  const connect = () => {
    if (!username || !roomId) {
      console.error("Please enter both username and room name");
      return;
    }

    try {
      console.log("Connecting to:", wsUrl);
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => onWebSocketOpen();
      wsRef.current.onmessage = (event) => onWebSocketMessage(event);
      wsRef.current.onclose = () => onWebSocketClose();
      wsRef.current.onerror = (error) => onWebSocketError(error);
    } catch (error) {
      console.error("Failed to connect to server", error);
    }
  };

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value || "");
  };

  useEffect(() => {
    const usr = localStorage.getItem("blazeit_username");
    const rId = localStorage.getItem("blazeit_roomId");

    if (!usr?.trim() || !rId?.trim()) {
      navigate("/login");
    } else {
      setUsername(usr);
      setRoomId(rId);
      setProceed(true);
    }
  }, [navigate]);

  useEffect(() => {
    const scrollContainer = scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  useEffect(() => {
    if (proceed && !connected) {
      connect();
      setConnected(true);
    }
  }, [proceed, connected]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      peers.current.forEach((peer) => {
        if (peer.connection) {
          peer.connection.close();
        }
      });
    };
  }, []);

  return (
    proceed && (
      <main className="w-full">
        <Header roomId={roomId} />

        <section className="flex gap-6 items-start mx-[20rem] max-2xl:mx-8 max-lg:mx-2 mt-4 max-lg:flex-col-reverse max-lg:gap-2 max-lg:mt-0">
          {/* Conversation */}
          <section className="w-[92%] flex flex-col gap-6 max-lg:w-full">
            <section className="w-full border border-violet-100 bg-violet-50/80 rounded-l-4xl max-md:rounded-l-2xl backdrop-blur-md max-lg:max-h-[67vh]">
              <ScrollArea
                ref={scrollRef}
                className="flex flex-col gap-3 h-[40rem] px-6 max-lg:h-[67vh] max-md:px-2"
              >
                <div>
                  {messages.map(
                    (
                      message: Message & {
                        fileData?: {
                          url: string;
                          filename: string;
                          size: number;
                          isOwn: boolean;
                        };
                      },
                      index: number
                    ) => (
                      <div
                        key={`message-${index}-${message.timestamp}`}
                        className="w-full"
                      >
                        {!message.isSystem &&
                          index > 0 &&
                          messages[index - 1].isSystem && (
                            <Separator className="my-4 max-md:my-3" />
                          )}
                        <div
                          className={cn(
                            message.isOwn
                              ? "w-fit ml-auto max-w-2/3 h-fit bg-violet-900 rounded-4xl p-4 mt-2.5 text-white shadow-violet-100 shadow-sm/5 max-md:max-w-full max-md:p-3 max-md:rounded-3xl"
                              : message.isSystem
                                ? "bg-yellow-50 border border-yellow-100 rounded-2xl p-3 text-yellow-700 text-sm mt-2 mb-2 max-md:max-w-full max-md:p-3 max-md:rounded-3xl"
                                : "w-fit max-w-2/3 h-fit bg-white rounded-4xl p-4 text-[#4A4751] shadow-violet-100 shadow-sm/5 mt-2.5 max-md:max-w-full max-md:p-3 max-md:rounded-3xl",
                            index === 0 && "mt-6 max-md:mt-3",
                            index === messages.length - 1 && "mb-6 max-md:mb-6"
                          )}
                        >
                          {message.fileData ? (
                            <div className="flex items-center gap-3">
                              <Button
                                className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 p-0"
                                onClick={() =>
                                  downloadFile(
                                    message.fileData!.url,
                                    message.fileData!.filename
                                  )
                                }
                              >
                                <Download className="w-5 h-5 text-white" />
                              </Button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-medium truncate text-ellipsis max-w-[10rem]">
                                    {message.fileData.filename}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-xs px-1.5 py-0.5 rounded",
                                      message.fileData.isOwn
                                        ? "bg-white/20 text-white"
                                        : "bg-violet-100 text-violet-700"
                                    )}
                                  >
                                    {getFileExtension(
                                      message.fileData.filename
                                    )}
                                  </span>
                                </div>
                                <div
                                  className={cn(
                                    "text-xs mb-2",
                                    message.fileData.isOwn
                                      ? "text-white/80"
                                      : "text-gray-500"
                                  )}
                                >
                                  {formatFileSize(message.fileData.size)}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="max-w-[80vw] break-words">
                              {message.content}
                            </p>
                          )}
                        </div>
                        {!message.isSystem &&
                          index < messages.length - 1 &&
                          messages[index + 1].isSystem && (
                            <Separator className="my-4" />
                          )}
                      </div>
                    )
                  )}

                  {/* Upload Progress Bubbles */}
                  {Array.from(
                    new Map(
                      Array.from(uploadProgress.values()).map((item) => [
                        item.filename,
                        item,
                      ])
                    ).values()
                  ).map(
                    (progress, index) =>
                      !progress.isComplete && (
                        <div
                          key={`progress-${index}`}
                          className="w-fit ml-auto max-w-2/3 h-fit bg-violet-900 rounded-4xl p-4 mt-2.5 text-white shadow-violet-100 shadow-sm/5 mb-6"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center">
                              {progress.isComplete ? (
                                <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                                  <Download className="w-5 h-5 text-white" />
                                </div>
                              ) : (
                                <div className="relative w-12 h-12">
                                  <svg
                                    className="w-12 h-12 transform -rotate-90"
                                    viewBox="0 0 48 48"
                                  >
                                    <circle
                                      cx="24"
                                      cy="24"
                                      r="20"
                                      stroke="rgba(255,255,255,0.3)"
                                      strokeWidth="4"
                                      fill="none"
                                    />
                                    <circle
                                      cx="24"
                                      cy="24"
                                      r="20"
                                      stroke="white"
                                      strokeWidth="4"
                                      fill="none"
                                      strokeDasharray={`${2 * Math.PI * 20}`}
                                      strokeDashoffset={`${2 * Math.PI * 20 * (1 - progress.progress / 100)}`}
                                      className="transition-all duration-300"
                                    />
                                  </svg>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="absolute inset-0 w-6 h-6 m-auto p-0 hover:bg-white/20"
                                    onClick={() =>
                                      cancelUpload(
                                        `${progress.filename}-${progress.peerId}`
                                      )
                                    }
                                  >
                                    <Square className="w-3 h-3 fill-current" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium truncate">
                                  {progress.filename}
                                </span>
                                <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded text-white">
                                  {progress.extension}
                                </span>
                              </div>
                              <div className="text-xs text-white/80">
                                {progress.isComplete
                                  ? "Uploaded"
                                  : `${progress.progress}%`}{" "}
                                • {progress.size}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                  )}
                </div>

                <ScrollBar />
              </ScrollArea>
            </section>

            {/* Controls */}
            <div className="flex items-center gap-3 max-lg:fixed max-lg:bottom-2 max-lg:left-0 max-lg:w-full max-lg:px-2 max-lg:max-h-[10vh]">
              <Button
                className="bg-violet-50/80 hover:bg-violet-100 text-[#949494] rounded-full border border-violet-100 w-[3.5rem] h-[3.5rem] flex-shrink-0"
                onClick={handleFileSelect}
              >
                <Paperclip className="scale-125" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="relative flex-1">
                <Input
                  placeholder="Text..."
                  className="h-[3.5rem] rounded-4xl indent-2 !bg-violet-50/80 pr-2"
                  value={inputValue}
                  onChange={handleInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      sendMessage(inputValue);
                    }
                  }}
                />
                {/* Enhanced File Attachments in Input */}
                {attachments.length > 0 && (
                  <div className="absolute bottom-14 left-3 right-3 bg-white rounded-xl border border-violet-200 shadow-lg max-h-24 overflow-y-auto">
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <File className="w-4 h-4 text-violet-600" />
                        <span className="text-xs font-medium text-gray-700">
                          {attachments.length} file
                          {attachments.length > 1 ? "s" : ""} selected
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex items-center gap-2 bg-violet-50 hover:bg-violet-100 rounded-lg px-3 py-2 text-xs transition-colors group"
                          >
                            <div className="flex items-center justify-center w-6 h-6 bg-violet-100 rounded-md">
                              <File className="w-3 h-3 text-violet-600" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="truncate max-w-[100px] font-medium text-gray-900">
                                {attachment.file.name}
                              </span>
                              <span className="text-gray-500">
                                {formatFileSize(attachment.file.size)}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-5 h-5 p-0 hover:bg-red-100 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeAttachment(attachment.id)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <Button
                className="bg-violet-900 hover:bg-violet-800 rounded-4xl h-[4.5rem] w-[4.5rem] flex-shrink-0"
                onClick={() => sendMessage(inputValue)}
              >
                <ArrowRight className="scale-150" />
              </Button>
            </div>
          </section>

          {/* Peers */}
          <section className="w-fit flex items-center max-lg:w-full max-lg:h-[10vh]">
            <ScrollArea className="pb-2.5">
              <div className="flex flex-col gap-3 max-lg:flex-row max-md:gap-1.5 max-h-[40rem] pr-4">
                <div className="flex items-center justify-center font-bold max-lg:font-semibold bg-cover bg-center aspect-square bg-gray-100 border text-slate-800 rounded-full w-[60px] h-[60px] max-md:w-[50px] max-md:h-[50px]">
                  You
                </div>
                <Separator className="max-lg:hidden" />
                <Separator
                  className="hidden max-lg:flex h-8 py-6 self-center mx-1"
                  orientation="vertical"
                />
                {peerIds.map((peerId, peerIndex) => (
                  <div
                    key={`peer-${peerIndex}`}
                    className="flex items-center justify-center font-bold max-lg:font-semibold bg-cover bg-center aspect-square bg-gray-200 rounded-full w-[60px] h-[60px] max-md:w-[50px] max-md:h-[50px]"
                    style={{
                      background:
                        peers.current.get(peerId)?.avatarStyle.color ?? "",
                      color:
                        peers.current.get(peerId)?.avatarStyle.textColor ?? "",
                    }}
                  >
                    {peers.current
                      ?.get(peerId)
                      ?.username.slice(0, 2)
                      ?.toUpperCase() ?? ""}
                  </div>
                ))}
              </div>
              <ScrollBar orientation="vertical" />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </section>
        </section>
      </main>
    )
  );
};

export default ChatPage;
