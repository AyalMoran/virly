import { userRoleValues } from "../User.js";

describe("userRoleValues", () => {
  it("contains all expected role strings", () => {
    expect(userRoleValues).toContain("user");
    expect(userRoleValues).toContain("support_agent");
    expect(userRoleValues).toContain("sales_agent");
    expect(userRoleValues).toContain("support_manager");
    expect(userRoleValues).toContain("admin");
  });

  it("contains exactly five roles", () => {
    expect(userRoleValues).toHaveLength(5);
  });

  it("every entry is a non-empty string", () => {
    for (const role of userRoleValues) {
      expect(typeof role).toBe("string");
      expect(role.length).toBeGreaterThan(0);
    }
  });

  it("does not contain unknown roles", () => {
    const knownSet = new Set(userRoleValues as readonly string[]);
    expect(knownSet.has("superuser")).toBe(false);
    expect(knownSet.has("guest")).toBe(false);
    expect(knownSet.has("")).toBe(false);
  });

  it("role names are unique (no duplicates)", () => {
    const unique = new Set(userRoleValues);
    expect(unique.size).toBe(userRoleValues.length);
  });

  it("privileged roles appear after the base user role", () => {
    const idx = (r: string) => (userRoleValues as readonly string[]).indexOf(r);
    expect(idx("user")).toBeLessThan(idx("admin"));
    expect(idx("user")).toBeLessThan(idx("support_manager"));
  });
});
