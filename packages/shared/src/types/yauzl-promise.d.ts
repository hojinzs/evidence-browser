declare module "yauzl-promise" {
  import { Readable } from "stream";

  interface Entry {
    filename: string;
    uncompressedSize: number;
    compressedSize: number;
    openReadStream(): Promise<Readable>;
  }

  interface ZipFile {
    close(): Promise<void>;
    [Symbol.asyncIterator](): AsyncIterableIterator<Entry>;
  }

  interface OpenOptions {
    validateFilenames?: boolean;
  }

  function open(path: string, options?: OpenOptions): Promise<ZipFile>;
}
