import { useEffect, useRef, useState } from "react";

/*
 * Boot splash — a split-flap (Solari) board shown over the shader while the
 * initial session check (api.me()) is in flight. The frontend is a static
 * deploy, so this only lingers on a cold start of the Render API.
 *
 * The cells flap like a departure board and settle on a witty, money-themed
 * phrase, then re-flap to the next one — the mechanical motion reads as
 * loading, and the ledger ink + printer slot tie it to the .printing /
 * empty-state idiom. The flap loop runs in JS (Web Animations API); under
 * prefers-reduced-motion the phrases swap without flapping.
 */

const APPEAR_DELAY_MS = 250; // a warm API answers fast — don't flash for that
const MIN_VISIBLE_MS = 600; // once shown, stay long enough to read
const EXIT_MS = 450; // crossfade out

// Add new lines freely — the board auto-sizes to the longest phrase. Keep them
// to ~14 characters or fewer so the board still fits comfortably on mobile.
const PHRASES = [
  "COUNTING COINS",
  "CHASING CENTS",
  "MINTING PIXELS",
  "BALANCING ACT",
  "MAKING CHANGE",
  "STACKING PAPER",
  "ROUNDING UP",
  "FETCHING FUNDS",
  "HERDING ZEROS",
  "COUNTING BEANS",
  "WARMING VAULTS",
  "TIDYING BOOKS",
  "CASHING IN"
];
const COLS = PHRASES.reduce((max, phrase) => Math.max(max, phrase.length), 0);
const SCRAMBLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

type Phase = "hidden" | "visible" | "exiting";

// Center a phrase across the fixed-width board, padding the rest with blanks.
function layout(phrase: string): string[] {
  const total = COLS - phrase.length;
  const left = Math.floor(total / 2);
  return (" ".repeat(left) + phrase + " ".repeat(total - left)).split("");
}

// Pick a random phrase index, never the one currently shown.
function pickIndex(exclude: number): number {
  if (PHRASES.length <= 1) {
    return 0;
  }
  let next = exclude;
  while (next === exclude) {
    next = Math.floor(Math.random() * PHRASES.length);
  }
  return next;
}

export function BootSplashView({ phase }: { phase: "visible" | "exiting" }) {
  const boardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) {
      return undefined;
    }

    const reels = Array.from(board.querySelectorAll<HTMLElement>(".boot-flap-char"));
    if (reels.length === 0) {
      return undefined;
    }

    const setCell = (el: HTMLElement, ch: string) => {
      const cell = el.parentElement;
      if (ch === " ") {
        el.textContent = "";
        cell?.classList.add("is-blank");
      } else {
        el.textContent = ch;
        cell?.classList.remove("is-blank");
      }
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let phraseIndex = Math.floor(Math.random() * PHRASES.length);

    if (reduce) {
      const apply = () =>
        layout(PHRASES[phraseIndex]).forEach((ch, i) => setCell(reels[i], ch));
      apply();
      const swap = window.setInterval(() => {
        phraseIndex = pickIndex(phraseIndex);
        apply();
      }, 2600);
      return () => window.clearInterval(swap);
    }

    const timers: number[] = [];
    let running = true;

    const flip = (el: HTMLElement) => {
      el.animate(
        [
          { transform: "rotateX(-82deg)", opacity: 0.3 },
          { transform: "rotateX(0deg)", opacity: 1 }
        ],
        { duration: 95, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" }
      );
    };

    const showPhrase = () => {
      if (!running) {
        return;
      }

      const target = layout(PHRASES[phraseIndex]);
      let settled = 0;

      reels.forEach((el, index) => {
        const scramble = window.setInterval(() => {
          el.parentElement?.classList.remove("is-blank");
          el.textContent = SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];
          flip(el);
        }, 65);
        timers.push(scramble);

        const settle = window.setTimeout(() => {
          window.clearInterval(scramble);
          setCell(el, target[index]);
          flip(el);
          settled += 1;
          if (settled === reels.length) {
            phraseIndex = pickIndex(phraseIndex);
            timers.push(window.setTimeout(showPhrase, 1700));
          }
        }, 480 + index * 85);
        timers.push(settle);
      });
    };

    showPhrase();

    return () => {
      running = false;
      timers.forEach((id) => {
        window.clearInterval(id);
        window.clearTimeout(id);
      });
    };
  }, []);

  return (
    <div
      className={`boot-splash${phase === "exiting" ? " boot-splash-exiting" : ""}`}
      role="status"
      aria-label="Loading"
    >
      <div className="boot-splash-panel">
        <span className="boot-splash-slot" aria-hidden="true" />
        <div className="boot-flap-board" ref={boardRef} aria-hidden="true">
          {layout(PHRASES[0]).map((ch, index) => {
            const blank = ch === " ";
            return (
              <div
                key={index}
                className={`boot-flap-cell${blank ? " is-blank" : ""}`}
              >
                <span className="boot-flap-char">{blank ? "" : ch}</span>
              </div>
            );
          })}
        </div>
        <span className="boot-splash-dots" aria-hidden="true" />
      </div>
    </div>
  );
}

export function BootSplash({ active }: { active: boolean }) {
  const [phase, setPhase] = useState<Phase>("hidden");
  const phaseRef = useRef<Phase>("hidden");
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    const setBoth = (next: Phase) => {
      phaseRef.current = next;
      setPhase(next);
    };

    const timeouts: number[] = [];
    const schedule = (fn: () => void, ms: number) => {
      timeouts.push(window.setTimeout(fn, ms));
    };

    if (active) {
      schedule(() => {
        shownAtRef.current = Date.now();
        setBoth("visible");
      }, APPEAR_DELAY_MS);
    } else if (phaseRef.current !== "hidden") {
      const shownAt = shownAtRef.current ?? Date.now();
      const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt));
      schedule(() => setBoth("exiting"), remaining);
      schedule(() => {
        setBoth("hidden");
        shownAtRef.current = null;
      }, remaining + EXIT_MS);
    }

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [active]);

  if (phase === "hidden") {
    return null;
  }

  return <BootSplashView phase={phase === "exiting" ? "exiting" : "visible"} />;
}
