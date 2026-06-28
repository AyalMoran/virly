
// src/repositories/mongo/__tests__/stub.test.ts
import { stubRepository } from "../stub.js";

interface FakeRepo {
  findById(id: string): Promise<unknown>;
  create(input: object): Promise<unknown>;
  delete(id: string): Promise<void>;
}

describe("stubRepository", () => {
  describe("happy path — proxy exposes callable async methods", () => {
    it("returns an object whose methods are functions", () => {
      const repo = stubRepository<FakeRepo>("FakeRepo");
      expect(typeof repo.findById).toBe("function");
      expect(typeof repo.create).toBe("function");
      expect(typeof repo.delete).toBe("function");
    });

    it("each method is async and rejects with a not-implemented error", async () => {
      const repo = stubRepository<FakeRepo>("FakeRepo");
      await expect(repo.findById("abc")).rejects.toThrow(
        "FakeRepo.findById not implemented yet"
      );
    });
  });

  describe("error message includes the repo name and method name", () => {
    it("includes the repo name in the thrown message", async () => {
      const repo = stubRepository<FakeRepo>("UsersRepo");
      await expect(repo.create({})).rejects.toThrow("UsersRepo");
    });

    it("includes the method name in the thrown message for a second method", async () => {
      const repo = stubRepository<FakeRepo>("TransactionRepo");
      const err = await repo.delete("x").then(
        () => null,
        (e: Error) => e
      );
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain("TransactionRepo.delete");
    });
  });

  describe("edge cases", () => {
    it("symbol keys return undefined (not a function)", () => {
      const repo = stubRepository<FakeRepo>("SymbolRepo");
      const symVal = (repo as unknown as Record<symbol, unknown>)[Symbol.iterator];
      expect(symVal).toBeUndefined();
    });

    it("different property accesses always return a fresh async function that rejects", async () => {
      const repo = stubRepository<{ alpha(): Promise<void>; beta(): Promise<void> }>("Two");
      await expect(repo.alpha()).rejects.toThrow("Two.alpha");
      await expect(repo.beta()).rejects.toThrow("Two.beta");
    });

    it("works with an empty-string repo name", async () => {
      const repo = stubRepository<{ go(): Promise<void> }>("");
      await expect(repo.go()).rejects.toThrow(".go");
    });

    it("the error message contains the Stage-B hint text", async () => {
      const repo = stubRepository<FakeRepo>("MyRepo");
      const err = await repo.findById("id").catch((e: Error) => e);
      expect((err as Error).message).toMatch(/stub.*Stage B/i);
    });
  });
});
