# Policy-RAG Eval Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Todoist task:** `6h24jj9pcF5FRVw3` - "Author policy-rag.examples.jsonl for RAG recall eval" (section `ai`).

**Goal:** Author `server/src/ai/evals/policy-rag.examples.jsonl` against the real ingested knowledge base so `npm --workspace server run eval:policy-rag` can measure retrieval recall@k and exit 0 at the target threshold.

**Architecture:** This is a data-authoring task, not a code change. The eval runner (`server/scripts/eval-policy-rag.ts`) and retriever (`server/src/ai/rag/retriever.ts`) already exist and are tested; only the example set is missing, so the eval currently errors with "No eval set found". The work is: (1) provision RAG and ingest the real policy/loan documents, (2) enumerate every document's `sourceRef` from the sync log, (3) write one-or-more natural-language questions per document whose answer lives in that document, pairing each with the document's exact `sourceRef`, (4) run the eval and iterate until recall meets threshold.

**Tech Stack:** Node.js + TypeScript, `tsx` script runner, pgvector (the dedicated AI Postgres at `VIRLY_AI_PG_URL`), OpenAI `text-embedding-3-small`, npm workspaces.

## Global Constraints

- The eval file path is exactly `server/src/ai/evals/policy-rag.examples.jsonl`. Do not rename it - `eval-policy-rag.ts` resolves this exact path.
- File format is JSONL: one JSON object per line, each `{ "question": string, "expectedSourceRefs": string[] }`. Blank lines are ignored; every non-blank line must be valid JSON or the eval throws on `JSON.parse`.
- `expectedSourceRefs` values must match a citation's `sourceRef` **exactly** (string equality via `Set.has`). For the `local` source `sourceRef` is the file's path relative to the ingest root (e.g. `policies/overdraft.md`); for the `drive` source it is the Drive `fileId`. Copy these verbatim from the sync log - do not guess, retype, or normalize slashes/case.
- The example set is authored against the **real** knowledge base, which is intentionally **not committed** to this repo (see `docs/planning/specs/rag-knowledge-base-design.md` §8). The documents live in a local folder (`VIRLY_RAG_LOCAL_DIR`) or a Google Drive folder (`VIRLY_RAG_DRIVE_FOLDER_ID`). The concrete `question`/`sourceRef` values in this plan are illustrative templates; replace them with values enumerated in Task 1.
- Running the eval requires `VIRLY_RAG_ENABLED=true`, a reachable `VIRLY_AI_PG_URL`, and `OPENAI_API_KEY` (the eval embeds each question live). The `--dry-run` sync does **not** need `OPENAI_API_KEY`; a real sync and the eval do.
- All commands run from the repo root using `npm --workspace server run ...` (npm sets the working directory to `server/`, so `server/.env` loads).
- Do not lower the default threshold to make the eval pass. If a question cannot reach top-k, fix the question, not the bar. Only pass an explicit `--threshold=` for a deliberately-documented interim target, and record why.

---

### Task 1: Provision RAG and capture the document inventory

Ingest the real knowledge base into pgvector and record every document's exact `sourceRef`. The dry-run sync log is the source of truth for the refs Task 2 will pair with questions.

**Files:**
- Modify: `server/.env` (local, git-ignored - RAG env vars; do not commit)
- Create (scratch, not committed): `server/src/ai/evals/.rag-inventory.txt` - a working note listing each `sourceRef`, `title`, and chunk count

**Interfaces:**
- Consumes: the real policy/loan documents (local folder or Drive folder) supplied by the operator.
- Produces: a provisioned + migrated pgvector store containing the ingested chunks, and a captured inventory of every `sourceRef` string (exact) with its human-readable `title`. Task 2 consumes this inventory.

- [ ] **Step 1: Set the RAG environment variables**

Edit `server/.env` (create from `server/.env.example` if absent). Set:

```env
VIRLY_RAG_ENABLED=true
VIRLY_AI_PG_URL=postgres://virly:virly@localhost:5433/virly
OPENAI_API_KEY=sk-...                     # a real key - the eval embeds queries live
# Pick ONE source:
VIRLY_RAG_LOCAL_DIR=/absolute/path/to/knowledge-base      # local source, or:
# VIRLY_RAG_DRIVE_FOLDER_ID=<drive-folder-id>             # drive source (needs VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON)
```

If you have no pgvector running, start the test one and point `VIRLY_AI_PG_URL` at it:

```bash
docker compose -f docker-compose.test.yml up -d
```

- [ ] **Step 2: Apply the AI-store migrations**

Run: `npm --workspace server run rag:migrate`
Expected: exits 0. Creates the `knowledge_documents` / `knowledge_chunks` tables (idempotent - safe to re-run).

- [ ] **Step 3: Dry-run the sync to enumerate documents (no OpenAI needed)**

For a local knowledge base:

