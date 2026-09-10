//! Render-only instruction highlighting for the PromptLang prototype.
//!
//! Use logical UTF-8 byte ranges so Codex keeps ownership of cursor placement,
//! wrapping, and the exact text submitted to the model.

use ratatui::style::Style;
use std::ops::Range;
use unicode_segmentation::UnicodeSegmentation;

#[derive(Clone, Copy)]
enum Category {
    Prohibition,
    Restriction,
    Condition,
    Directive,
    Quantity,
    Sequence,
    Discretion,
    Discouraged,
    Plain,
}

impl Category {
    fn style(self) -> Option<Style> {
        // Use the terminal's palette. Bold marks hard constraints without
        // requiring readers to distinguish colors alone; never dim instructions.
        Some(match self {
            Self::Prohibition => Style::default().red().bold(),
            Self::Restriction => Style::default().magenta().bold(),
            Self::Condition => Style::default().magenta(),
            Self::Directive => Style::default().cyan().bold(),
            Self::Quantity => Style::default().cyan(),
            Self::Sequence => Style::default().bold(),
            Self::Discretion => Style::default().green(),
            Self::Discouraged => Style::default().red(),
            Self::Plain => return None,
        })
    }
}

// Phrase matches take precedence over words, with the longest match winning.
// Whitespace may separate words; punctuation must not join distinct clauses.
const PHRASES: &[(&[&str], Category)] = &[
    (&["do", "not", "have", "to"], Category::Discretion),
    (&["do", "not", "need", "to"], Category::Discretion),
    (&["don't", "have", "to"], Category::Discretion),
    (&["don’t", "have", "to"], Category::Discretion),
    (&["don't", "need", "to"], Category::Discretion),
    (&["don’t", "need", "to"], Category::Discretion),
    (&["not", "required"], Category::Discretion),
    (&["need", "not"], Category::Discretion),
    (&["must", "not"], Category::Prohibition),
    (&["shall", "not"], Category::Prohibition),
    (&["do", "not"], Category::Prohibition),
    (&["should", "not"], Category::Discouraged),
    (&["only", "if"], Category::Restriction),
    (&["at", "least"], Category::Quantity),
    (&["at", "most"], Category::Quantity),
    (&["make", "sure"], Category::Directive),
    (&["have", "to"], Category::Directive),
    (&["not", "only"], Category::Plain),
    (&["do", "you"], Category::Plain),
    (&["do", "i"], Category::Plain),
    (&["do", "we"], Category::Plain),
    (&["do", "they"], Category::Plain),
];

const WORDS: &[(&str, Category)] = &[
    ("not", Category::Prohibition),
    ("don't", Category::Prohibition),
    ("don’t", Category::Prohibition),
    ("never", Category::Prohibition),
    ("only", Category::Restriction),
    ("unless", Category::Restriction),
    ("except", Category::Restriction),
    ("if", Category::Condition),
    ("when", Category::Condition),
    ("then", Category::Condition),
    ("else", Category::Condition),
    ("otherwise", Category::Condition),
    ("do", Category::Directive),
    ("must", Category::Directive),
    ("required", Category::Directive),
    ("shall", Category::Directive),
    ("ensure", Category::Directive),
    ("all", Category::Quantity),
    ("every", Category::Quantity),
    ("each", Category::Quantity),
    ("exactly", Category::Quantity),
    ("always", Category::Quantity),
    ("before", Category::Sequence),
    ("after", Category::Sequence),
    ("until", Category::Sequence),
    ("first", Category::Sequence),
    ("finally", Category::Sequence),
    ("should", Category::Discretion),
    ("prefer", Category::Discretion),
    ("may", Category::Discretion),
    ("optional", Category::Discretion),
    ("avoid", Category::Discouraged),
];

pub(super) fn instruction_highlights(text: &str) -> Vec<(Range<usize>, Style)> {
    // grug: this is a lexical vocabulary, not an English parser. Quoted prose,
    // code, and ambiguous uses such as the month "May" can still be highlighted.
    let words: Vec<_> = text.unicode_word_indices().collect();
    let mut highlights = Vec::new();
    let mut index = 0;
    while index < words.len() {
        let remaining = &words[index..];
        let phrase = PHRASES
            .iter()
            .filter(|(phrase, _)| {
                if remaining.len() < phrase.len() {
                    return false;
                }
                let candidate = &remaining[..phrase.len()];
                candidate
                    .iter()
                    .zip(*phrase)
                    .all(|((_, word), expected)| word.eq_ignore_ascii_case(expected))
                    && candidate.windows(2).all(|pair| {
                        let gap = &text[pair[0].0 + pair[0].1.len()..pair[1].0];
                        !gap.is_empty() && gap.chars().all(char::is_whitespace)
                    })
            })
            .max_by_key(|(phrase, _)| phrase.len());
        let (count, category) = if let Some((phrase, category)) = phrase {
            (phrase.len(), Some(*category))
        } else {
            (
                1,
                WORDS
                    .iter()
                    .find(|(word, _)| remaining[0].1.eq_ignore_ascii_case(word))
                    .map(|(_, category)| *category),
            )
        };
        if let Some(style) = category.and_then(Category::style) {
            let (end, last_word) = words[index + count - 1];
            highlights.push((words[index].0..end + last_word.len(), style));
        }
        index += count;
    }
    highlights
}
