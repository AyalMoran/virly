import { jest } from "@jest/globals";
import {
  ApiError,
  api,
  normalizeEmail,
  setUnauthorizedHandler,
  supportsAiChatStreaming
} from "../api";

type FetchInit = { method?: string; body?: string; headers?: Headers };

const realFetch = (globalThis as { fetch?: unknown }).fetch;
const realDocument = (globalThis as { document?: unknown }).document;

function stubResponse(status: number, bodyObj: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(bodyObj)
  };
}

let fetchMock: ReturnType<typeof jest.fn>;

beforeEach(() => {
  fetchMock = jest.fn();
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  // GET paths skip cookies, but POST paths read document.cookie for CSRF.
  (globalThis as { document?: unknown }).document = { cookie: "" };
});

afterEach(() => {
  (globalThis as { fetch?: unknown }).fetch = realFetch;
  (globalThis as { document?: unknown }).document = realDocument;
  setUnauthorizedHandler(null);
});

describe("normalizeEmail", () => {
  test("extracts and lowercases an email from surrounding text", () => {
    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com");
    expect(normalizeEmail("send to Bob@Mail.io please")).toBe("bob@mail.io");
  });
  test("returns the trimmed text when no email is present", () => {
    expect(normalizeEmail("  no email here ")).toBe("no email here");
    expect(normalizeEmail(null)).toBe("");
  });
});

describe("ApiError", () => {
  test("maps issues to a path->message record and keeps details", () => {
    const err = new ApiError(422, {
      message: "Invalid",
      issues: [{ path: "email", message: "bad" }],
      details: ["x"]
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(422);
    expect(err.message).toBe("Invalid");
    expect(err.issues).toStrictEqual({ email: "bad" });
    expect(err.details).toStrictEqual(["x"]);
  });

  test("defaults the message when the body has none", () => {
    expect(new ApiError(500, {}).message).toBe("Request failed.");
  });
});

describe("supportsAiChatStreaming", () => {
  test("is true when ReadableStream and TextDecoder exist", () => {
    expect(supportsAiChatStreaming()).toBe(true);
  });
});

describe("request flows", () => {
  test("a GET resolves to the parsed JSON body", async () => {
    fetchMock.mockResolvedValue(stubResponse(200, { user: { id: "u1" } }));
    const result = await api.me();
    expect(result).toStrictEqual({ user: { id: "u1" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toBe("http://localhost:3000/api/auth/me");
    expect(init.headers?.get("Accept")).toBe("application/json");
  });

  test("a POST sends a normalized JSON body with the right method", async () => {
    fetchMock.mockResolvedValue(stubResponse(200, { user: { id: "u1" } }));
    await api.login({ email: "Alice@Example.com", password: "pw", rememberMe: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toBe("http://localhost:3000/api/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body!)).toStrictEqual({
      email: "alice@example.com",
      password: "pw",
      rememberMe: true
    });
    expect(init.headers?.get("Content-Type")).toBe("application/json");
  });

  test("a non-OK response throws an ApiError carrying the status", async () => {
    fetchMock.mockResolvedValue(stubResponse(409, { message: "Conflict" }));
    const err = await api.me().then(() => null, (e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).message).toBe("Conflict");
  });

  test("a 401 invokes the unauthorized handler", async () => {
    const onUnauth = jest.fn();
    setUnauthorizedHandler(onUnauth);
    fetchMock.mockResolvedValue(stubResponse(401, { message: "Unauthorized" }));
    await api.me().catch(() => undefined);
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });

  test("a non-JSON error body degrades to a friendly ApiError message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "<html>Bad Gateway</html>"
    });
    const err = await api.me().then(() => null, (e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("Unexpected server response (HTTP 502).");
  });
});
