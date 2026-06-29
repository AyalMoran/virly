#!/usr/bin/env bash
set -euo pipefail

SESSION="bank-fs-dev"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

COMPOSE_CMD="docker compose"

# Tear the whole stack down, but only once the tmux session is actually gone
# (i.e. the last pane was closed) — never on a plain detach, which should leave
# everything running. Called after every attach below.
#
# We do this here instead of via a `session-closed` tmux hook because a hook
# scoped to the session is removed together with the session and never fires;
# only a *global* hook fires, and that would also down unrelated sessions.
teardown_if_session_gone() {
    if ! tmux has-session -t "$SESSION" 2>/dev/null; then
        echo "Session '$SESSION' closed — bringing the stack down…"
        $COMPOSE_CMD down
    fi
}

if tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux attach-session -t "$SESSION" || true
    teardown_if_session_gone
    exit 0
fi

# Start containers in detached mode.
$COMPOSE_CMD up -d

# Pane 0: `docker compose watch`, wrapped so a crash no longer makes the pane
# vanish silently. On an unexpected exit it prints the status and restarts, so
# you can see what happened; a deliberate Ctrl-C breaks the loop and closes the
# pane like the others, so it still takes part in the teardown-on-last-pane flow.
WATCH_CMD='INTERRUPTED=
trap "INTERRUPTED=1" INT TERM
while [ -z "$INTERRUPTED" ]; do
  '"$COMPOSE_CMD"' watch
  status=$?
  [ -z "$INTERRUPTED" ] || break
  printf "\n[compose watch exited %s — restarting in 2s; Ctrl-C to stop]\n" "$status"
  sleep 2
done'

# Pane 0: watch events only, not all service logs.
tmux new-session -d -s "$SESSION" -n "dev" "$WATCH_CMD"

# Make sure a pane closes when its command exits (so Ctrl-C tears panes down),
# regardless of any remain-on-exit setting in the user's tmux config.
tmux set-window-option -t "$SESSION:dev" remain-on-exit off 2>/dev/null || true

# Pane 1: backend app logs.
tmux split-window -h -t "$SESSION:dev" "$COMPOSE_CMD logs -f --tail=100 app"

# Pane 2: frontend logs.
tmux split-window -v -t "$SESSION:dev.1" "$COMPOSE_CMD logs -f --tail=100 frontend"

# Pane 3: mongo logs.
tmux split-window -v -t "$SESSION:dev.2" "$COMPOSE_CMD logs -f --tail=100 mongo"

tmux select-layout -t "$SESSION:dev" tiled

tmux select-pane -t "$SESSION:dev.0" -T "compose watch"
tmux select-pane -t "$SESSION:dev.1" -T "app logs"
tmux select-pane -t "$SESSION:dev.2" -T "frontend logs"
tmux select-pane -t "$SESSION:dev.3" -T "mongo logs"

tmux attach-session -t "$SESSION" || true

# Attach returns on detach *or* when the last pane closed; only the latter
# leaves no session, which is when we bring the stack down.
teardown_if_session_gone
