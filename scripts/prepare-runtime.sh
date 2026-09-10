#!/usr/bin/env bash
# Download the official runtime for the pinned Codex release. No Codex installation needed.
set -euo pipefail
runtime_cache=${1:?Usage: prepare-runtime.sh CACHE_DIRECTORY}
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64|Darwin-aarch64)
    runtime_target=aarch64-apple-darwin
    runtime_sha=500ee2a02ea598ae519052e7d7d8e201d1db01986f30c214ef4143645dc86fad ;;
  Darwin-x86_64)
    runtime_target=x86_64-apple-darwin
    runtime_sha=a0fa6141e591f44dc2d86a589cfe797212317bfb9fa3a6c73131e4dbb93387fe ;;
  Linux-aarch64|Linux-arm64)
    runtime_target=aarch64-unknown-linux-musl
    runtime_sha=20aefa302c2022b496e32911bf954a5f76c7fd749c6bdb9fbd711e32b66dcbfa ;;
  Linux-x86_64)
    runtime_target=x86_64-unknown-linux-musl
    runtime_sha=a68df7cca23c6da7cde175677df7de61c73a234add1333a1254b86d641af01f7 ;;
  *) echo 'Codex builds support macOS and Linux on arm64 or x86_64.' >&2; exit 1 ;;
esac
mkdir -p "$runtime_cache"
runtime_archive="$runtime_cache/codex-code-mode-host-$runtime_target-0.154.0.tar.gz"
if [[ ! -f "$runtime_archive" ]]; then
  curl --fail --location --silent --show-error --retry 3 \
    "https://github.com/openai/codex/releases/download/rust-v0.154.0/codex-code-mode-host-$runtime_target.tar.gz" \
    --output "$runtime_archive.download"
  mv "$runtime_archive.download" "$runtime_archive"
fi
printf '%s  %s\n' "$runtime_sha" "$runtime_archive" | shasum --algorithm 256 --check
runtime_extract=$(mktemp -d "$runtime_cache/runtime.XXXXXX")
trap 'rm -rf -- "$runtime_extract"' EXIT
tar -xzf "$runtime_archive" -C "$runtime_extract"
runtime_binary="$runtime_extract/codex-code-mode-host-$runtime_target"
if [[ ! -f "$runtime_binary" ]]; then
  echo 'Official runtime archive has an unexpected layout.' >&2
  exit 1
fi
chmod +x "$runtime_binary"
mv "$runtime_binary" "$runtime_cache/codex-code-mode-host-0.154.0"
