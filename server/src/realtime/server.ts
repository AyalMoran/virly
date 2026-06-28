// src/realtime/server.ts
import { Server as IOServer } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { config } from "../config.js";
import { userIdFromCookieHeader } from "./handshakeAuth.js";
import { userRoom } from "./rooms.js";
import type { RealtimeGateway } from "./types.js";

export function attachSocketServer(
  httpServer: HttpServer,
  opts: { cors?: string[] } = {}
): { gateway: RealtimeGateway; io: IOServer } {
  const io = new IOServer(httpServer, {
    cors: { origin: opts.cors ?? config.clientUrls, credentials: true }
  });

  // Authenticate every handshake with the JWT cookie; reject anonymous sockets.
  io.use((socket, next) => {
    const userId = userIdFromCookieHeader(socket.handshake.headers.cookie);
    if (!userId) {
      next(new Error("unauthorized"));
      return;
    }
    socket.data.userId = userId;
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(userRoom(userId));
  });

  const gateway: RealtimeGateway = {
    emitToUser(userId, event, payload) {
      io.to(userRoom(userId)).emit(event, payload);
    }
  };

  return { gateway, io };
}
