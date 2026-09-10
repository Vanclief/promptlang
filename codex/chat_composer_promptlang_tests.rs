use super::ChatComposer;
use super::HistoryEntry;
use super::InputResult;
use super::tests::new_test_composer;
use super::tests::type_chars_humanlike;
use crate::bottom_pane::promptlang::instruction_highlights;
use crate::render::renderable::Renderable;
use crossterm::event::KeyCode;
use crossterm::event::KeyEvent;
use crossterm::event::KeyModifiers;
use pretty_assertions::assert_eq;
use ratatui::buffer::Buffer;
use ratatui::buffer::Cell;
use ratatui::layout::Rect;
use ratatui::style::Color;
use ratatui::style::Modifier;
use ratatui::style::Style;

fn render(composer: &ChatComposer, width: u16) -> Buffer {
    let area = Rect::new(
        /*x*/ 0,
        /*y*/ 0,
        width,
        composer.desired_height(width),
    );
    let mut buffer = Buffer::empty(area);
    composer.render(area, &mut buffer);
    buffer
}

fn highlighted_text(buffer: &Buffer, color: Color) -> String {
    buffer
        .content
        .iter()
        .filter(|cell| cell.fg == color)
        .map(Cell::symbol)
        .collect()
}

#[test]
fn condition_words_respect_case_boundaries_and_unicode() {
    let text = "México 🐋: IF(x), When ready; unless busy, ELSE Otherwise. iffy gift elsewhere if_ready if2 ifé if's";
    let words: Vec<_> = instruction_highlights(text)
        .into_iter()
        .map(|(range, _)| &text[range])
        .collect();
    assert_eq!(words, ["IF", "When", "unless", "ELSE", "Otherwise"]);
}

#[test]
fn conditions_render_across_wrapping_without_moving_cursor_or_changing_text() {
    let text = "México 🐋: If ready, unless busy.";
    let (mut composer, _rx) = new_test_composer();
    composer.set_text_content(text.to_string(), Vec::new(), Vec::new());
    let cursor = text.find("unless").unwrap() + 2;
    composer.draft.textarea.set_cursor(cursor);

    for width in [18, 40, 80] {
        let buffer = render(&composer, width);
        assert_eq!(highlighted_text(&buffer, Color::Magenta), "Ifunless");
        assert_eq!(
            (composer.current_text(), composer.draft.textarea.cursor()),
            (text.to_string(), cursor)
        );
    }
}

#[test]
fn typing_and_deleting_recompute_conditions() {
    let (mut composer, _rx) = new_test_composer();
    type_chars_humanlike(&mut composer, &['i', 'f']);
    assert_eq!(
        highlighted_text(&render(&composer, /*width*/ 40), Color::Magenta),
        "if"
    );
    type_chars_humanlike(&mut composer, &['f', 'y']);
    assert_eq!(
        highlighted_text(&render(&composer, /*width*/ 40), Color::Magenta),
        ""
    );
    for _ in 0..2 {
        let _ = composer.handle_key_event(KeyEvent::new(KeyCode::Backspace, KeyModifiers::NONE));
    }
    assert_eq!(
        highlighted_text(&render(&composer, /*width*/ 40), Color::Magenta),
        "if"
    );
    assert_eq!(composer.current_text(), "if");
}

#[test]
fn shell_mode_uses_native_shell_presentation() {
    let (mut composer, _rx) = new_test_composer();
    composer.set_text_content(
        "!if true; then echo must not; fi".to_string(),
        Vec::new(),
        Vec::new(),
    );
    assert!(composer.draft.is_bash_mode);
    assert_eq!(
        highlighted_text(&render(&composer, /*width*/ 60), Color::Magenta),
        ""
    );
}

#[test]
fn submission_retains_the_exact_plain_prompt() {
    let text =
        "If ready, you MUST NOT delete files.\nDon’t retry unless asked; at most 3 attempts.";
    let (mut composer, _rx) = new_test_composer();
    composer.set_text_content(text.to_string(), Vec::new(), Vec::new());
    let _ = render(&composer, /*width*/ 60);
    let (result, _) = composer.handle_submission(/*should_queue*/ false);
    let InputResult::Submitted {
        text: submitted, ..
    } = result
    else {
        panic!("expected the ordinary prompt submission path");
    };
    assert_eq!(submitted, text);
}

