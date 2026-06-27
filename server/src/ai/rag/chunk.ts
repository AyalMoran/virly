/**
 * Heading-aware document chunker (RAG_PLAN.md §4).
 *
 * Splits markdown/plain text into overlapping chunks sized by an approximate
 * token budget. Splitting prefers section (markdown heading) and paragraph
 * boundaries so a chunk rarely cuts mid-sentence; a trailing overlap preserves
 * continuity across chunk edges for retrieval. Token counts are approximated as
 * ~4 chars/token (no tokenizer dependency) — good enough for budgeting.
 */

export type Chunk = {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  /** Nearest preceding heading, for citation context. */
  heading?: string;
};

export type ChunkOptions = {
  /** Target chunk size in approximate tokens. */
  maxTokens?: number;
  /** Approximate token overlap carried into the next chunk. */
  overlapTokens?: number;
};

const CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_OVERLAP_TOKENS = 100;

/** Approximate token count for a string (~4 chars/token). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line.trim());
}

/**
 * Split into blocks at blank lines, keeping headings attached to the text that
 * follows them. Returns blocks tagged with the heading in scope.
 */
function toBlocks(text: string): Array<{ text: string; heading?: string }> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<{ text: string; heading?: string }> = [];
  let currentHeading: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    const joined = buffer.join("\n").trim();
    if (joined) blocks.push({ text: joined, heading: currentHeading });
    buffer = [];
  };

  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      currentHeading = line.replace(/^#{1,6}\s+/, "").trim();
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return blocks;
}

/** Take the last ~overlapTokens worth of text from a chunk for continuity. */
function tailOverlap(text: string, overlapTokens: number): string {
  const chars = overlapTokens * CHARS_PER_TOKEN;
  if (text.length <= chars) return text;
  const slice = text.slice(text.length - chars);
  // Start the overlap at a word boundary so it reads cleanly.
  const spaceIdx = slice.indexOf(" ");
  return spaceIdx > 0 ? slice.slice(spaceIdx + 1) : slice;
}

/** Hard-split a single oversized block into token-bounded pieces. */
function splitLargeBlock(text: string, maxTokens: number): string[] {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const pieces: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf(" ", maxChars);
    if (cut <= 0) cut = maxChars;
    const piece = remaining.slice(0, cut).trim();
    if (piece) pieces.push(piece);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces.filter((p) => p.length > 0);
}

/**
 * Chunk a document into overlapping, heading-aware pieces. Returns at least one
 * chunk for any non-empty input; empty/whitespace input returns [].
 */
export function chunkDocument(text: string, options: ChunkOptions = {}): Chunk[] {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const blocks = toBlocks(text);
  if (blocks.length === 0) return [];

  const chunks: Chunk[] = [];
  let buf = "";
  let bufHeading: string | undefined;

  const push = (content: string, heading?: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    chunks.push({
      chunkIndex: chunks.length,
      content: trimmed,
      tokenCount: approxTokens(trimmed),
      heading
    });
  };

  for (const block of blocks) {
    // A block bigger than the budget on its own is hard-split.
    const parts =
      approxTokens(block.text) > maxTokens
        ? splitLargeBlock(block.text, maxTokens)
        : [block.text];

    for (const part of parts) {
      const candidate = buf ? `${buf}\n\n${part}` : part;
      if (approxTokens(candidate) > maxTokens && buf) {
        push(buf, bufHeading);
        const overlap = tailOverlap(buf, overlapTokens);
        buf = overlap ? `${overlap}\n\n${part}` : part;
        bufHeading = block.heading ?? bufHeading;
      } else {
        buf = candidate;
        bufHeading = bufHeading ?? block.heading;
      }
    }
  }
  push(buf, bufHeading);

  return chunks;
}
