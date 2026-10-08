#!/bin/sh
# Garante que a pasta de dados (disco montado) pertença ao usuário "node"
# e então roda o servidor sem privilégios de root.
set -e
mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR" 2>/dev/null || true
exec setpriv --reuid=node --regid=node --init-groups node server.js
