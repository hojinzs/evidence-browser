import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

class MemoryTransport implements Transport {
  peer: MemoryTransport | null = null;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {
    // No connection setup is required for in-memory test transport.
  }

  async send(message: JSONRPCMessage): Promise<void> {
    queueMicrotask(() => {
      this.peer?.onmessage?.(message);
    });
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}

export function createTransportPair() {
  const serverTransport = new MemoryTransport();
  const clientTransport = new MemoryTransport();
  serverTransport.peer = clientTransport;
  clientTransport.peer = serverTransport;
  return { serverTransport, clientTransport };
}
