import type {
  AccountSummary,
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

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    if (response.status === 401) {
      onUnauthorized?.();
    }

    throw new ApiError(response.status, body);
  }

  return body as T;
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
        password: payload.password
      })
    });
  },
  logout() {
    return request<{ message: string }>("/api/auth/logout", {
      method: "POST"
    });
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
  }
};
