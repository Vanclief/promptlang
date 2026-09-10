#!/usr/bin/env bash
# Download the official runtime for the pinned Codex release. No Codex installation needed.
set -euo pipefail
runtime_cache=${1:?Usage: prepare-runtime.sh CACHE_DIRECTORY}
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64|Darwin-aarch64)
    runtime_target=aarch64-apple-darwin
    runtime_sha=45a9b0fdf53b98b85a6bb91e175dd90e961328a7a14fb50a40902205199df1df ;;
  Darwin-x86_64)
    runtime_target=x86_64-apple-darwin
    runtime_sha=2ffaebd0103d976232c358419a508859da862e128f3ca0bb071541346fbe3bf7 ;;
  Linux-aarch64|Linux-arm64)
    runtime_target=aarch64-unknown-linux-musl
    runtime_sha=d8047b8d33370d6090e729d27eb76de60a2686baa1c143c138c9b05dc70d813b ;;
  Linux-x86_64)
    runtime_target=x86_64-unknown-linux-musl
    runtime_sha=f95830a869590957664bbfc67bccb08773806b693670baf15908176f89b4cd31 ;;
  *) echo 'Codex builds support macOS and Linux on arm64 or x86_64.' >&2; exit 1 ;;
esac
mkdir -p "$runtime_cache"
runtime_archive="$runtime_cache/codex-code-mode-host-$runtime_target-0.153.4.tar.gz"
if [[ ! -f "$runtime_archive" ]]; then
  curl --fail --location --silent --show-error --retry 3 \
    "https://github.com/openai/codex/releases/download/rust-v0.153.4/codex-code-mode-host-$runtime_target.tar.gz" \
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
mv "$runtime_binary" "$runtime_cache/codex-code-mode-host-0.153.4"
