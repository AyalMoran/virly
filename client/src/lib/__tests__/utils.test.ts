import { cn } from "../utils";

describe("cn", () => {
  test("joins truthy class values", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  test("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  test("merges conflicting tailwind utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  test("supports conditional object syntax", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });

  test("returns an empty string with no inputs", () => {
    expect(cn()).toBe("");
  });
});
