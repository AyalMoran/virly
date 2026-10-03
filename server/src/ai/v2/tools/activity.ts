/**
 * `getRecentActivity` — read-only v2 tool over the geo/activity capture stream
 * (spec 2026-07-09). Lets the assistant answer "any logins from unusual
 * places?" / "where was I when I sent that transfer?" from the user's own
 * recorded logins/transfers, scoped strictly to the authenticated user from
 * config (never from model args or message text).
 *
 * Repo-based (not executor-based), same as `fraudTools`: the deterministic
 * eval world doesn't model activity events, so this tool has no eval
 * scenarios by design; coverage lives in the direct tool tests + the
 * aiSafety suite.
 */
import { tool } from "@langchain/core/tools";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";

import { getRepositories } from "../../../repositories/index.js";
import { getConfigurable } from "../toolContext.js";
import { statusWriter } from "../streamEvents.js";
import * as D from "./descriptions.js";

export const getRecentActivityTool = tool(
  async (args, config: LangGraphRunnableConfig) => {
    const cfg = getConfigurable(config);
    statusWriter(config)?.({ kind: "status", label: "Checking your recent activity" });
    try {
      const events = await getRepositories().activityEvents.listRecentByUser(cfg.userId, {
        limit: Math.min(Math.max(args.limit ?? 20, 1), 50)
      });
      if (events.length === 0) return "No recorded account activity yet.";
      return events
        .map((e) => {
          const where = e.geo ? [e.geo.city, e.geo.country].filter(Boolean).join(", ") : "unknown location";
          const tx = e.transactionId ? ` (transaction ${e.transactionId})` : "";
          return `${e.at.toISOString()} ${e.kind} from ${where}${tx}`;
        })
        .join("\n");
    } catch (error) {
      return `That lookup is unavailable right now: ${error instanceof Error ? error.message : "unknown error"}.`;
    }
  },
  {
    name: "getRecentActivity",
    description: D.GET_RECENT_ACTIVITY_DESC,
    schema: z.object({
      limit: z.number().int().min(1).max(50).optional().describe("How many events (default 20).")
    })
  }
);

export const activityTools = [getRecentActivityTool];
