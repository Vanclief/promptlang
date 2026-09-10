# Development

The Codex Rust vocabulary is the source of truth. `npm run sync-vocabulary`
generates `lib/vocabulary.json`; `npm test` verifies that it matches. Pi and
Claude share `lib/highlight.js` for matching. Pi and the Claude external editor
share `lib/editor.js` for rendering; native Claude uses its own renderer.
After changing the Rust vocabulary, regenerate the JSON and test both languages.

The Pi extension installs a custom editor. Native Claude modifies presentation in
a separate local binary; its fallback is a file editor built with the Pi TUI
library. Neither highlighter makes model/API calls. JavaScript dependencies are
pinned in `package-lock.json`. Native Claude adds no npm dependencies.

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

## Native Claude integration

`./install.sh claude` invokes `scripts/prepare-claude.mjs` with the original
`claude` path. Supported native version: **2.1.267**. The output is
`.build/claude/claude`, with source/output SHA-256 and module identity recorded
in `.build/claude/claude.json`. The original installation is never written.

`claude/native-patch.js` finds three unique structural anchors in the composer
module. It adds logical ranges before Claude's existing cursor, wrapping, and
scrolling transformations, and styles only those ranges through Claude's own
Chalk instance. Native highlights take precedence. Shell mode, masked inputs,
other text fields, mentions, and paste/image placeholders remain native. The
matcher and vocabulary are embedded from the same files Pi uses; no separate
keyword regex table is maintained.

Claude 2.1.267 has a split Bun bundle. tweakcc 4.3.3's public extractor returns
only its small entry module, so its standard input patch does not cover this
layout. PromptLang uses a narrow implementation of Bun's documented-in-source
[52-byte module table](https://github.com/oven-sh/bun/blob/main/src/standalone_graph/StandaloneModuleGraph.rs),
informed by [tweakcc's native loader](https://github.com/Piebald-AI/tweakcc/blob/main/src/nativeInstallation.ts)
and [input highlighter](https://github.com/Piebald-AI/tweakcc/blob/main/src/patches/inputPatternHighlighters.ts).
tweakcc is not a runtime dependency.

`claude/bun-module.js` validates the module graph and replaces the composer in
its own former bytecode allocation. The entire executable keeps the same size
until platform signing. The changed module's bytecode, module info, source map,
and source hash are invalidated; the contiguous-source flag is cleared. Other
module payloads stay byte-for-byte unchanged, and executable section positions
and sizes are preserved before signing. Setup rejects overlapping storage,
insufficient capacity, unknown layout flags, ambiguous anchors, and already-patched
input. This deliberately
supports one verified layout; extend it only alongside a new version's tests.

A temporary copy must pass syntax, signing (macOS), `--version`, and `--help`
checks before it replaces the prior PromptLang executable. The launcher sets
`DISABLE_AUTOUPDATER=1` and `DISABLE_UPDATES=1` for that process. Both launchers
retain the supported Ctrl+G external-editor handoff. Use
`./install.sh claude-editor` when the installed native version is unsupported.

No proprietary Claude source, test snapshots of that source, or binaries belong
in git. Binary tests use synthetic Bun graphs and an authored renderer fixture.
The native CI jobs download the pinned official npm platform package, patch it
locally, and verify launch without logging in or making model requests.

## Validation

```sh
npm ci --ignore-scripts
npm test
bash -n install.sh scripts/*.sh bin/promptlang-*
```

JavaScript tests exercise actual Pi editor components and xterm terminal cells.
They cover source ranges, cursor placement/inversion, wrapping, scrolling,
collapsed pastes, file save/cancel/conflicts, installer ownership checks, native
range injection, binary boundaries, stale cache invalidation, and unsupported
version rejection.
The bundled Pi CLI is also smoke-tested interactively without submitting prompts.

Native Claude 2.1.267 was tested in a real macOS terminal: red/magenta/cyan/green
and bold styling, `do not` changing from prohibition to `do not have to`, wrapped
Unicode drafts, cursor edits, and exact plain-text Ctrl+G handoff. No prompts were
submitted during those checks. The original Claude binary SHA-256 was unchanged.

For Codex, install `just` and `cargo-nextest`, then run:

```sh
./scripts/test.sh -E 'test(promptlang_tests)'
./scripts/test.sh
```

The Rust overlay has 15 passing prototype tests. On macOS, the full Codex 0.153.4
TUI suite has 4,071 passes, 35 failures, and 6 skips. The exact same 35 failures
occur without PromptLang (4,056 passes): release-version snapshots and
terminal-dependent expectations. These upstream snapshots are left unchanged.

## Updating the pinned Codex build

The source archive SHA-256 is in `scripts/prepare.sh`. Runtime archive SHA-256
values are in `scripts/prepare-runtime.sh`, from the official release assets.
Update the source pin, runtime checksums, and overlay together. Verify each target
before adding it to the supported-platform list. Downloads are verified before
extraction. Runtime downloads support macOS/Linux on arm64 and x86_64; Windows
shell installation is not currently provided.

Cached source is disposable. If a wiring patch changes, move `.build/codex` aside;
`.build/target` retains compiled dependencies. `scripts/prepare.sh` applies the
patches and copies the authoritative `codex/*.rs` files before a build or test.

## Updating the preview

```sh
node scripts/render-preview.mjs
```

The README SVGs are generated from the same JavaScript matcher. Their light/dark
palettes illustrate the categories; a user's terminal controls actual ANSI colors.
Review both SVGs after changing the vocabulary or preview text. CI checks that
regenerating them produces no diff.