Run: `npm --workspace server run rag:sync -- --source=local --dir="$VIRLY_RAG_LOCAL_DIR" --dry-run`

For a Drive knowledge base:

Run: `npm --workspace server run rag:sync -- --source=drive --dry-run`

Expected: a banner line, then one line per document, e.g.:

```
  + create policies/overdraft.md → 4 chunks (dry-run)
  + create policies/fees.md → 7 chunks (dry-run)
  + create loans/personal-loan.md → 12 chunks (dry-run)
```

The token immediately after `create`/`update`/`skip` is the exact `sourceRef`.

- [ ] **Step 4: Record the inventory**

Copy every `sourceRef` (verbatim) into `server/src/ai/evals/.rag-inventory.txt`, one per line, annotated with the title/topic so Task 2 can write on-topic questions. Example:

```
policies/overdraft.md        # Overdraft policy: buffer, fees, grace period
policies/fees.md             # Fee schedule: wire, FX, monthly account fees
loans/personal-loan.md       # Personal loan: eligibility, APR range, term limits
```

- [ ] **Step 5: Run the real sync to embed + store the documents**

Run: `npm --workspace server run rag:sync -- --source=local --dir="$VIRLY_RAG_LOCAL_DIR"`
(or `--source=drive` for Drive)
Expected: lines like `+ create policies/overdraft.md → 4 chunks` and a final summary with `created`/`chunks` > 0. This is the store the eval will query.

- [ ] **Step 6: Commit (inventory is scratch - do not commit it)**

The inventory file is a working note. Add it to your local ignore so it is never committed:

```bash
echo "server/src/ai/evals/.rag-inventory.txt" >> .git/info/exclude
git status   # confirm nothing to commit from this task
```

Expected: `git status` shows no tracked changes from Task 1 (env + inventory are both local-only).

---

### Task 2: Author the example set with one question per document

Write the JSONL so every ingested document is exercised by at least one question, then confirm the file parses and the eval runs end-to-end (recall value may be < 1 at this point - Task 3 closes the gap).

**Files:**
- Create: `server/src/ai/evals/policy-rag.examples.jsonl`

**Interfaces:**
- Consumes: the `sourceRef` inventory from Task 1 (`.rag-inventory.txt`).
- Produces: a parseable `policy-rag.examples.jsonl` covering every document. Task 3 consumes it and drives recall to threshold.

- [ ] **Step 1: Write the example file**

For each `sourceRef` in the inventory, add one line: a question a real user would ask whose answer is in that document, paired with that document's exact `sourceRef`. Replace the illustrative values below with your enumerated refs and on-topic questions:

```jsonl
{"question": "How large is the overdraft buffer before fees kick in?", "expectedSourceRefs": ["policies/overdraft.md"]}
{"question": "What does Virly charge for an international wire transfer?", "expectedSourceRefs": ["policies/fees.md"]}
{"question": "What is the APR range on a Virly personal loan?", "expectedSourceRefs": ["loans/personal-loan.md"]}
```

Rules for good examples:
- One primary document per question. If the answer genuinely spans two documents, list both refs in `expectedSourceRefs` (a hit needs only one to appear in top-k).
- Phrase questions the way a customer would ask, not by quoting the document's headings verbatim (that inflates recall unrealistically).
- Cover every `sourceRef` from Task 1 at least once, so a future document that stops being retrievable is caught.

- [ ] **Step 2: Verify the file parses as JSONL**

Run:

```bash
node -e "const fs=require('fs');const n=fs.readFileSync('server/src/ai/evals/policy-rag.examples.jsonl','utf8').split('\n').map(l=>l.trim()).filter(Boolean);n.forEach((l,i)=>{const o=JSON.parse(l);if(typeof o.question!=='string'||!Array.isArray(o.expectedSourceRefs)||o.expectedSourceRefs.length===0)throw new Error('bad line '+(i+1));});console.log('OK '+n.length+' examples');"
```

Expected: `OK <N> examples` where N == the number of documents you covered. A `SyntaxError` or `bad line K` means fix line K.

- [ ] **Step 3: Run the eval end-to-end**

Run: `VIRLY_RAG_ENABLED=true npm --workspace server run eval:policy-rag`
Expected: the runner prints a `✓`/`✗` line per question and a final `recall@5 = H/N = 0.xxx`. It may FAIL the threshold here - that is expected; Task 3 fixes the misses. If it errors with "Knowledge base unavailable", re-run Task 1 Step 5 (the store is empty).

- [ ] **Step 4: Commit the initial example set**

```bash
git add server/src/ai/evals/policy-rag.examples.jsonl
git commit -m "test(ai): add policy-rag eval example set covering all knowledge docs"
```

---

### Task 3: Drive recall@k to threshold

Fix every missing question until the eval exits 0 at the target threshold.

**Files:**
- Modify: `server/src/ai/evals/policy-rag.examples.jsonl`

