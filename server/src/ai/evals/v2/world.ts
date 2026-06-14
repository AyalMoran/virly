

/**
 * Ground-truth "world" for the V2 live conformance suite (data + pure helpers).
 *
 * Every number is ground truth: scenarios assert the assistant surfaces THESE
 * figures, resolves references to THESE counterparties, and derives contextual
 * amounts from THESE bases. Multi-counterparty with DISTINCT amounts so a
 * reference/coreference/amount mistake is unambiguous (e.g. "the same I sent Dan"
 * must become 150, not Maya's 320). The executors live in `worldTools.ts`.
 */

export type WorldCounterparty = {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  /** total ILS the user has SENT to this counterparty */
  totalSent: number;
  /** total ILS the user has RECEIVED from this counterparty */
  totalReceived: number;
  /** ILS of the single most recent transfer the user SENT to them */
  lastSentAmount: number;
  txCount: number;
};

export const WORLD = {
  userId: "507f1f77bcf86cd799439011",
  account: { label: "Virly checking", balance: 1840.5 },
  limits: { perTransfer: 500, dailyLimit: 1000, dailyUsed: 120, dailyRemaining: 880 },
  counterparties: {
    maya: {
      key: "maya", email: "maya@example.com", firstName: "Maya", lastName: "Cohen",
      totalSent: 320, totalReceived: 80, lastSentAmount: 120, txCount: 6
    },
    dan: {
      key: "dan", email: "dan@example.com", firstName: "Dan", lastName: "Levi",
      totalSent: 150, totalReceived: 200, lastSentAmount: 60, txCount: 5
    },
    noa: {
      key: "noa", email: "noa@example.com", firstName: "Noa", lastName: "Bar",
      totalSent: 75, totalReceived: 0, lastSentAmount: 25, txCount: 3
    }
  } satisfies Record<string, WorldCounterparty>
};

export type WorldCounterpartyKey = keyof typeof WORLD.counterparties;

/** Newest-first ledger; ordinal references ("the second one") map here. */
export const WORLD_RECENT_TX = [
  { id: "tx-1", direction: "sent" as const, amount: 120, cp: "maya" as const, occurredAt: "2026-06-10T09:00:00.000Z" },
  { id: "tx-2", direction: "received" as const, amount: 90, cp: "dan" as const, occurredAt: "2026-06-08T09:00:00.000Z" },
  { id: "tx-3", direction: "sent" as const, amount: 60, cp: "dan" as const, occurredAt: "2026-06-05T09:00:00.000Z" },
  { id: "tx-4", direction: "sent" as const, amount: 25, cp: "noa" as const, occurredAt: "2026-06-02T09:00:00.000Z" },
  { id: "tx-5", direction: "received" as const, amount: 40, cp: "maya" as const, occurredAt: "2026-05-30T09:00:00.000Z" }
];

export function cpOf(key: WorldCounterpartyKey): WorldCounterparty {
  return WORLD.counterparties[key];
}

export function maskWorldEmail(email: string): string {
  return `${email.slice(0, 1)}***@example.com`;
}

export function fullName(cp: WorldCounterparty): string {
  return `${cp.firstName} ${cp.lastName}`;
}

export function worldCounterpartyEmails(): string[] {
  return Object.values(WORLD.counterparties).map((cp) => cp.email);
}

export function findCounterpartyByEmail(email?: string): WorldCounterparty | undefined {
  if (!email) return undefined;
  const lower = email.toLowerCase();
  return Object.values(WORLD.counterparties).find((cp) => cp.email === lower);
}

export function findCounterpartyByQuery(text: string): WorldCounterparty | undefined {
  const lower = text.toLowerCase();
  return Object.values(WORLD.counterparties).find(
    (cp) =>
      lower.includes(cp.email) ||
      lower.includes(cp.firstName.toLowerCase()) ||
      lower.includes(cp.key)
  );
}

export function ordinalFromMessage(message: string): number | null {
  const n = message.toLowerCase();
  if (/\b(first|1st)\b/.test(n) || /(הראשונה|הראשון)/.test(message)) return 1;
  if (/\b(second|2nd)\b/.test(n) || /(השנייה|השני)/.test(message)) return 2;
  if (/\b(third|3rd)\b/.test(n) || /(השלישית|השלישי)/.test(message)) return 3;
  if (/\b(fourth|4th)\b/.test(n) || /(הרביעית|הרביעי)/.test(message)) return 4;
  if (/\b(fifth|5th)\b/.test(n) || /(החמישית|החמישי)/.test(message)) return 5;
  return null;
}

/** Memory total the assistant can later value contextual amounts from. */
export function totalsMemoryUpdate(
  cp: WorldCounterparty,
  direction: "sent" | "received" | "net",
  amount: number
) {
  const sourceToolName =
    direction === "sent"
      ? ("getTotalSentToCounterparty" as const)
      : direction === "received"
        ? ("getTotalReceivedFromCounterparty" as const)
        : ("getNetWithCounterparty" as const);
  return {
    totals: [
      {
        id: `${direction}:${cp.email}`,
        counterpartyEmail: cp.email,
        direction,
        amount,
        currency: "ILS" as const,
        sourceToolName,
        aliases: ["that amount", "that total", `total ${direction}`]
      }
    ],
    counterparties: [
      {
        counterpartyId: cp.email,
        emailFullForBackendOnly: cp.email,
        emailMasked: maskWorldEmail(cp.email),
        displayName: fullName(cp),
        firstName: cp.firstName,
        lastName: cp.lastName,
        relation:
          direction === "received" ? ("received_from" as const) : ("sent_to" as const),
        source: "transaction" as const
      }
    ]
  };
}
