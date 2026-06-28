// Shared Express req/res/next stubs for middleware tests. Not a *.test.ts file,
// so Jest never runs it as a suite; the middleware tests import from it.
import type { Request, Response } from "express";

export function makeRes() {
  const captured: { status: number | null; body: unknown } = {
    status: null,
    body: undefined
  };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    }
  };
  return { res: res as unknown as Response, captured };
}

export function makeNext() {
  const calls: unknown[][] = [];
  const next = ((...args: unknown[]) => {
    calls.push(args);
  }) as never;
  return { next, calls };
}

export function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    headers: {},
    cookies: {},
    ...overrides
  } as Request;
}
