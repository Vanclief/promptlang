#!/usr/bin/env bash
set -euo pipefail

source "$(dirname -- "${BASH_SOURCE[0]}")/prepare.sh"
cargo build --locked --profile dev-small -p codex-cli --bin codex
printf '\nRun the prototype: %s/bin/codex-pl\n' "$repo_root"
