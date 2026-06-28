import type { RealtimeGateway } from "./types.js";

export const noopRealtime: RealtimeGateway = {
  emitToUser() {
    /* no-op: default until a socket server registers a live gateway */
  }
};

let active: RealtimeGateway = noopRealtime;

export function setRealtime(gateway: RealtimeGateway): void {
  active = gateway;
}

export function getRealtime(): RealtimeGateway {
  return active;
}
