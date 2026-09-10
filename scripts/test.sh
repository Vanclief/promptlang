#!/usr/bin/env bash
set -euo pipefail

source "$(dirname -- "${BASH_SOURCE[0]}")/prepare.sh"
just test --locked --cargo-profile dev-small -p codex-tui "$@"
