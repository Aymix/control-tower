#!/bin/sh
set -e
echo "[web] applying migrations"
node node_modules/drizzle-kit/bin.cjs migrate
echo "[web] starting"
exec node server.js
