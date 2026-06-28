import { userRoom } from "../rooms.js";

describe("userRoom", () => {
  test("formats a standard userId into a namespaced room string", () => {
    expect(userRoom("abc123")).toBe("user:abc123");
  });

  test("formats another userId correctly", () => {
    expect(userRoom("000000000000000000000001")).toBe("user:000000000000000000000001");
  });

  test("includes special characters in the userId verbatim", () => {
    expect(userRoom("user-id_with.dots")).toBe("user:user-id_with.dots");
  });

  test("handles an empty string userId", () => {
    expect(userRoom("")).toBe("user:");
  });

  test("always prefixes with 'user:' regardless of content", () => {
    const id = "some:colons:inside";
    expect(userRoom(id)).toMatch(/^user:/);
    expect(userRoom(id)).toBe("user:some:colons:inside");
  });

  test("two different userIds produce different room strings", () => {
    expect(userRoom("u1")).not.toBe(userRoom("u2"));
  });
});
