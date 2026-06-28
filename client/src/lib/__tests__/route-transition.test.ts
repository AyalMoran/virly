import {
  authTransitionState,
  clearAuthTransition,
  hasAuthTransition,
  markAuthTransition
} from "../route-transition";

// Jest's node environment has no sessionStorage; provide a minimal in-memory shim.
const store = new Map<string, string>();
const original = (globalThis as { sessionStorage?: Storage }).sessionStorage;

beforeEach(() => {
  store.clear();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  };
});

afterEach(() => {
  (globalThis as { sessionStorage?: unknown }).sessionStorage = original;
});

test("authTransitionState carries the transition flag for router state", () => {
  expect(authTransitionState).toStrictEqual({ transitionFromAuth: true });
});

describe("hasAuthTransition", () => {
  test("is true when router location state carries the flag", () => {
    expect(hasAuthTransition({ transitionFromAuth: true })).toBe(true);
  });

  test("is true when the session storage flag was marked", () => {
    markAuthTransition();
    expect(hasAuthTransition(null)).toBe(true);
  });

  test("is false with no flag set", () => {
    expect(hasAuthTransition(null)).toBe(false);
    expect(hasAuthTransition({})).toBe(false);
  });

  test("clearAuthTransition removes the stored flag", () => {
    markAuthTransition();
    clearAuthTransition();
    expect(hasAuthTransition(null)).toBe(false);
  });
});
