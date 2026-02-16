#!/usr/bin/env bash
set -euo pipefail

./bin/UdpPingServer --bind-port 5001 &
SERVER_PID=$!

sleep 1
./bin/UdpPingClient --target-host 127.0.0.1 --target-port 5001 --count 5 --interval-ms 500

kill -INT "$SERVER_PID" || true
wait "$SERVER_PID" || true
