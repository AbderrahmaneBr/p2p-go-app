export const wsUrl = `ws://localhost:8080/ws`;
export type MESSAGE_TYPE =
  | "JOIN_ROOM"
  | "SDP_OFFER"
  | "SDP_ANSWER"
  | "ICE_CANDIDATE"
  | "CHAT_MESSAGE"
  | "AUTH_SUCCESS"
  | "AUTH_ERROR"
  | "ROOM_MEMBERS"
  | "NEW_PEER_IN_ROOM";
