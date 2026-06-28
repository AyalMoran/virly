import { parseCookies } from "../cookies.js";
import { makeNext, makeReq, makeRes } from "./_httpStubs.js";

function parse(cookieHeader?: string) {
  const req = makeReq({ headers: cookieHeader ? { cookie: cookieHeader } : {} });
  const { res } = makeRes();
  const { next, calls } = makeNext();
  parseCookies(req, res, next);
  return { cookies: req.cookies, nextCalls: calls.length };
}

test("parses multiple cookies into a name->value map", () => {
  const { cookies, nextCalls } = parse("a=1; b=two");
  expect(cookies).toStrictEqual({ a: "1", b: "two" });
  expect(nextCalls).toBe(1);
});

test("url-decodes cookie values", () => {
  expect(parse("token=a%20b%2Bc").cookies.token).toBe("a b+c");
});

test("preserves '=' inside a value", () => {
  expect(parse("jwt=ab.cd=ef").cookies.jwt).toBe("ab.cd=ef");
});

test("returns an empty map when no cookie header is present", () => {
  expect(parse().cookies).toStrictEqual({});
});

test("skips entries with an empty name", () => {
  expect(parse("=orphan; valid=1").cookies).toStrictEqual({ valid: "1" });
});
