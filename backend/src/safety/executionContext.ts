// backend/src/safety/executionContext.ts
import { AsyncLocalStorage } from "node:async_hooks";
import type { Socket } from "socket.io";

export interface ExecutionContextData {
    socket: Socket;
    sessionId: string;
}

// This allows deep tools (like fileSystem.ts) to access the specific socket 
// connection that initiated the chat, guaranteeing session isolation.
export const executionContext = new AsyncLocalStorage<ExecutionContextData>();