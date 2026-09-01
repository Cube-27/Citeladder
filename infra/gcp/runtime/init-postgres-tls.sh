#!/usr/bin/env sh
set -eu

if [ ! -s /tls/server.crt ] || [ ! -s /tls/server.key ]; then
  openssl req -new -x509 -nodes -days 30 -subj '/CN=localhost' \
    -keyout /tls/server.key -out /tls/server.crt
fi
# The serving postgres:16-alpine image runs postgres as uid/gid 70.
chown 70:70 /tls/server.crt /tls/server.key
chmod 0644 /tls/server.crt
chmod 0600 /tls/server.key
