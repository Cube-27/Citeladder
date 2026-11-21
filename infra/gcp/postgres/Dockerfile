# The bookworm variant carries the openssl CLI used for the VM's TLS key.
# Pinned by tag and digest: the tag keeps Dependabot's digest updates on the
# 16-bookworm family. CI's PostgreSQL service (.github/workflows/ci.yml) pins
# the same reference; bump both together.
FROM postgres:16-bookworm@sha256:efedf3595f1d6f415c08568ba171029bf54052e754cc9f030e3f2412b21f3d67

# The entrypoint calls gosu only when started as root, which this image never
# is. Its bundled Go runtime carried every vulnerability finding on the VM.
RUN rm /usr/local/bin/gosu

USER postgres
