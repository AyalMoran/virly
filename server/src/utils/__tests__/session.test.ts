import {
  clearAuthCookies,
  createCsrfToken,
  hashCsrfToken,
  setAuthCookies
} from "../session.js";
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME } from "../auth.js";
import { hashToken } from "../token.js";

type CookieCall = { name: string; value: string; options: Record<string, unknown> };

function makeResStub() {
  const cookies: CookieCall[] = [];
  const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
  const res = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies.push({ name, value, options });
      return res;
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      cleared.push({ name, options });
      return res;
    }
  };
  // The util only uses res.cookie / res.clearCookie.
  return { res: res as never, cookies, cleared };
}

describe("createCsrfToken", () => {
  test("produces a url-safe base64 token", () => {
    const token = createCsrfToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(20);
  });

  test("is unique per call", () => {
    expect(createCsrfToken()).not.toBe(createCsrfToken());
  });
});

describe("hashCsrfToken", () => {
  test("delegates to the sha256 token hash", () => {
    expect(hashCsrfToken("abc")).toBe(hashToken("abc"));
  });
});

describe("setAuthCookies", () => {
  test("sets httpOnly auth + readable csrf cookies and returns the csrf token", () => {
    const { res, cookies } = makeResStub();
    const csrf = setAuthCookies(res, "user-1");

    const auth = cookies.find((c) => c.name === AUTH_COOKIE_NAME);
    const csrfCookie = cookies.find((c) => c.name === CSRF_COOKIE_NAME);

    expect(auth?.options.httpOnly).toBe(true);
    expect(csrfCookie?.options.httpOnly).toBe(false);
    expect(csrfCookie?.value).toBe(csrf);
    // No maxAge for a non-persistent session.
    expect(auth?.options.maxAge).toBeUndefined();
  });

  test("rememberMe adds a persistent maxAge", () => {
    const { res, cookies } = makeResStub();
    setAuthCookies(res, "user-1", { rememberMe: true });
    const auth = cookies.find((c) => c.name === AUTH_COOKIE_NAME);
    expect(auth?.options.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("clearAuthCookies", () => {
  test("clears both auth and csrf cookies", () => {
    const { res, cleared } = makeResStub();
    clearAuthCookies(res);
    const names = cleared.map((c) => c.name);
    expect(names).toContain(AUTH_COOKIE_NAME);
    expect(names).toContain(CSRF_COOKIE_NAME);
  });
});
