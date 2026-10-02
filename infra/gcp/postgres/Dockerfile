# PostgreSQL for the database VM, mirrored into Artifact Registry by the deploy
# so the VM pulls it over Private Google Access (no NAT, no public address).
# The bookworm variant carries the openssl CLI used for the VM's TLS key.
FROM postgres:16-bookworm@sha256:efedf3595f1d6f415c08568ba171029bf54052e754cc9f030e3f2412b21f3d67

# The entrypoint and server run as the image's postgres account (uid 999).
USER postgres