**Interfaces:**
- Consumes: the example set from Task 2 and the eval's per-question `✗` diagnostics.
- Produces: an example set where `eval:policy-rag` exits 0 at threshold 1.0 (or a documented interim threshold). Task 4 documents it.

- [ ] **Step 1: Re-run the eval and read the misses**

Run: `VIRLY_RAG_ENABLED=true npm --workspace server run eval:policy-rag`
For every `✗` line the runner prints `expected one of: <ref>` and `got: <refs>`. Note which questions missed and what was retrieved instead.

- [ ] **Step 2: Fix each miss (question first, ref second)**

For each `✗`, in priority order:
1. If the retrieved `got:` set contains a *different but also-correct* document, the question was ambiguous - sharpen it toward the intended document, or add the retrieved ref to `expectedSourceRefs` if it is genuinely a correct source.
2. If `got:` is unrelated, the question uses vocabulary absent from the document - rephrase using terms the document actually contains (you captured the topic in Task 1's inventory).
3. If `got:` is `(none)`, the store is empty or RAG is disabled - re-check Task 1 Steps 1 and 5.
Do **not** widen `expectedSourceRefs` to whatever was retrieved just to force a pass - that measures nothing.

- [ ] **Step 3: Optionally probe recall at a larger k while iterating**

Run: `VIRLY_RAG_ENABLED=true npm --workspace server run eval:policy-rag -- --k=10`
A question that hits at k=10 but misses at k=5 is a ranking-quality signal (note it for a future re-ranking task), not a reason to relax the default k in the committed run.

- [ ] **Step 4: Confirm the eval passes at threshold**

Run: `VIRLY_RAG_ENABLED=true npm --workspace server run eval:policy-rag`
Expected: final line `recall@5 = N/N = 1.000` and the process exits 0 (no `FAIL:` line). If a single question is legitimately un-retrievable at k=5 and you are documenting an interim bar, run with `--threshold=0.9` and record the reason in Task 4.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/evals/policy-rag.examples.jsonl
git commit -m "test(ai): tune policy-rag eval questions to reach recall target"
```

---

### Task 4: Document the eval so it stays runnable and extendable

Leave a short, discoverable note so the next person knows the dataset exists, how to run it, and how to extend it when documents change.

**Files:**
- Create: `server/src/ai/evals/README.md` (if absent) or Modify it (if present) - add a "Policy-RAG recall eval" section
- Modify: `docs/planning/specs/rag-knowledge-base-design.md` - flip the §4 "Evals" note from "authored" aspiration to "authored + runnable", if that section still reads as pending

**Interfaces:**
- Consumes: the passing example set from Task 3.
- Produces: documentation. No downstream task depends on it.

- [ ] **Step 1: Write the eval README section**

Add to `server/src/ai/evals/README.md`:

```markdown
## Policy-RAG recall eval

`policy-rag.examples.jsonl` measures retrieval recall@k for the policy/loan
knowledge base. Each line is `{ "question", "expectedSourceRefs" }`, authored
against the real ingested documents (the docs are not committed; `sourceRef` is
the local relative path or the Drive fileId, copied verbatim from the sync log).

Run (from repo root, after `rag:sync`):

    VIRLY_RAG_ENABLED=true npm --workspace server run eval:policy-rag

Flags: `--k=<n>` (default 5), `--threshold=<0..1>` (default 1.0; exits non-zero
below it). When you add or rename a knowledge document, add/adjust a matching
example line so coverage stays 1-per-document.
```

- [ ] **Step 2: Verify the doc links resolve and the command block is accurate**

Run: `VIRLY_RAG_ENABLED=true npm --workspace server run eval:policy-rag`
Expected: matches the README's described output (a recall line, exit 0). Fix the README if the real output differs.

- [ ] **Step 3: Commit**

```bash
git add server/src/ai/evals/README.md docs/planning/specs/rag-knowledge-base-design.md
git commit -m "docs(ai): document the policy-rag recall eval and how to extend it"
```

---

## Self-Review

- **Spec coverage:** The Todoist task asks for `policy-rag.examples.jsonl` authored against the real docs so `eval:policy-rag` can measure recall@k. Task 1 provisions + enumerates, Task 2 authors + validates format, Task 3 reaches the recall bar, Task 4 documents. Covered.
- **Placeholders:** The `question`/`sourceRef` literals are explicitly labeled illustrative templates because the real values come from a private, uncommitted knowledge base; the enumeration procedure (Task 1 Step 3-4) is concrete and the substitution point (Task 2 Step 1) is explicit. This is a genuine external-data dependency, not a lazy TODO.
- **Consistency:** File path `server/src/ai/evals/policy-rag.examples.jsonl`, the `{ "question", "expectedSourceRefs" }` shape, and the `sourceRef` exact-match rule are used identically across all four tasks and match `eval-policy-rag.ts` and `retriever.ts`.
