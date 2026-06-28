import assert from "node:assert/strict";
import test from "node:test";
import { userIdFromCookieHeader } from "./handshakeAuth.js";
import { userRoom } from "./rooms.js";
import { signAuthCookieValue, AUTH_COOKIE_NAME } from "./handshakeAuth.js"; // re-export the real signer/name for the test

test("extracts the userId from a valid auth cookie", () => {
  const cookie = `${AUTH_COOKIE_NAME}=${signAuthCookieValue("u1")}`;
  assert.equal(userIdFromCookieHeader(cookie), "u1");
});

test("returns null when the cookie is missing or invalid", () => {
  assert.equal(userIdFromCookieHeader(undefined), null);
  assert.equal(userIdFromCookieHeader(`${AUTH_COOKIE_NAME}=garbage`), null);
  assert.equal(userIdFromCookieHeader("other=1"), null);
});

test("room name is namespaced per user", () => {
  assert.equal(userRoom("u1"), "user:u1");
});
