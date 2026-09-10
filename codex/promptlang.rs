//! Render-only condition highlighting for the PromptLang prototype.
//!
//! Use logical UTF-8 byte ranges so Codex keeps ownership of cursor placement,
//! wrapping, and the exact text submitted to the model.

use ratatui::style::Style;
use std::ops::Range;
use unicode_segmentation::UnicodeSegmentation;

pub(super) fn condition_highlights(text: &str) -> Vec<(Range<usize>, Style)> {
    // grug: lexical highlighting includes quoted/code text. Add context parsing
    // only if real prompt editing shows those matches are too distracting.
    text.unicode_word_indices()
        .filter(|(_, word)| {
            ["if", "when", "unless", "else", "otherwise"]
                .iter()
                .any(|condition| word.eq_ignore_ascii_case(condition))
        })
        .map(|(start, word)| (start..start + word.len(), Style::default().magenta()))
        .collect()
}
