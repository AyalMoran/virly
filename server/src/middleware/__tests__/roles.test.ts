import {
  getAllowedVideoSessionTypes,
  isSalesVideoRole,
  isSupportVideoRole,
  requireAnyVideoAgentRole
} from "../roles.js";
import { setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { Repositories, UserRole } from "../../repositories/types.js";
import { makeNext, makeReq, makeRes } from "./_httpStubs.js";

describe("role predicates", () => {
  test("support roles include support agents, managers, and admin", () => {
    expect(isSupportVideoRole("support_agent")).toBe(true);
    expect(isSupportVideoRole("support_manager")).toBe(true);
    expect(isSupportVideoRole("admin")).toBe(true);
    expect(isSupportVideoRole("user")).toBe(false);
    expect(isSupportVideoRole("sales_agent")).toBe(false);
  });

  test("sales roles include sales agents and admin", () => {
    expect(isSalesVideoRole("sales_agent")).toBe(true);
    expect(isSalesVideoRole("admin")).toBe(true);
    expect(isSalesVideoRole("support_agent")).toBe(false);
  });

  test("getAllowedVideoSessionTypes summarises both capabilities", () => {
    expect(getAllowedVideoSessionTypes("admin")).toStrictEqual({
      support: true,
      sales: true
    });
    expect(getAllowedVideoSessionTypes("support_agent")).toStrictEqual({
      support: true,
      sales: false
    });
    expect(getAllowedVideoSessionTypes("user")).toStrictEqual({
      support: false,
      sales: false
    });
  });
});

describe("requireAnyVideoAgentRole", () => {
  function withUserRole(role: UserRole | null) {
    const base = createMongoRepositories();
    setRepositories({
      ...base,
      users: {
        ...base.users,
        findByIdSafe: async () => (role ? ({ id: "u1", role } as never) : null)
      } as Repositories["users"]
    });
  }

  test("401s when there is no authenticated userId", async () => {
    const { res, captured } = makeRes();
    const { next, calls } = makeNext();
    await requireAnyVideoAgentRole(makeReq(), res, next);
    expect(captured.status).toBe(401);
    expect(calls.length).toBe(0);
  });

  test("403s when the user lacks an agent role", async () => {
    withUserRole("user");
    const { res, captured } = makeRes();
    const { next, calls } = makeNext();
    await requireAnyVideoAgentRole(makeReq({ userId: "u1" } as never), res, next);
    expect(captured.status).toBe(403);
    expect(calls.length).toBe(0);
  });

  test("calls next and records the role for an agent", async () => {
    withUserRole("support_agent");
    const { res, captured } = makeRes();
    const { next, calls } = makeNext();
    const req = makeReq({ userId: "u1" } as never);
    await requireAnyVideoAgentRole(req, res, next);
    expect(captured.status).toBeNull();
    expect(calls.length).toBe(1);
    expect((req as { userRole?: string }).userRole).toBe("support_agent");
  });

  test("forwards a repository error to next", async () => {
    const base = createMongoRepositories();
    setRepositories({
      ...base,
      users: {
        ...base.users,
        findByIdSafe: async () => {
          throw new Error("db down");
        }
      } as Repositories["users"]
    });
    const { res } = makeRes();
    const { next, calls } = makeNext();
    await requireAnyVideoAgentRole(makeReq({ userId: "u1" } as never), res, next);
    expect(calls.length).toBe(1);
    expect((calls[0][0] as Error).message).toBe("db down");
  });
});
