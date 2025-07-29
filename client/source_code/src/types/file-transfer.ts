export interface FileTransfer {
  chunks: Uint8Array[];
  meta: {
    filename: string;
    size: number;
    mime: string;
  };
  sender: string;
}
