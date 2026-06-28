// src/realtime/server.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { io as ioClient } from "socket.io-client";
import { attachSocketServer } from "./server.js";
import { AUTH_COOKIE_NAME, signAuthCookieValue } from "./handshakeAuth.js";

test("authenticated client joins its room and receives an emitToUser event", async () => {
  const http = createServer();
  const { gateway } = attachSocketServer(http);
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as { port: number }).port;

  const client = ioClient(`http://localhost:${port}`, {
    extraHeaders: { cookie: `${AUTH_COOKIE_NAME}=${signAuthCookieValue("u1")}` }
  });

  const received = new Promise<{ amount: number }>((resolve) => {
    client.on("transfer:received", resolve);
  });
  await new Promise<void>((r) => client.on("connect", () => r()));
  gateway.emitToUser("u1", "transfer:received", { amount: 42, reason: null });

  const payload = await received;
  assert.equal(payload.amount, 42);
  client.close();
  http.close();
});
