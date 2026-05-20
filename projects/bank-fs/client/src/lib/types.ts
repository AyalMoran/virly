export type User = {
  id: string;
  email: string;
  balance: number;
  createdAt?: string;
  personalDetailsId: string;
  personalDetailsStatus: PersonalDetailsStatus;
  needsPersonalDetails: boolean;
};

export type PersonalDetailsStatus = "not_provided" | "provided";

export type PersonalDetailsAddress = {
  country: string | null;
  stateRegion?: string | null;
  city: string | null;
  street: string | null;
  addressLine2?: string | null;
  postalCode: string | null;
};

export type PersonalDetails = {
  id: string;
  status: PersonalDetailsStatus;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  address: PersonalDetailsAddress;
  lastSkippedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Transaction = {
  id: string;
  amount: number;
  counterpartyEmail: string;
  reason?: string | null;
  date?: string;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AccountSummary = {
  balance: number;
  personalDetails: {
    id: string;
    status: PersonalDetailsStatus;
    firstName: string | null;
    needsPersonalDetails: boolean;
  };
  transactions: Transaction[];
  pagination: Pagination;
};

export type TransactionsResponse = {
  transactions: Transaction[];
  pagination: Pagination;
};

export type AuthSuccessResponse = {
  user: User;
};

export type RegisterRequest = {
  email: string;
  password: string;
  phone: string;
};

export type LoginRequest = {
  email: string;
  password: string;
  rememberMe: boolean;
};

export type PersonalDetailsRequest = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  address: {
    country: string;
    stateRegion?: string | null;
    city: string;
    street: string;
    addressLine2?: string | null;
    postalCode: string;
  };
};

export type PersonalDetailsResponse = {
  personalDetails: PersonalDetails;
};

export type TransferRequest = {
  recipientEmail: string;
  amount: number;
  reason?: string;
};

export type TransferResponse = {
  message: string;
  newBalance: number;
  transaction: Transaction;
};

export type AiChatRequest = {
  message: string;
  conversationId?: string;
};

export type AiChatResponse = {
  message: string;
  conversationId: string;
  intent: string;
  toolCalls: string[];
};

export type ApiIssue = {
  path: string;
  message: string;
};

export type ApiErrorBody = {
  message?: string;
  details?: string[];
  issues?: ApiIssue[];
};
