# PromptLang

A Codex CLI prototype that highlights condition words in the prompt as you type.

`if`, `when`, `unless`, `else`, and `otherwise` appear in your terminal's magenta
color. Matching ignores capitalization and respects Unicode word boundaries:
`IF` is highlighted; `iffy`, `elsewhere`, and `if_ready` are ordinary text.

```text
If the tests pass, prepare the change. Otherwise explain the failure.
When editing code, preserve the public API unless a change is necessary.
```

## Build and run

Requirements: macOS or Linux, a native Codex **0.153.4** installation with its
`codex-code-mode-host` helper beside the native executable, Rust installed through
rustup, Python 3, Git, curl, tar, and shasum. The pinned Codex source selects Rust
1.95.0. On macOS, install Xcode Command Line Tools; Linux also needs Codex's native
build prerequisites.

```sh
./scripts/build.sh
./bin/promptlang-codex
```

The first build downloads and verifies Codex 0.153.4 and compiles its dependencies.
Allow time and disk space for a full Rust build. Subsequent builds reuse `.build/`.
The prototype uses Codex's `dev-small` profile for a smaller development build.

The launcher accepts normal Codex arguments and preserves your working directory:

```sh
/path/to/promptlang/bin/promptlang-codex --no-alt-screen
```

This is a separate Codex build, using your normal Codex configuration and login.
Preparation copies the matching official Code Mode helper into the build cache;
the helper stays beside the custom executable. A native installation such as the
Homebrew package is required for this prototype; npm shims are not supported.
It does not replace the installed `codex` command. Condition highlighting applies
to the native terminal composer; the Codex desktop and IDE composers are separate.

## Behavior and scope

- Highlighting changes rendering only. Submitted prompts remain plain text.
- Cursor movement, wrapping, editing, and submission use Codex's existing editor.
- Native mention and search highlights retain priority.
- Shell mode and masked input retain their native presentation.
- This first version is lexical: condition words inside quotes or code are also
  highlighted. It does not parse conditional clauses or change model behavior.

## Tests

Install `just` and `cargo-nextest`, then run the affected Codex TUI suite:

```sh
./scripts/test.sh
```

To run only the prototype's tests:

```sh
./scripts/test.sh -E 'test(promptlang_tests)'
```

Tests cover word boundaries, Unicode offsets, wrapping, cursor preservation,
typing/deletion, shell mode, history-search priority, exact submitted text, and a
styled composer snapshot.

Validation on macOS (2026-09-09): the executable builds, and all seven prototype
tests pass. The full TUI suite reports 4,063 passed, 35 failed, and 6 skipped.
Running the same suite with the highlighting patch removed produces the exact
same 35 failures (4,056 passed): release-version snapshots and terminal-dependent
expectations. These upstream snapshots are left intact; no failures are hidden
or automatically accepted. `just fmt` and shell syntax checks also pass.

## Implementation

`codex/promptlang.rs` supplies render-only byte ranges using Codex's existing
`unicode-segmentation` dependency. `codex/conditions.patch` connects these ranges
to `TextArea::render_ref_styled_with_highlights` in the native composer. The Rust
source and tests are copied into the cached upstream source before each build or test.

Upstream is [OpenAI Codex 0.153.4](https://github.com/openai/codex/tree/rust-v0.153.4),
commit `3d2ee51ca2d5db578f328aa75e20aa22c0197c9a`. The source archive's SHA-256 is
pinned in `scripts/prepare.sh`. `codex/release-lock.patch` repairs the release
archive's stale workspace-package versions (`0.0.0` → `0.153.4`); all third-party
lock entries are unchanged, and builds still use `--locked`. No new Rust
dependency or model API is introduced.

Edit the files under `codex/`, then rerun the build. The cached upstream checkout
is disposable; it is not the source of truth. If the wiring patch changes, move
`.build/codex` aside before rebuilding. Compiled dependencies live separately in
`.build/target` and can be reused.

Licensed under Apache-2.0. See `LICENSE` and `NOTICE`.
