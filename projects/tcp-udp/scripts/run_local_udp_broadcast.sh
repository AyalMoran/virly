#!/usr/bin/env bash
set -euo pipefail

./bin/UdpBroadcastListener --bind-port 5003 &
L1=$!
./bin/UdpBroadcastListener --bind-port 5003 &
L2=$!
./bin/UdpBroadcastListener --bind-port 5003 &
L3=$!

sleep 1
./bin/UdpBroadcastSender --target-host 255.255.255.255 --target-port 5003 --count 5 --interval-ms 700

kill -INT "$L1" "$L2" "$L3" || true
wait "$L1" || true
wait "$L2" || true
wait "$L3" || true
