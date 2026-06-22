#!/usr/bin/env bash
set -euo pipefail

SESSION="bank-fs-dev"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

COMPOSE_CMD="docker compose"

if tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux attach-session -t "$SESSION"
    exit 0
fi

# Start containers in detached mode.
$COMPOSE_CMD up -d

# Pane 0: watch events only, not all service logs.
tmux new-session -d -s "$SESSION" -n "dev" "$COMPOSE_CMD watch"

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

tmux set-hook -t "$SESSION" session-closed "run-shell 'cd $PROJECT_ROOT && $COMPOSE_CMD down'"

tmux attach-session -t "$SESSION"