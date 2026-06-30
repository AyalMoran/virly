// src/realtime/server.test.ts
import { createServer } from "node:http";
import { io as ioClient } from "socket.io-client";
import { attachSocketServer } from "../server.js";
import { AUTH_COOKIE_NAME, signAuthCookieValue } from "../handshakeAuth.js";

function timeoutReject(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
  );
}

test("authenticated client joins its room and receives an emitToUser event", async () => {
  const http = createServer();
  const { gateway } = attachSocketServer(http);
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as { port: number }).port;

  const client = ioClient(`http://localhost:${port}`, {
    extraHeaders: { cookie: `${AUTH_COOKIE_NAME}=${signAuthCookieValue("u1")}` }
  });

  try {
    const received = new Promise<{ amount: number }>((resolve, reject) => {
      client.on("transfer:received", resolve);
      client.on("connect_error", reject);
    });
    await new Promise<void>((resolve, reject) => {
      client.on("connect", () => resolve());
      client.on("connect_error", reject);
    });
    gateway.emitToUser("u1", "transfer:received", { amount: 42, reason: null });

    const payload = await Promise.race([received, timeoutReject(5000)]);
    expect(payload.amount).toBe(42);
  } finally {
    client.close();
    http.close();
  }
});

test("emitToUser is isolated per user: u2 never receives u1's event", async () => {
  const http = createServer();
  const { gateway } = attachSocketServer(http);
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as { port: number }).port;

  const c1 = ioClient(`http://localhost:${port}`, {
    extraHeaders: { cookie: `${AUTH_COOKIE_NAME}=${signAuthCookieValue("u1")}` }
  });
  const c2 = ioClient(`http://localhost:${port}`, {
    extraHeaders: { cookie: `${AUTH_COOKIE_NAME}=${signAuthCookieValue("u2")}` }
  });

  try {
    // Wait for BOTH sockets to connect so the emit lands after they joined rooms.
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        c1.on("connect", () => resolve());
        c1.on("connect_error", reject);
      }),
      new Promise<void>((resolve, reject) => {
        c2.on("connect", () => resolve());
        c2.on("connect_error", reject);
      })
    ]);

    // u2 must receive NOTHING. Flag if it ever fires.
    const leaked = new Promise<never>((_, reject) =>
      c2.on("transfer:received", (p) =>
        reject(new Error(`u2 leaked event: ${JSON.stringify(p)}`))
      )
    );
    // u1 SHOULD receive it — guards against a vacuously-passing test where emit broke.
    const u1Received = new Promise<{ amount: number }>((resolve) =>
      c1.on("transfer:received", resolve)
    );

    gateway.emitToUser("u1", "transfer:received", { amount: 7, reason: null });

    // u1 gets it; race u2-leak against a quiet window that resolves to "no leak".
    const payload = await Promise.race([u1Received, timeoutReject(5000)]);
    expect(payload.amount).toBe(7); // u1 must receive its own event

    const noLeak = new Promise<"clean">((resolve) =>
      setTimeout(() => resolve("clean"), 700)
    );
    const outcome = await Promise.race([leaked, noLeak]);
    expect(outcome).toBe("clean"); // u2 must not receive u1's event
  } finally {
    c1.close();
    c2.close();
    http.close();
  }
});

test("rejects an unauthenticated socket (no cookie)", async () => {
  const http = createServer();
  attachSocketServer(http);
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as { port: number }).port;

  const client = ioClient(`http://localhost:${port}`, {
    reconnection: false
  });

  try {
    await Promise.race([
      new Promise<void>((_, reject) => {
        client.on("connect_error", (err) => {
          expect(err.message).toMatch(/unauthorized/);
          reject(Object.assign(new Error("_pass_"), { __pass: true }));
        });
        client.on("connect", () => {
          reject(new Error("anonymous socket should not have connected"));
        });
      }),
      timeoutReject(5000)
    ]);
  } catch (err: unknown) {
    if (err instanceof Error && (err as { __pass?: boolean }).__pass === true) {
      // connect_error fired as expected — test passes
      return;
    }
    throw err;
  } finally {
    client.close();
    http.close();
  }
});
