#!/usr/bin/env bash
set -euo pipefail

URI="mongodb://mongo:27017/admin?directConnection=true"
CONFIG='{ _id: "rs0", members: [{ _id: 0, host: "mongo:27017" }] }'

until mongosh "$URI" --quiet --eval 'try { rs.status().ok } catch (e) { 0 }' | grep -q 1; do
  mongosh "$URI" --quiet --eval "try { rs.initiate($CONFIG); } catch (e) { if (!String(e).includes('already initiated')) throw e; }"
  sleep 2
done
