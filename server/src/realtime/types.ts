export type RealtimeEvent = "transfer:received";

export type RealtimePayloads = {
  "transfer:received": { amount: number; reason: string | null };
};

export interface RealtimeGateway {
  emitToUser<E extends RealtimeEvent>(
    userId: string,
    event: E,
    payload: RealtimePayloads[E]
  ): void;
}
