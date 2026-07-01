import http from "node:http";
import { jest } from "@jest/globals";
import express from "express";
import { parseCookies } from "../../middleware/cookies.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { setAuthCookies } from "../../utils/session.js";
import type { CommunicationProfile } from "../../domain/communicationProfile.js";

// ---------------------------------------------------------------------------
// Mock the service BEFORE importing the routes module.
// ---------------------------------------------------------------------------

const stubProfile: CommunicationProfile = {
  formality: null,
  verbosity: { value: "brief", provenance: "user_set", updatedAt: "2026-07-01T00:00:00.000Z" },
  complexity: null,
  humor: null,
  pace: null,
  memory: "",
};

const getForUser = jest.fn(async (_userId: string) => stubProfile);
const updateFromUser = jest.fn(async (_userId: string, _input: unknown, _now: Date) => stubProfile);
const reset = jest.fn(async (_userId: string) => undefined);

jest.unstable_mockModule("../../services/communicationProfile.service.js", () => ({
  communicationProfileService: { getForUser, updateFromUser, reset },
}));

// Import the routes AFTER the mock is wired up.
const { default: communicationProfileRoutes } = await import("../communicationProfile.routes.js");

// ---------------------------------------------------------------------------
// Server factory - mirrors the pattern in user.routes.test.ts
// ---------------------------------------------------------------------------

const userId = "507f1f77bcf86cd799439011";

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(parseCookies);
  app.use(express.json());

  // Tiny endpoint that issues real auth cookies so the requireAuth middleware
  // accepts subsequent requests - same approach as user.routes.test.ts.
  app.post("/issue", (_req, res) => {
    const csrfToken = setAuthCookies(res, userId);
    return res.json({ csrfToken });
  });

  app.use("/api/accounts", communicationProfileRoutes);
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

beforeEach(() => {
  getForUser.mockClear();
  updateFromUser.mockClear();
  reset.mockClear();
});

// ---------------------------------------------------------------------------
// GET /api/accounts/communication-profile
// ---------------------------------------------------------------------------

describe("GET /api/accounts/communication-profile", () => {
  test("401 when not authenticated", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/accounts/communication-profile`);
      expect(res.status).toBe(401);
    });
  });

  test("200 returns the profile from the service", async () => {
    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/accounts/communication-profile`, {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { communicationProfile: CommunicationProfile };
      expect(body.communicationProfile).toBeDefined();
      expect(body.communicationProfile.verbosity?.value).toBe("brief");
    });
  });

  test("200 returns empty profile when service returns null", async () => {
    getForUser.mockResolvedValueOnce(null as unknown as CommunicationProfile);
    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/accounts/communication-profile`, {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { communicationProfile: CommunicationProfile };
      expect(body.communicationProfile.formality).toBeNull();
      expect(body.communicationProfile.verbosity).toBeNull();
      expect(body.communicationProfile.memory).toBe("");
    });
  });
});

// ---------------------------------------------------------------------------
// PUT /api/accounts/communication-profile
// ---------------------------------------------------------------------------

describe("PUT /api/accounts/communication-profile", () => {
  test("401 when not authenticated", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/accounts/communication-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verbosity: "brief" }),
      });
      expect(res.status).toBe(401);
    });
  });

  test("403 when CSRF token is missing", async () => {
    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/accounts/communication-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ verbosity: "brief" }),
      });
      expect(res.status).toBe(403);
    });
  });

  test("PUT strips unknown keys before reaching the service", async () => {
    await withServer(async (baseUrl) => {
      const { cookie, csrfToken } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/accounts/communication-profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-CSRF-Token": csrfToken,
        },
        // confirmAboveAmount is NOT a known key in communicationProfileUserInputSchema
        // and must be stripped by Zod's .strip() before the service is called.
        body: JSON.stringify({ verbosity: "brief", confirmAboveAmount: 0 }),
      });
      expect(res.status).toBe(200);
      // The service must have been called WITHOUT confirmAboveAmount.
      expect(updateFromUser).toHaveBeenCalledTimes(1);
      expect(updateFromUser).toHaveBeenCalledWith(
        expect.any(String),
        { verbosity: "brief" },
        expect.any(Date),
      );
    });
  });

  test("400 on an invalid enum value", async () => {
    await withServer(async (baseUrl) => {
      const { cookie, csrfToken } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/accounts/communication-profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ verbosity: "not-a-valid-value" }),
      });
      expect(res.status).toBe(400);
    });
  });

  test("200 returns updated profile", async () => {
    await withServer(async (baseUrl) => {
      const { cookie, csrfToken } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/accounts/communication-profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ verbosity: "brief" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { communicationProfile: CommunicationProfile };
      expect(body.communicationProfile.verbosity?.value).toBe("brief");
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/accounts/communication-profile/reset
// ---------------------------------------------------------------------------

describe("POST /api/accounts/communication-profile/reset", () => {
  test("401 when not authenticated", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/accounts/communication-profile/reset`, {
        method: "POST",
      });
      expect(res.status).toBe(401);
    });
  });

  test("403 when CSRF token is missing", async () => {
    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/accounts/communication-profile/reset`, {
        method: "POST",
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(403);
    });
  });

  test("200 returns empty profile after reset", async () => {
    await withServer(async (baseUrl) => {
      const { cookie, csrfToken } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/accounts/communication-profile/reset`, {
        method: "POST",
        headers: { Cookie: cookie, "X-CSRF-Token": csrfToken },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { communicationProfile: CommunicationProfile };
      expect(body.communicationProfile.formality).toBeNull();
      expect(body.communicationProfile.verbosity).toBeNull();
      expect(body.communicationProfile.memory).toBe("");
      expect(reset).toHaveBeenCalledWith(userId);
    });
  });
});
