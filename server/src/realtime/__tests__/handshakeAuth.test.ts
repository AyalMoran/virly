import { userIdFromCookieHeader, signAuthCookieValue, AUTH_COOKIE_NAME } from "../handshakeAuth.js";
import { userRoom } from "../rooms.js";

test("extracts the userId from a valid auth cookie", () => {
  const cookie = `${AUTH_COOKIE_NAME}=${signAuthCookieValue("u1")}`;
  expect(userIdFromCookieHeader(cookie)).toBe("u1");
});

test("returns null when the cookie is missing or invalid", () => {
  expect(userIdFromCookieHeader(undefined)).toBeNull();
  expect(userIdFromCookieHeader(`${AUTH_COOKIE_NAME}=garbage`)).toBeNull();
  expect(userIdFromCookieHeader("other=1")).toBeNull();
  expect(userIdFromCookieHeader("virly_auth=%GG")).toBeNull();
});

test("room name is namespaced per user", () => {
  expect(userRoom("u1")).toBe("user:u1");
});
