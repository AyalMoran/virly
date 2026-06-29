/**
 * Tests for ai.routes.ts — focused on the auth gate and input-validation
 * layer. The LLM graph (runAssistant / invokeV2Resumable / streamAssistantV2)
 * is not called for the validation tests; only the valid-message path
 * requires a thin stub so the route can reach the handler body.
 */
import http from "node:http";
import express from "express";
import { parseCookies } from "../../middleware/cookies.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import { setRepositories } from "../../repositories/index.js";
import type { Repositories } from "../../repositories/types.js";
import aiRoutes from "../ai.routes.js";
import { setAuthCookies } from "../../utils/session.js";

setRepositories(createMongoRepositories());

const userId = "507f1f77bcf86cd799439011";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

function patchRepos(overrides: Partial<Repositories>) {
  const base = createMongoRepositories();
  setRepositories({ ...base, ...overrides });
  cleanups.push(() => setRepositories(base));
}

// ---------------------------------------------------------------------------
// withServer
// ---------------------------------------------------------------------------

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(parseCookies);
  app.use(express.json());

  app.post("/issue", (_req, res) => {
    const csrfToken = setAuthCookies(res, userId);
    return res.json({ csrfToken });
  });

  app.use("/api/ai", aiRoutes);
  app.use(errorHandler);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected local HTTP server address");
    }
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((e) => (e ? reject(e) : resolve()));
    });
  }
}

function getSetCookieHeaders(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (headers.getSetCookie) return headers.getSetCookie();
  const combined = response.headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*virly_)/) : [];
}

async function issueAuth(baseUrl: string) {
  const res = await fetch(`${baseUrl}/issue`, { method: "POST" });
  const cookie = getSetCookieHeaders(res)
    .map((h) => h.split(";")[0])
    .join("; ");
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  return { cookie, csrfToken };
}

async function postJson(
  baseUrl: string,
  path: string,
  auth: { cookie: string; csrfToken: string },
  body: unknown
) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: auth.cookie,
      "X-CSRF-Token": auth.csrfToken
    },
    body: JSON.stringify(body)
  });
}

// ---------------------------------------------------------------------------
// POST /api/ai/chat — auth gate
// ---------------------------------------------------------------------------

describe("POST /api/ai/chat — authentication", () => {
  test("401 when no auth cookie is present", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" })
      });
      expect(res.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/ai/chat — input validation (Zod schema)
// ---------------------------------------------------------------------------

describe("POST /api/ai/chat — input validation", () => {
  test("400 when message is missing", async () => {
    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, "/api/ai/chat", auth, {});
      expect(res.status).toBe(400);
    });
  });

  test("400 when message is an empty string", async () => {
    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, "/api/ai/chat", auth, { message: "" });
      expect(res.status).toBe(400);
    });
  });

  test("400 when message exceeds 2000 characters", async () => {
    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, "/api/ai/chat", auth, {
        message: "x".repeat(2001)
      });
      expect(res.status).toBe(400);
    });
  });

  test("400 when assistantId is not one of the allowed enum values", async () => {
    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, "/api/ai/chat", auth, {
        message: "hello",
        assistantId: "not-a-valid-assistant"
      });
      expect(res.status).toBe(400);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/ai/chat/stream — auth gate
// ---------------------------------------------------------------------------

describe("POST /api/ai/chat/stream — authentication", () => {
  test("401 when no auth cookie is present", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" })
      });
      expect(res.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/ai/chat/stream — input validation
// ---------------------------------------------------------------------------

describe("POST /api/ai/chat/stream — input validation", () => {
  test("400 when message is missing (before headers are flushed)", async () => {
    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, "/api/ai/chat/stream", auth, {});
      expect(res.status).toBe(400);
    });
  });

  test("400 when message is empty (before headers are flushed)", async () => {
    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, "/api/ai/chat/stream", auth, { message: "   " });
      expect(res.status).toBe(400);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/ai/confirmations/:id — auth gate
// ---------------------------------------------------------------------------

describe("POST /api/ai/confirmations/:id — authentication", () => {
  test("401 when no auth cookie is present", async () => {
    const validId = "507f1f77bcf86cd799439011";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/confirmations/${validId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", version: 1 })
      });
      expect(res.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/ai/confirmations/:id — input validation
// ---------------------------------------------------------------------------

describe("POST /api/ai/confirmations/:id — input validation", () => {
  test("400 when the confirmation id is not a 24-hex ObjectId", async () => {
    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, "/api/ai/confirmations/not-valid", auth, {
        action: "confirm",
        version: 1
      });
      expect(res.status).toBe(400);
    });
  });

  test("400 when action is not confirm or deny", async () => {
    const validId = "507f1f77bcf86cd799439011";
    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, `/api/ai/confirmations/${validId}`, auth, {
        action: "approve",
        version: 1
      });
      expect(res.status).toBe(400);
    });
  });

  test("400 when version is not a positive integer", async () => {
    const validId = "507f1f77bcf86cd799439011";
    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, `/api/ai/confirmations/${validId}`, auth, {
        action: "confirm",
        version: 0
      });
      expect(res.status).toBe(400);
    });
  });
});
