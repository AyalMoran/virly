import crypto from "node:crypto";
import process from "node:process";

import dotenv from "dotenv";
import { Client } from "langsmith";

import {
  DEFAULT_DATASET_NAME,
  loadAssistantExamples
} from "./schema.js";

dotenv.config();
dotenv.config({ path: "server/.env" });

function argValue(name: string, fallback?: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return fallback;
}

function stableDigest(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

async function main() {
  const datasetName = argValue("--dataset", DEFAULT_DATASET_NAME) ?? DEFAULT_DATASET_NAME;
  const description = argValue(
    "--description",
    "Virly assistant service-level LangSmith examples generated from repo fixtures and current graph contracts."
  ) ?? "Virly assistant service-level LangSmith examples generated from repo fixtures and current graph contracts.";
  const dryRun = process.argv.includes("--dry-run");

  const examples = loadAssistantExamples();
  if (!process.env.LANGSMITH_API_KEY) {
    throw new Error(
      "LANGSMITH_API_KEY is not set. Put it in server/.env or export it before running sync-dataset.ts."
    );
  }

  const client = new Client();
  let dataset = await client
    .readDataset({ datasetName })
    .catch(() => undefined);

  if (!dataset) {
    if (dryRun) {
      console.log(`dry-run: would create dataset "${datasetName}"`);
      return;
    }
    dataset = await client.createDataset(datasetName, {
      description,
      metadata: {
        app: "virly",
        area: "ai-assistant",
        source: "server/src/ai/evals/langsmith"
      }
    });
  }

  const remoteByExampleId = new Map<string, { id: string; digest?: string }>();
  for await (const remote of client.listExamples({ datasetId: dataset.id })) {
    const exampleId = remote.metadata?.example_id;
    if (typeof exampleId !== "string") {
      continue;
    }
    if (remoteByExampleId.has(exampleId)) {
      console.warn(
        `warning: duplicate remote example_id ${exampleId}; keeping first and leaving duplicate untouched`
      );
      continue;
    }
    remoteByExampleId.set(exampleId, {
      id: remote.id,
      digest:
        typeof remote.metadata?.content_sha256 === "string"
          ? remote.metadata.content_sha256
          : undefined
    });
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const example of examples) {
    const contentDigest = stableDigest({
      inputs: example.inputs,
      outputs: example.outputs,
      metadata: example.metadata
    });
    const metadata = {
      ...example.metadata,
      name: example.name,
      content_sha256: contentDigest
    };
    const existing = remoteByExampleId.get(example.metadata.example_id);

    if (!existing) {
      created += 1;
      if (!dryRun) {
        await client.createExample({
          dataset_id: dataset.id,
          inputs: example.inputs,
          outputs: example.outputs,
          metadata,
          split: example.metadata.split
        });
      }
      continue;
    }

    if (existing.digest === contentDigest) {
      unchanged += 1;
      continue;
    }

    updated += 1;
    if (!dryRun) {
      await client.updateExample({
        id: existing.id,
        dataset_id: dataset.id,
        inputs: example.inputs,
        outputs: example.outputs,
        metadata,
        split: example.metadata.split
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        dataset: datasetName,
        datasetId: dataset.id,
        dryRun,
        localExamples: examples.length,
        created,
        updated,
        unchanged
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