#[test]
fn history_search_keeps_priority_over_instruction_phrases() {
    let (mut composer, _rx) = new_test_composer();
    composer
        .history
        .record_local_submission(HistoryEntry::new("do not edit".to_string()));
    let _ = composer.handle_key_event(KeyEvent::new(KeyCode::Char('r'), KeyModifiers::CONTROL));
    for character in ['d', 'o'] {
        let _ =
            composer.handle_key_event(KeyEvent::new(KeyCode::Char(character), KeyModifiers::NONE));
    }
    let buffer = render(&composer, /*width*/ 40);
    let [_, _, textarea, _] = composer.layout_areas(buffer.area);
    let styles: Vec<_> = (0..2)
        .map(|offset| {
            buffer[(textarea.x + offset, textarea.y)]
                .style()
                .add_modifier
                .contains(Modifier::REVERSED | Modifier::BOLD)
        })
        .collect();
    assert_eq!(
        (composer.current_text(), styles),
        ("do not edit".to_string(), vec![true, true])
    );
    let _ = composer.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));
    assert_eq!(
        highlighted_text(&render(&composer, /*width*/ 40), Color::Red),
        "do not"
    );
}

#[test]
fn conditions_composer_snapshot() {
    crate::terminal_palette::with_test_default_colors(
        crate::terminal_probe::DefaultColors {
            fg: (220, 220, 220),
            bg: (0, 0, 0),
        },
        || {
            let (mut composer, _rx) = new_test_composer();
            composer.set_text_content(
                "If ready, proceed. Otherwise wait.".to_string(),
                Vec::new(),
                Vec::new(),
            );
            let buffer = render(&composer, /*width*/ 44);
            insta::assert_snapshot!("promptlang_conditions", format!("{buffer:?}"));
        },
    );
}

fn highlighted_spans(text: &str) -> Vec<(&str, Style)> {
    instruction_highlights(text)
        .into_iter()
        .map(|(range, style)| (&text[range], style))
        .collect()
}

#[test]
fn phrases_distinguish_prohibition_discretion_and_advice() {
    let text = "You MUST NOT edit; you are NOT REQUIRED to edit; do not have to edit. Don't delete. Don’t remove. You should not rewrite.";
    assert_eq!(
        highlighted_spans(text),
        vec![
            ("MUST NOT", Style::default().red().bold()),
            ("NOT REQUIRED", Style::default().green()),
            ("do not have to", Style::default().green()),
            ("Don't", Style::default().red().bold()),
            ("Don’t", Style::default().red().bold()),
            ("should not", Style::default().red()),
        ]
    );
}

#[test]
fn phrases_match_across_whitespace_but_not_clause_boundaries() {
    assert_eq!(
        highlighted_spans(
            "México 🐋: Only IF ready, use at\tMOST 3 attempts. Do\nnot edit; must, not; at, most."
        ),
        vec![
            ("Only IF", Style::default().magenta().bold()),
            ("at\tMOST", Style::default().cyan()),
            ("Do\nnot", Style::default().red().bold()),
            ("must", Style::default().cyan().bold()),
            ("not", Style::default().red().bold()),
        ]
    );
}

#[test]
fn question_and_additive_phrases_do_not_become_commands_or_prohibitions() {
    assert_eq!(
        highlighted_spans(
            "Do you know? Do I continue? Do we proceed? Do they agree? Not only fast but reliable. Do this. Make sure each result is correct."
        ),
        vec![
            ("Do", Style::default().cyan().bold()),
            ("Make sure", Style::default().cyan().bold()),
            ("each", Style::default().cyan()),
        ]
    );
}

#[test]
fn typing_reclassifies_the_whole_phrase_without_leaving_old_styles() {
    let (mut composer, _rx) = new_test_composer();
    type_chars_humanlike(&mut composer, &"do not".chars().collect::<Vec<_>>());
    assert_eq!(
        highlighted_text(&render(&composer, /*width*/ 60), Color::Red),
        "do not"
    );
    type_chars_humanlike(&mut composer, &" have to".chars().collect::<Vec<_>>());
    let buffer = render(&composer, /*width*/ 60);
    assert_eq!(
        (
            highlighted_text(&buffer, Color::Red),
            highlighted_text(&buffer, Color::Green)
        ),
        (String::new(), "do not have to".to_string())
    );
    for _ in 0..8 {
        let _ = composer.handle_key_event(KeyEvent::new(KeyCode::Backspace, KeyModifiers::NONE));
    }
    let buffer = render(&composer, /*width*/ 60);
    assert_eq!(
        (
            highlighted_text(&buffer, Color::Red),
            highlighted_text(&buffer, Color::Green)
        ),
        ("do not".to_string(), String::new())
    );
}

