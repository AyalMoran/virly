export type RealtimeEvent = "transfer:received" | "security:new-login";

export type RealtimePayloads = {
  "transfer:received": { amount: number; reason: string | null };
  "security:new-login": { city: string | null; country: string | null; at: string; reasons: string[] };
};

export interface RealtimeGateway {
  emitToUser<E extends RealtimeEvent>(
    userId: string,
    event: E,
    payload: RealtimePayloads[E]
  ): void;
}
