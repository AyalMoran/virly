import type {
  AccountSummary,
  AiConfirmationAction,
  AiConfirmationResponse,
  AiChatRequest,
  AiChatResponse,
  AiChatStreamEvent,
  AiChatStreamStatusEvent,
  ApiErrorBody,
  AuthSuccessResponse,
  LoginRequest,
  PersonalDetailsRequest,
  PersonalDetailsResponse,
  RegisterRequest,
  TransactionsResponse,
  TransferRequest,
  TransferResponse
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

let cachedCsrfToken: string | null = null;

export class ApiError extends Error {
  readonly status: number;
  readonly issues: Record<string, string>;
  readonly details: string[];

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? "Request failed.");
    this.name = "ApiError";
    this.status = status;
    this.issues = Object.fromEntries(
      (body.issues ?? []).map((issue) => [issue.path, issue.message])
    );
    this.details = body.details ?? [];
  }
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export function normalizeEmail(raw: unknown): string {
  const text = String(raw ?? "").trim();
  const match = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return match?.[0]?.toLowerCase() ?? text;
}

function readCookie(name: string) {
  const prefix = `${name}=`;
  return (
    document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function isUnsafeMethod(method: string | undefined) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method?.toUpperCase() ?? "GET");
}

function buildHeaders(options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (isUnsafeMethod(options.method)) {
    const csrfToken = readCookie("virly_csrf") ?? cachedCsrfToken;
    if (csrfToken) {
      headers.set("X-CSRF-Token", decodeURIComponent(csrfToken));
    }
  }

  return headers;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = buildHeaders(options);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (typeof body.csrfToken === "string") {
    cachedCsrfToken = body.csrfToken;
  }

  if (!response.ok) {
    if (response.status === 401) {
      cachedCsrfToken = null;
      onUnauthorized?.();
    }

    throw new ApiError(response.status, body);
  }

  return body as T;
}

function parseSseEventBlock(block: string): AiChatStreamEvent | null {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const dataLine = lines.find((line) => line.startsWith("data: "));
  if (!dataLine) {
    return null;
  }

  return JSON.parse(dataLine.slice("data: ".length)) as AiChatStreamEvent;
}

async function requestEventStream(
  path: string,
  options: RequestInit,
  handlers: {
    onStatus?: (event: AiChatStreamStatusEvent) => void;
  } = {}
) {
  const headers = buildHeaders(options);
  headers.set("Accept", "text/event-stream");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};

    if (response.status === 401) {
      cachedCsrfToken = null;
      onUnauthorized?.();
    }

    throw new ApiError(response.status, body);
  }

  if (!response.body) {
    throw new Error("Streaming is not supported in this browser session.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AiChatResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\n\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseSseEventBlock(block);
      if (!event) {
        continue;
      }

      if (event.type === "status") {
        handlers.onStatus?.(event);
        continue;
      }

      if (event.type === "result") {
        finalResult = event.result;
        continue;
      }

      if (event.type === "error") {
        throw new Error(event.message || "Streaming request failed.");
      }
    }
  }

  if (!finalResult) {
    throw new Error("Streaming response ended before the final assistant result.");
  }

  return finalResult;
}

export function supportsAiChatStreaming() {
  return typeof ReadableStream !== "undefined" && typeof TextDecoder !== "undefined";
}

export const api = {
  register(payload: RegisterRequest) {
    return request<{ message: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: normalizeEmail(payload.email),
        password: payload.password,
        phone: payload.phone.trim()
      })
    });
  },
  resendVerification(email: string) {
    return request<{ message: string }>("/api/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email: normalizeEmail(email) })
    });
  },
  verify(token: string) {
    return request<AuthSuccessResponse>(
      `/api/auth/verify?token=${encodeURIComponent(token)}`
    );
  },
  login(payload: LoginRequest) {
    return request<AuthSuccessResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: normalizeEmail(payload.email),
        password: payload.password,
        rememberMe: payload.rememberMe
      })
    });
  },
  logout() {
    return request<{ message: string }>("/api/auth/logout", {
      method: "POST"
    }).finally(() => {
      cachedCsrfToken = null;
    });
  },
  me() {
    return request<AuthSuccessResponse>("/api/auth/me");
  },
  accountSummary(page = 1, limit = 10) {
    return request<AccountSummary>(`/api/accounts/me?page=${page}&limit=${limit}`);
  },
  personalDetails() {
    return request<PersonalDetailsResponse>("/api/accounts/personal-details");
  },
  updatePersonalDetails(payload: PersonalDetailsRequest) {
    return request<PersonalDetailsResponse>("/api/accounts/personal-details", {
      method: "PUT",
      body: JSON.stringify({
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        dateOfBirth: payload.dateOfBirth,
        address: {
          country: payload.address.country.trim(),
          stateRegion: payload.address.stateRegion?.trim() || null,
          city: payload.address.city.trim(),
          street: payload.address.street.trim(),
          addressLine2: payload.address.addressLine2?.trim() || null,
          postalCode: payload.address.postalCode.trim()
        }
      })
    });
  },
  skipPersonalDetails() {
    return request<{ message: string } & PersonalDetailsResponse>(
      "/api/accounts/personal-details/skip",
      {
        method: "POST"
      }
    );
  },
  transactions(params: { page?: number; limit?: number; counterparty?: string }) {
    const search = new URLSearchParams();
    search.set("page", String(params.page ?? 1));
    search.set("limit", String(params.limit ?? 10));

    if (params.counterparty?.trim()) {
      search.set("counterparty", normalizeEmail(params.counterparty));
    }

    return request<TransactionsResponse>(`/api/transactions?${search.toString()}`);
  },
  transfer(payload: TransferRequest) {
    const reason = payload.reason?.trim();

    return request<TransferResponse>("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        recipientEmail: normalizeEmail(payload.recipientEmail),
        amount: payload.amount,
        ...(reason ? { reason } : {})
      })
    });
  },
  aiChat(payload: AiChatRequest) {
    return request<AiChatResponse>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({
        message: payload.message.trim(),
        ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
        ...(payload.assistantId ? { assistantId: payload.assistantId } : {})
      })
    });
  },
  aiChatStream(
    payload: AiChatRequest,
    handlers: {
      onStatus?: (event: AiChatStreamStatusEvent) => void;
    } = {}
  ) {
    return requestEventStream(
      "/api/ai/chat/stream",
      {
        method: "POST",
        body: JSON.stringify({
          message: payload.message.trim(),
          ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
          ...(payload.assistantId ? { assistantId: payload.assistantId } : {})
        })
      },
      handlers
    );
  },
  aiConfirmation(id: string, action: AiConfirmationAction, version: number) {
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return request<AiConfirmationResponse>(
      `/api/ai/confirmations/${encodeURIComponent(id)}`,
      {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify({ action, version, idempotencyKey })
      }
    );
  }
};
