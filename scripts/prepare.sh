#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
build_dir="$repo_root/.build"
codex_version=0.154.0
source_dir="$build_dir/codex-$codex_version"
archive="$build_dir/codex-$codex_version.tar.gz"
archive_sha256=1c4cdc3b87ba290b5d110425b4f6ff21663e236580bc760d1e149bd2d9f9519f

for command in cargo git curl tar shasum python3; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf 'Missing required command: %s\n' "$command" >&2
        exit 1
    fi
done

mkdir -p "$build_dir"
export CARGO_TARGET_DIR="$build_dir/target"
export CARGO_INCREMENTAL=0

# Use the official runtime for this release instead of rebuilding V8 for a UI patch.
runtime="$build_dir/codex-code-mode-host-$codex_version"
if [[ ! -x "$runtime" ]]; then
    "$repo_root/scripts/prepare-runtime.sh" "$build_dir"
fi
mkdir -p "$CARGO_TARGET_DIR/dev-small"
cp "$runtime" "$CARGO_TARGET_DIR/dev-small/codex-code-mode-host"

if [[ ! -f "$archive" ]]; then
    curl --fail --location --silent --show-error --retry 3 \
        "https://github.com/openai/codex/archive/refs/tags/rust-v$codex_version.tar.gz" \
        --output "$archive.download"
    mv "$archive.download" "$archive"
fi
printf '%s  %s\n' "$archive_sha256" "$archive" | shasum --algorithm 256 --check

if [[ ! -d "$source_dir" ]]; then
    extract_dir=$(mktemp -d "$build_dir/extract.XXXXXX")
    trap 'rm -rf -- "$extract_dir"' EXIT
    tar -xzf "$archive" --strip-components=1 -C "$extract_dir"
    mv "$extract_dir" "$source_dir"
    trap - EXIT
fi

# Give git apply an independent root, even when this cache is inside PromptLang.
if [[ ! -d "$source_dir/.git" ]]; then
    git init --quiet --initial-branch=upstream-snapshot "$source_dir"
fi
# The release tag leaves local package versions at 0.0.0 in Cargo.lock.
# Correct those metadata entries while retaining every third-party lock entry.
for patch_file in "$repo_root/codex/release-lock.patch" "$repo_root/codex/conditions.patch"; do
    if git -C "$source_dir" apply --reverse --check "$patch_file" 2>/dev/null; then
        printf 'Already applied: %s\n' "$(basename -- "$patch_file")"
    elif git -C "$source_dir" apply --check "$patch_file"; then
        git -C "$source_dir" apply "$patch_file"
    else
        printf 'Cached source does not match the patch. Move %s aside and rebuild.\n' "$source_dir" >&2
        exit 1
    fi
done

pane="$source_dir/codex-rs/tui/src/bottom_pane"
for source_file in promptlang.rs chat_composer_promptlang_tests.rs; do
    if ! cmp -s "$repo_root/codex/$source_file" "$pane/$source_file"; then
        cp "$repo_root/codex/$source_file" "$pane/$source_file"
    fi
done
if [[ -d "$repo_root/codex/snapshots" ]]; then
    cp "$repo_root"/codex/snapshots/*.snap "$pane/snapshots/"
fi

cd "$source_dir/codex-rs"
