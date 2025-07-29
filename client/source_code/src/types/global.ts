export type FileChunkMessage = {
  type: "FILE_CHUNK";
  filename: string;
  chunk: number[];
  isLastChunk: boolean;
};

export interface FileAttachment {
  file: File;
  id: string;
}

export interface FileUploadProgress {
  filename: string;
  progress: number;
  isComplete: boolean;
  peerId: string;
  size: string;
  extension: string;
}
