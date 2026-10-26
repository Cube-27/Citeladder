# PostgreSQL for the database VM, mirrored into Artifact Registry by the deploy
# so the VM pulls it over Private Google Access (no NAT, no public address).
# The bookworm variant carries the openssl CLI used for the VM's TLS key.
# Pinned by digest alone; this is postgres:16-bookworm.
FROM postgres@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6

# The entrypoint calls gosu only when started as root, which this image never
# is. Its bundled Go runtime carried every vulnerability finding on the VM.
RUN rm /usr/local/bin/gosu

# The entrypoint and server run as the image's postgres account (uid 999).
USER postgres