#[test]
fn wrapped_phrases_preserve_unicode_text_and_cursor() {
    let text = "México 🐋: You must not edit unless asked.";
    let (mut composer, _rx) = new_test_composer();
    composer.set_text_content(text.to_string(), Vec::new(), Vec::new());
    let cursor = text.find("not").unwrap() + 1;
    composer.draft.textarea.set_cursor(cursor);
    for width in [18, 40, 80] {
        let buffer = render(&composer, width);
        assert_eq!(
            (
                highlighted_text(&buffer, Color::Red).replace(' ', ""),
                highlighted_text(&buffer, Color::Magenta)
            ),
            ("mustnot".to_string(), "unless".to_string())
        );
        assert_eq!(
            (composer.current_text(), composer.draft.textarea.cursor()),
            (text.to_string(), cursor)
        );
    }
}

#[test]
fn atomic_mentions_and_attachments_keep_native_styles() {
    let text = "Do not edit @never or [only if]; otherwise wait.";
    let (mut composer, _rx) = new_test_composer();
    composer.set_text_content(text.to_string(), Vec::new(), Vec::new());
    let start = text.find("@never").unwrap();
    let id = composer
        .draft
        .textarea
        .add_element_range(start..start + "@never".len())
        .unwrap();
    composer.draft.mention_bindings.insert(
        id,
        super::ComposerMentionBinding {
            sigil: '@',
            mention: "never".to_string(),
            path: "plugin://never@test".to_string(),
        },
    );
    let start = text.find("[only if]").unwrap();
    let _ = composer
        .draft
        .textarea
        .add_element_range(start..start + "[only if]".len());
    let buffer = render(&composer, /*width*/ 80);
    let [_, _, textarea, _] = composer.layout_areas(buffer.area);
    for (label, color) in [("@never", Color::Magenta), ("[only if]", Color::Cyan)] {
        let start = text.find(label).unwrap() as u16;
        let cells: Vec<_> = (0..label.len() as u16)
            .map(|offset| {
                let cell = &buffer[(textarea.x + start + offset, textarea.y)];
                (cell.fg, cell.modifier)
            })
            .collect();
        assert_eq!(cells, vec![(color, Modifier::empty()); label.len()]);
    }
    assert_eq!(highlighted_text(&buffer, Color::Red), "Do not");
}

#[test]
fn masked_input_keeps_words_and_categories_hidden() {
    let text = "Must not edit; only if ready.";
    let (mut composer, _rx) = new_test_composer();
    composer.set_text_content(text.to_string(), Vec::new(), Vec::new());
    let area = Rect::new(
        /*x*/ 0,
        /*y*/ 0,
        /*width*/ 60,
        composer.desired_height(/*width*/ 60),
    );
    let mut buffer = Buffer::empty(area);
    composer.render_with_mask(area, &mut buffer, Some('*'));
    let [_, _, textarea, _] = composer.layout_areas(area);
    let cells: Vec<_> = (0..text.len() as u16)
        .map(|offset| {
            let cell = &buffer[(textarea.x + offset, textarea.y)];
            (cell.symbol(), cell.fg, cell.modifier)
        })
        .collect();
    assert_eq!(
        cells,
        vec![("*", Color::Reset, Modifier::empty()); text.len()]
    );
    assert_eq!(composer.current_text(), text);
}

#[test]
fn instruction_palette_snapshots_on_light_and_dark_backgrounds() {
    for (name, fg, bg) in [
        ("promptlang_operators_dark", (220, 220, 220), (0, 0, 0)),
        ("promptlang_operators_light", (30, 30, 30), (255, 255, 255)),
    ] {
        crate::terminal_palette::with_test_default_colors(
            crate::terminal_probe::DefaultColors { fg, bg },
            || {
                let (mut composer, _rx) = new_test_composer();
                composer.set_text_content(
                    "Do not edit generated files. Only if needed, update tests.\nIf checks fail, you must fix every failure before finishing.\nYou may use at most 3 attempts; otherwise stop.\nNot required: screenshots. Avoid unrelated changes.".to_string(),
                    Vec::new(),
                    Vec::new(),
                );
                let buffer = render(&composer, /*width*/ 76);
                insta::assert_snapshot!(name, format!("{buffer:?}"));
            },
        );
    }
}
