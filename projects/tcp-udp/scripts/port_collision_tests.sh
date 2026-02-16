#!/usr/bin/env bash
set -euo pipefail

echo "TCP same port test (second server should fail):"
./bin/TcpPingServer --bind-port 5010 &
S1=$!
sleep 1
if ./bin/TcpPingServer --bind-port 5010; then
  echo "Unexpected success"
else
  echo "Expected failure"
fi
kill -INT "$S1" || true
wait "$S1" || true

echo "UDP different ports test (both should succeed):"
./bin/UdpPingServer --bind-port 5011 &
U1=$!
./bin/UdpPingServer --bind-port 5012 &
U2=$!
sleep 1
kill -INT "$U1" "$U2" || true
wait "$U1" || true
wait "$U2" || true
