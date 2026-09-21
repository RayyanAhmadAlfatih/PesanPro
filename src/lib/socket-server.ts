import type { Server } from "socket.io";

type GlobalWithSocketServer = typeof globalThis & { io?: Server };

export function getSocketServer(): Server | undefined {
    return (globalThis as GlobalWithSocketServer).io;
}
