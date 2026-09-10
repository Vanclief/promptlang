use super::ChatComposer;
use super::HistoryEntry;
use super::InputResult;
use super::tests::new_test_composer;
use super::tests::type_chars_humanlike;
use crate::bottom_pane::promptlang::condition_highlights;
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

fn highlighted_text(buffer: &Buffer) -> String {
    buffer
        .content
        .iter()
        .filter(|cell| cell.fg == Color::Magenta)
        .map(Cell::symbol)
        .collect()
}

#[test]
fn condition_words_respect_case_boundaries_and_unicode() {
    let text = "México 🐋: IF(x), When ready; unless busy, ELSE Otherwise. iffy gift elsewhere if_ready if2 ifé if's";
    let words: Vec<_> = condition_highlights(text)
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
        assert_eq!(highlighted_text(&buffer), "Ifunless");
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
    assert_eq!(highlighted_text(&render(&composer, /*width*/ 40)), "if");
    type_chars_humanlike(&mut composer, &['f', 'y']);
    assert_eq!(highlighted_text(&render(&composer, /*width*/ 40)), "");
    for _ in 0..2 {
        let _ = composer.handle_key_event(KeyEvent::new(KeyCode::Backspace, KeyModifiers::NONE));
    }
    assert_eq!(highlighted_text(&render(&composer, /*width*/ 40)), "if");
    assert_eq!(composer.current_text(), "if");
}

#[test]
fn shell_mode_uses_native_shell_presentation() {
    let (mut composer, _rx) = new_test_composer();
    composer.set_text_content(
        "!if true; then echo when; fi".to_string(),
        Vec::new(),
        Vec::new(),
    );
    assert!(composer.draft.is_bash_mode);
    assert_eq!(highlighted_text(&render(&composer, /*width*/ 60)), "");
}

#[test]
fn submission_retains_the_exact_plain_prompt() {
    let text = "If ready, proceed. Otherwise wait unless asked.";
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
fn history_search_keeps_priority_over_conditions() {
    let (mut composer, _rx) = new_test_composer();
    composer
        .history
        .record_local_submission(HistoryEntry::new("if ready".to_string()));
    let _ = composer.handle_key_event(KeyEvent::new(KeyCode::Char('r'), KeyModifiers::CONTROL));
    for character in ['i', 'f'] {
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
        ("if ready".to_string(), vec![true, true])
    );
    let _ = composer.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));
    assert_eq!(highlighted_text(&render(&composer, /*width*/ 40)), "if");
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
