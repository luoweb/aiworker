# Build a standalone linux/arm64 binary of `aiworker` (web UI + API only).
#
# Use this Dockerfile on a machine/CI that can build for linux/arm64
# (native arm64 Linux host, or Docker with arm64 emulation/buildx).
#
# Build the builder image:
#   docker build --platform linux/arm64 \
#     -t aiworker-builder \
#     -f scripts/package-linux-arm64/Dockerfile \
#     --build-arg AIWORKER_PKG=@aiworker/web \
#     --build-arg AIWORKER_VERSION=latest \
#     .
#
# The build host can use any Node; the resulting binary embeds Node 22.23.2
# (what pkg-fetch 6.x provides for linux/arm64) — that is the standalone runtime.
#
# Extract the single binary out of the image:
#   docker create --name aiworker-extract aiworker-builder
#   docker cp aiworker-extract:/out/aiworker ./aiworker-linux-arm64
#   docker rm aiworker-extract
#
# Run on the target (linux/arm64, no node/npm required):
#   chmod +x aiworker-linux-arm64
#   ./aiworker-linux-arm64 serve --port 3001
#
# Note: `serve` runs in-process (foreground) inside the binary, so just run it
# directly. Terminal (node-pty/bun-pty) and on-device voice (sherpa-onnx) are
# not included in this web-only build.

FROM --platform=linux/arm64 node:22-bookworm-slim

ARG AIWORKER_VERSION=latest
ARG PKG_VERSION=6.23.0
# Override for scoped publishes, e.g. @aiworker/web
ARG AIWORKER_PKG=@aiworker/web

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /build

# The ESM source tree is converted to CommonJS per file before pkg runs (pkg
# cannot load this app as ESM; a single-file bundle would break the app's
# per-module relative paths). See build.sh and transform-cjs.cjs.
COPY scripts/package-linux-arm64/build.sh /build/build.sh
COPY scripts/package-linux-arm64/transform-cjs.cjs /build/transform-cjs.cjs

RUN chmod +x /build/build.sh \
  && AIWORKER_PKG="${AIWORKER_PKG}" /build/build.sh "${AIWORKER_VERSION}" "${PKG_VERSION}"

CMD ["/bin/true"]
