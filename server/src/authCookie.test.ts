import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { requireAuth } from "./middleware/auth.js";
import { parseCookies } from "./middleware/cookies.js";
import { clearAuthCookies, setAuthCookies } from "./utils/session.js";

function getSetCookieHeaders(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (headers.getSetCookie) {
    return headers.getSetCookie();
  }

  const combinedHeader = response.headers.get("set-cookie");
  return combinedHeader ? combinedHeader.split(/,(?=\s*virly_)/) : [];
}

function toCookieHeader(setCookieHeaders: string[]) {
  return setCookieHeaders
    .map((header) => header.split(";")[0])
    .join("; ");
}

function getCookieValue(setCookieHeaders: string[], name: string) {
  const prefix = `${name}=`;
  const cookie = setCookieHeaders
    .map((header) => header.split(";")[0])
    .find((header) => header.startsWith(prefix));

  return cookie?.slice(prefix.length) ?? null;
}

function getJwtLifetimeSeconds(token: string) {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8")
  ) as { exp: number; iat: number };

  return payload.exp - payload.iat;
}

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(parseCookies);

  app.post("/issue", (_req, res) => {
    const csrfToken = setAuthCookies(res, "507f1f77bcf86cd799439011");
    return res.json({ user: { id: "507f1f77bcf86cd799439011" }, csrfToken });
  });
  app.post("/issue-persistent", (_req, res) => {
    const csrfToken = setAuthCookies(res, "507f1f77bcf86cd799439011", {
      rememberMe: true
    });
    return res.json({ user: { id: "507f1f77bcf86cd799439011" }, csrfToken });
  });
  app.get("/protected", requireAuth, (req, res) => {
    return res.json({ userId: req.userId, csrfToken: req.csrfToken });
  });
  app.post("/protected", requireAuth, (req, res) => {
    return res.json({ userId: req.userId });
  });
  app.post("/logout", requireAuth, (_req, res) => {
    clearAuthCookies(res);
    return res.json({ message: "Logged out." });
  });

  const server = await new Promise<http.Server>((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.notEqual(typeof address, "string");

    if (!address || typeof address === "string") {
      throw new Error("Expected local HTTP server address.");
    }

    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test("auth session is issued in secure cookies without a response auth token", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/issue`, { method: "POST" });
    const body = (await response.json()) as { csrfToken?: string; token?: string };
    const setCookieHeaders = getSetCookieHeaders(response);
    const csrfToken = getCookieValue(setCookieHeaders, "virly_csrf");

    assert.equal(response.status, 200);
    assert.equal(body.token, undefined);
    assert.equal(body.csrfToken, decodeURIComponent(csrfToken ?? ""));
    assert.ok(
      setCookieHeaders.some(
        (header) =>
          header.startsWith("virly_auth=") &&
          header.includes("HttpOnly") &&
          header.includes("Secure") &&
          header.includes("SameSite=Lax")
      )
    );
    assert.ok(
      setCookieHeaders.some(
        (header) =>
          header.startsWith("virly_csrf=") &&
          !header.includes("HttpOnly") &&
          header.includes("Secure") &&
          header.includes("SameSite=Lax")
      )
    );
  });
});

test("default auth session cookies do not set max age or expires", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/issue`, { method: "POST" });
    const setCookieHeaders = getSetCookieHeaders(response);
    const authCookie = setCookieHeaders.find((header) =>
      header.startsWith("virly_auth=")
    );
    const csrfCookie = setCookieHeaders.find((header) =>
      header.startsWith("virly_csrf=")
    );

    assert.ok(authCookie);
    assert.ok(csrfCookie);
    assert.equal(authCookie.includes("Max-Age="), false);
    assert.equal(authCookie.includes("Expires="), false);
    assert.equal(csrfCookie.includes("Max-Age="), false);
    assert.equal(csrfCookie.includes("Expires="), false);
  });
});

test("remembered auth session cookies set a persistent max age", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/issue-persistent`, { method: "POST" });
    const setCookieHeaders = getSetCookieHeaders(response);
    const authCookie = setCookieHeaders.find((header) =>
      header.startsWith("virly_auth=")
    );
    const csrfCookie = setCookieHeaders.find((header) =>
      header.startsWith("virly_csrf=")
    );

    assert.ok(authCookie);
    assert.ok(csrfCookie);
    assert.ok(authCookie.includes("Max-Age=2592000"));
    assert.ok(csrfCookie.includes("Max-Age=2592000"));
    assert.equal(
      getJwtLifetimeSeconds(decodeURIComponent(getCookieValue(setCookieHeaders, "virly_auth") ?? "")),
      2592000
    );
  });
});

test("protected route rejects missing auth cookie", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/protected`);
    const body = (await response.json()) as { message: string };

    assert.equal(response.status, 401);
    assert.equal(body.message, "Authentication required.");
  });
});

test("protected route accepts a valid auth cookie", async () => {
  await withServer(async (baseUrl) => {
    const issueResponse = await fetch(`${baseUrl}/issue`, { method: "POST" });
    const setCookieHeaders = getSetCookieHeaders(issueResponse);
    const cookieHeader = toCookieHeader(setCookieHeaders);
    const csrfToken = getCookieValue(setCookieHeaders, "virly_csrf");

    const response = await fetch(`${baseUrl}/protected`, {
      headers: { Cookie: cookieHeader }
    });
    const body = (await response.json()) as { userId: string; csrfToken?: string };

    assert.equal(response.status, 200);
    assert.equal(body.userId, "507f1f77bcf86cd799439011");
    assert.equal(body.csrfToken, decodeURIComponent(csrfToken ?? ""));
  });
});

test("unsafe protected route requires a matching csrf token", async () => {
  await withServer(async (baseUrl) => {
    const issueResponse = await fetch(`${baseUrl}/issue`, { method: "POST" });
    const setCookieHeaders = getSetCookieHeaders(issueResponse);
    const cookieHeader = toCookieHeader(setCookieHeaders);
    const csrfToken = getCookieValue(setCookieHeaders, "virly_csrf");

    const missingCsrfResponse = await fetch(`${baseUrl}/protected`, {
      method: "POST",
      headers: { Cookie: cookieHeader }
    });
    assert.equal(missingCsrfResponse.status, 403);

    const validCsrfResponse = await fetch(`${baseUrl}/protected`, {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        "X-CSRF-Token": decodeURIComponent(csrfToken ?? "")
      }
    });
    assert.equal(validCsrfResponse.status, 200);
  });
});

test("logout clears auth and csrf cookies", async () => {
  await withServer(async (baseUrl) => {
    const issueResponse = await fetch(`${baseUrl}/issue`, { method: "POST" });
    const setCookieHeaders = getSetCookieHeaders(issueResponse);
    const cookieHeader = toCookieHeader(setCookieHeaders);
    const csrfToken = getCookieValue(setCookieHeaders, "virly_csrf");

    const response = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        "X-CSRF-Token": decodeURIComponent(csrfToken ?? "")
      }
    });
    const logoutCookies = getSetCookieHeaders(response);

    assert.equal(response.status, 200);
    assert.ok(
      logoutCookies.some(
        (header) => header.startsWith("virly_auth=;") && header.includes("Expires=")
      )
    );
    assert.ok(
      logoutCookies.some(
        (header) => header.startsWith("virly_csrf=;") && header.includes("Expires=")
      )
    );
  });
});
