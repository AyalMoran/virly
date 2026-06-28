import { requireAuth } from "../auth.js";
import {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  createToken
} from "../../utils/auth.js";
import { createCsrfToken, hashCsrfToken } from "../../utils/session.js";
import { makeNext, makeReq, makeRes } from "./_httpStubs.js";

/** Build the cookie pair a logged-in browser would carry. */
function validSession() {
  const csrfToken = createCsrfToken();
  const authToken = createToken("user-1", hashCsrfToken(csrfToken));
  return {
    csrfToken,
    cookies: {
      [AUTH_COOKIE_NAME]: authToken,
      [CSRF_COOKIE_NAME]: csrfToken
    }
  };
}

test("401s when the auth cookie is missing", () => {
  const { res, captured } = makeRes();
  const { next, calls } = makeNext();
  requireAuth(makeReq(), res, next);
  expect(captured.status).toBe(401);
  expect((captured.body as { message: string }).message).toBe(
    "Authentication required."
  );
  expect(calls.length).toBe(0);
});

test("401s on a token signed with the wrong secret", () => {
  const { res, captured } = makeRes();
  const { next } = makeNext();
  requireAuth(makeReq({ cookies: { [AUTH_COOKIE_NAME]: "garbage" } }), res, next);
  expect(captured.status).toBe(401);
});

test("admits a valid token on a safe (GET) method and sets userId", () => {
  const { cookies } = validSession();
  const { res, captured } = makeRes();
  const { next, calls } = makeNext();
  const req = makeReq({ cookies });
  requireAuth(req, res, next);
  expect(captured.status).toBeNull();
  expect(calls.length).toBe(1);
  expect(req.userId).toBe("user-1");
});

test("403s an unsafe (POST) method without a matching CSRF header", () => {
  const { cookies } = validSession();
  const { res, captured } = makeRes();
  const { next, calls } = makeNext();
  requireAuth(makeReq({ method: "POST", cookies }), res, next);
  expect(captured.status).toBe(403);
  expect((captured.body as { message: string }).message).toBe(
    "Invalid CSRF token."
  );
  expect(calls.length).toBe(0);
});

test("admits an unsafe method when the CSRF header matches", () => {
  const { cookies, csrfToken } = validSession();
  const { res, captured } = makeRes();
  const { next, calls } = makeNext();
  const req = makeReq({
    method: "POST",
    cookies,
    headers: { "x-csrf-token": csrfToken }
  });
  requireAuth(req, res, next);
  expect(captured.status).toBeNull();
  expect(calls.length).toBe(1);
  expect(req.userId).toBe("user-1");
});
