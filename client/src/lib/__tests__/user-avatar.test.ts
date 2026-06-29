import {
  createInitialAvatar,
  getDisplayName,
  getInitial,
  getUserAvatarUrl
} from "../user-avatar";

describe("getDisplayName", () => {
  test("falls back to a generic name without an email", () => {
    expect(getDisplayName()).toBe("Virly user");
    expect(getDisplayName("")).toBe("Virly user");
  });

  test("title-cases the local part segments", () => {
    expect(getDisplayName("alice.smith@example.com")).toBe("Alice Smith");
    expect(getDisplayName("bob_jones-doe@x.io")).toBe("Bob Jones Doe");
  });
});

describe("getInitial", () => {
  test("returns the upper-cased first character", () => {
    expect(getInitial("alice")).toBe("A");
    expect(getInitial("  bob")).toBe("B");
  });

  test("defaults to V for empty input", () => {
    expect(getInitial("")).toBe("V");
    expect(getInitial("   ")).toBe("V");
  });
});

describe("createInitialAvatar", () => {
  test("returns an inline svg data URI containing the initial", () => {
    const uri = createInitialAvatar("Alice");
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(uri)).toContain(">A<");
  });
});

describe("getUserAvatarUrl", () => {
  test("falls back to the generated avatar when no env override is set", () => {
    // import.meta.env is undefined under Jest, so the generated avatar is used.
    expect(getUserAvatarUrl("Alice")).toBe(createInitialAvatar("Alice"));
  });
});
