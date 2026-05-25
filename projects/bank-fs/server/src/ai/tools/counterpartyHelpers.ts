import { PersonalDetails } from "../../models/PersonalDetails.js";
import { User } from "../../models/User.js";
import {
  buildCounterpartyUserLabel,
  maskEmail
} from "../counterpartyMemory.js";

export type CounterpartyDisplay = {
  counterpartyId: string;
  email: string;
  emailFull: string;
  emailMasked: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  userLabel: string;
  llmLabel: string;
  label: string;
};

export function normalizeCounterpartyEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getCounterpartyId(email: string) {
  return normalizeCounterpartyEmail(email);
}

export function getCounterpartyLabel(counterparty: CounterpartyDisplay) {
  return counterparty.userLabel;
}

export async function getCounterpartyDisplays(
  emails: string[]
): Promise<Map<string, CounterpartyDisplay>> {
  const uniqueEmails = [...new Set(emails.map(normalizeCounterpartyEmail))];
  const users = await User.find({ email: { $in: uniqueEmails } })
    .select("email")
    .lean<Array<{ _id: unknown; email: string }>>();
  const userIdByEmail = new Map(
    users.map((user) => [normalizeCounterpartyEmail(user.email), String(user._id)])
  );
  const details = await PersonalDetails.find({
    userId: { $in: users.map((user) => user._id) },
    status: "provided"
  })
    .select("userId firstName lastName")
    .lean<
      Array<{
        userId: unknown;
        firstName?: string | null;
        lastName?: string | null;
      }>
    >();
  const detailsByUserId = new Map(details.map((detail) => [String(detail.userId), detail]));
  const displays = new Map<string, CounterpartyDisplay>();

  for (const email of uniqueEmails) {
    const masked = maskEmail(email);
    const userId = userIdByEmail.get(email);
    const detail = userId ? detailsByUserId.get(userId) : undefined;
    const name = [detail?.firstName, detail?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const displayName = name || masked;
    const userLabel = buildCounterpartyUserLabel({
      email,
      displayName: name || null,
      maskedLabel: masked
    });
    const llmLabel = name ? `${name} (${masked})` : masked;
    displays.set(email, {
      counterpartyId: getCounterpartyId(email),
      email,
      emailFull: email,
      emailMasked: masked,
      displayName,
      firstName: detail?.firstName ?? null,
      lastName: detail?.lastName ?? null,
      userLabel,
      llmLabel,
      label: userLabel
    });
  }

  return displays;
}

export function getDisplayOrFallback(
  displays: Map<string, CounterpartyDisplay>,
  email: string
) {
  const normalizedEmail = normalizeCounterpartyEmail(email);
  const existing = displays.get(normalizedEmail);
  if (existing) {
    return existing;
  }

  const masked = maskEmail(normalizedEmail);
  return {
    counterpartyId: getCounterpartyId(normalizedEmail),
    email: normalizedEmail,
    emailFull: normalizedEmail,
    emailMasked: masked,
    displayName: masked,
    firstName: null,
    lastName: null,
    userLabel: normalizedEmail,
    llmLabel: masked,
    label: normalizedEmail
  };
}

export function getLimitFromMessage(message: string, defaultLimit: number, maxLimit: number) {
  const limit = Number(
    message.match(/\b(?:last|recent|latest|top)?\s*(\d{1,2})\b/i)?.[1] ??
      message.match(/(?:אחרונים|אחרונות|האחרונים|האחרונות)\s*(\d{1,2})/)?.[1]
  );

  if (!Number.isFinite(limit) || limit <= 0) {
    return defaultLimit;
  }

  return Math.min(Math.floor(limit), maxLimit);
}
