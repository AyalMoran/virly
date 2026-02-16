#!/usr/bin/env bash
set -euo pipefail

./bin/TcpPingServer --bind-port 5002 &
SERVER_PID=$!

sleep 1
./bin/TcpPingClient --target-host 127.0.0.1 --target-port 5002 --count 5 --interval-ms 500 --message client1 &
CLIENT1_PID=$!
./bin/TcpPingClient --target-host 127.0.0.1 --target-port 5002 --count 5 --interval-ms 600 --message client2 &
CLIENT2_PID=$!
./bin/TcpPingClient --target-host 127.0.0.1 --target-port 5002 --count 5 --interval-ms 700 --message client3 &
CLIENT3_PID=$!

wait "$CLIENT1_PID"
wait "$CLIENT2_PID"
wait "$CLIENT3_PID"
kill -INT "$SERVER_PID" || true
wait "$SERVER_PID" || true
