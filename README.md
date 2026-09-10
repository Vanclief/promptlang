# PromptLang

A Codex CLI prototype that highlights instruction words and phrases as you type.
Colors distinguish meaning; bold gives hard constraints and direct instructions
more visual weight.

| Meaning | Appearance | Words and phrases |
| --- | --- | --- |
| Prohibitions and negation | **Red, bold** | `must not`, `shall not`, `do not`, `don't`, `don’t`, `never`, `not` |
| Restrictions and exceptions | **Magenta, bold** | `only if`, `only`, `unless`, `except` |
| Conditions and branches | Magenta | `if`, `when`, `then`, `else`, `otherwise` |
| Direct instructions | **Cyan, bold** | `do`, `must`, `required`, `shall`, `ensure`, `make sure`, `have to` |
| Quantities and limits | Cyan | `all`, `every`, `each`, `exactly`, `always`, `at least`, `at most` |
| Order and timing | **Normal foreground, bold** | `before`, `after`, `until`, `first`, `finally` |
| Permission and preferences | Green | `may`, `optional`, `should`, `prefer`, `not required`, `need not`, `do not have to`, `do not need to` (including `don't` / `don’t` forms) |
| Advice against an action | Red | `avoid`, `should not` |

```text
Do not edit generated files. Only if needed, update tests.
If checks fail, you must fix every failure before finishing.
You may use at most 3 attempts; otherwise stop.
Not required: screenshots. Avoid unrelated changes.
```

The palette uses familiar stop/permission conventions for red and green. Magenta
marks branching and scope, cyan marks actions and limits, and neutral bold marks
sequence. Most prose keeps the normal foreground. Bold distinguishes firm rules
from softer advice without relying on hue alone; instructions are never dimmed.

Keyword colors use the terminal's ANSI palette, so their actual shades follow your
theme. Terminal themes and settings also affect contrast and whether bold text
uses brighter colors ([terminal appearance documentation](https://code.visualstudio.com/docs/terminal/appearance)).
The prototype does not impose RGB values or claim that one palette is optimal
for every theme or reader. These are visual conventions, not measured rankings
of keyword effects on a model.

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
It does not replace the installed `codex` command. Instruction highlighting applies
to the native terminal composer; the Codex desktop and IDE composers are separate.

## Behavior and scope

- Highlighting changes rendering only. Submitted prompts remain plain text.
- Matching ignores capitalization and respects Unicode word boundaries: `IF`
  matches; `iffy`, `elsewhere`, and `if_ready` remain ordinary text.
- The longest phrase wins. `do not` is a prohibition; `do not have to` expresses
  discretion. The whole phrase updates as you type or delete.
- Spaces, tabs, and line breaks can join phrase words. Punctuation cannot:
  `must, not` remains two separate matches.
- `not only` and questions starting `do you`, `do I`, `do we`, or `do they` stay
  plain rather than misleadingly marking a prohibition or command.
- Cursor movement, wrapping, editing, and submission use Codex's existing editor.
- Native mentions, attachments, search highlights, shell mode, and masked input
  retain their native presentation.
- This is a lexical prototype, not an English parser. Quoted prose and code can
  contain matches; `May` can mean a month. It does not infer full clause scope,
  resolve every ambiguous phrase, or change model behavior.

## Tests

Install `just` and `cargo-nextest`, then run the affected Codex TUI suite:

```sh
./scripts/test.sh
```

To run only the prototype's tests:

```sh
./scripts/test.sh -E 'test(promptlang_tests)'
```

Tests cover phrase precedence, negation versus discretion, Unicode offsets,
wrapping, cursor preservation, typing/deletion, shell mode, history-search
priority, native mentions and attachments, masked input, exact submitted text,
and styled composer snapshots with light and dark background defaults.

Validation on macOS (2026-09-09): the executable builds, and all 15 prototype
tests pass. The full TUI suite reports 4,071 passed, 35 failed, and 6 skipped.
Running the same suite with the highlighting patch removed produces the exact
same 35 failures (4,056 passed): release-version snapshots and terminal-dependent
expectations. These upstream snapshots are left intact; no failures are hidden
or automatically accepted. `just fmt` and shell syntax checks also pass. The
wiring patch applies cleanly to the pinned source archive and produces the
tested composer source.

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
