export interface Message {
  id?: string;
  username: string;
  content: string;
  timestamp: number;
  isOwn?: boolean;
  isSystem?: boolean;
  fileData?: FileMessage;
}

export interface FileMessage {
  fileId: string;
  url: string;
  filename: string;
  size: number;
  isOwn: boolean;
}
