#!/usr/bin/env bash
set -euo pipefail
promptlang_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
promptlang_bin_dir="${HOME}/.local/bin"
action=install
target=
usage() {
  cat <<'HELP'
Usage: ./install.sh <codex|claude|claude-editor|pi|all> [--bin-dir DIRECTORY] [--uninstall]

Installs PromptLang launchers. Claude defaults to native composer highlighting.
Use claude-editor for the Ctrl+G fallback without patching a Claude copy.
Default destination: ~/.local/bin. Keep this repository after installing.

Codex needs Rust via rustup, Python 3, Git, curl, tar, and shasum, plus a
C/C++ build toolchain. Its first build can take substantial time and disk space.
Claude and Pi need Node.js 22.19+ and npm. Claude Code must already be installed.
Native highlighting supports Claude 2.1.267; macOS also needs codesign.
Pi uses your installed Pi, or the pinned local Pi installed with dependencies.

Examples:
  ./install.sh pi
  ./install.sh claude --bin-dir "$HOME/bin"
  ./install.sh all
  ./install.sh all --uninstall
HELP
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    codex|claude|claude-editor|pi|all)
      [[ -z "$target" ]] || { echo 'Choose one target (or all).' >&2; exit 2; }
      target=$1; shift ;;
    --bin-dir)
      [[ $# -ge 2 && -n "$2" ]] || { echo '--bin-dir needs a directory.' >&2; exit 2; }
      promptlang_bin_dir=$2; shift 2 ;;
    --uninstall) action=uninstall; shift ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done
if [[ -z "$target" ]]; then usage; exit 2; fi
case "$promptlang_bin_dir" in
  /*) ;;
  *) promptlang_bin_dir="$PWD/$promptlang_bin_dir" ;;
esac
clients=()
case "$target" in
  all) clients=(codex claude pi) ;;
  *) clients=("$target") ;;
esac
launchers=()
for client in "${clients[@]}"; do
  launchers+=("promptlang-$client")
  if [[ "$client" == claude ]]; then launchers+=(promptlang-claude-editor promptlang-editor); fi
  if [[ "$client" == claude-editor ]]; then launchers+=(promptlang-editor); fi
done
marker='# Managed by PromptLang installer'
# Preflight every destination before building or changing any launcher.
for launcher in "${launchers[@]}"; do
  destination="$promptlang_bin_dir/$launcher"
  if [[ -e "$destination" || -L "$destination" ]]; then
    if [[ -L "$destination" ]] || ! head -n 2 "$destination" | tail -n 1 | grep -Fqx "$marker"; then
      printf 'Refusing to replace or remove an unmanaged file: %s\n' "$destination" >&2
      exit 1
    fi
  fi
done
if [[ "$action" == uninstall ]]; then
  for launcher in "${launchers[@]}"; do
    destination="$promptlang_bin_dir/$launcher"
    if [[ -f "$destination" ]]; then
      rm -- "$destination"
      printf 'Removed %s\n' "$destination"
    fi
  done
  echo 'Repository, build cache, client installations, and settings were kept.'
  exit 0
fi
needs_js=false
for client in "${clients[@]}"; do
  if [[ "$client" == claude || "$client" == claude-editor || "$client" == pi ]]; then needs_js=true; fi
  if [[ "$client" == claude || "$client" == claude-editor ]] && ! command -v claude >/dev/null 2>&1; then
    echo 'Install Claude Code first: https://code.claude.com/docs/en/setup' >&2
    exit 1
  fi
done
if [[ "$needs_js" == true ]]; then
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo 'Install Node.js 22.19+ (including npm), then rerun this command.' >&2
    exit 1
  fi
  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 19)) { console.error("PromptLang needs Node.js 22.19+"); process.exit(1); }'
  (cd "$promptlang_root" && npm ci --include=dev --ignore-scripts --no-audit --no-fund)
fi
for client in "${clients[@]}"; do
  if [[ "$client" == codex ]]; then "$promptlang_root/scripts/build.sh"; fi
  if [[ "$client" == claude ]]; then node "$promptlang_root/scripts/prepare-claude.mjs" "$(command -v claude)"; fi
done
mkdir -p "$promptlang_bin_dir"
for launcher in "${launchers[@]}"; do
  destination="$promptlang_bin_dir/$launcher"
  temporary=$(mktemp "$promptlang_bin_dir/.promptlang.XXXXXX")
  trap 'rm -f -- "$temporary"' EXIT
  printf '#!/usr/bin/env bash\n%s\nexec %q "$@"\n' "$marker" "$promptlang_root/bin/$launcher" > "$temporary"
  chmod +x "$temporary"
  mv -- "$temporary" "$destination"
  trap - EXIT
  printf 'Installed %s\n' "$destination"
done
case ":$PATH:" in
  *":$promptlang_bin_dir:"*) ;;
  *) printf '\nAdd the launcher directory to your PATH:\n  export PATH=%q:"$PATH"\n' "$promptlang_bin_dir" ;;
esac
printf '\nReady. Start a client:\n'
for client in "${clients[@]}"; do printf '  promptlang-%s\n' "$client"; done
if [[ "$target" == claude || "$target" == all ]]; then
  printf '\nClaude Code: highlighting is native. Ctrl+G also opens the external editor.\n'
fi
if [[ "$target" == claude-editor ]]; then
  printf '\nClaude Code: press Ctrl+G to open the highlighted editor.\n'
fi
