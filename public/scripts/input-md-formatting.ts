import { power_user } from './power-user.js';

// Pre-allocate the event to prevent garbage collection (GC) thrashing
// if multiple events fire in rapid succession.
const INPUT_EVENT = new Event('input', { bubbles: true });

// Helper for fast V8 character code checking (avoids string allocation)
// Checks for Space (32), Tab (9), Newline (10), Carriage Return (13)
function isWhitespace(charCode: number): boolean {
  return charCode === 32 || charCode === 10 || charCode === 13 || charCode === 9;
}

/**
 * Initializes markdown hotkeys for textareas.
 */
export function initInputMarkdown() {
  document.addEventListener('keydown', function(e: KeyboardEvent) {
    // FAST BAILOUTS: Check non-DOM state first
    if (!power_user.enable_md_hotkeys) return;

    // V8 Branch Prediction: Fail fast on invalid modifier combinations
    if (!e.ctrlKey || e.altKey || e.metaKey) return;

    // Check tagName and classList directly.
    // `closest()` is expensive; textareas don't have nested child elements.
    const target = e.target as HTMLElement;
    if (target.nodeName !== 'TEXTAREA' || !target.classList.contains('mdHotkeys')) return;

    let charsToAdd = '';
    let margin = 1;

    // JUMP TABLE SWITCH.
    switch (e.code) {
      case 'Backquote':
        if (!e.shiftKey) return;
        charsToAdd = '~~';
        margin = 2;
        break;
      case 'KeyB':
        if (e.shiftKey) return;
        charsToAdd = '**';
        margin = 2;
        break;
      case 'KeyI':
        if (e.shiftKey) return;
        charsToAdd = '*';
        break;
      case 'KeyU':
        if (e.shiftKey) return;
        charsToAdd = '__';
        margin = 2;
        break;
      case 'KeyK':
        if (e.shiftKey) return;
        charsToAdd = '`';
        break;
      default:
        return; // Early return if no key matches
    }

    e.preventDefault();
    e.stopPropagation();

    const textarea = target as HTMLTextAreaElement;

    // Reading DOM properties is slow in V8.
    // Cache the string in local memory once.
    const text = textarea.value;
    const textLen = text.length;
    const start = textarea.selectionStart;
    let end = textarea.selectionEnd;
    const charsLen = charsToAdd.length;

    const isTextSelected = start !== end;
    let cursorShift = charsLen;
    let selectedText = '';

    if (isTextSelected) {
      selectedText = text.substring(start, end);

      // Fast bounds checking for formatting
      const expStart = Math.max(0, start - margin);
      const expEnd = Math.min(textLen, end + margin);
      const expandedText = text.substring(expStart, expEnd).trim();

      if (expandedText === charsToAdd + selectedText + charsToAdd) {
        // Formatting exists, remove it
        const actualExpStart = Math.max(0, start - charsLen);
        const actualExpEnd = Math.min(textLen, end + charsLen);

        textarea.setSelectionRange(actualExpStart, actualExpEnd);
        document.execCommand('insertText', false, selectedText);
        cursorShift = -charsLen;
      } else {
        // Add formatting
        let space = '';
        // Use charCodeAt for trailing space check (faster than endsWith string allocation)
        if (selectedText.charCodeAt(selectedText.length - 1) === 32) {
          space = ' ';
          selectedText = selectedText.slice(0, -1);
          end--;
        }

        textarea.focus();
        document.execCommand('insertText', false, charsToAdd + selectedText + charsToAdd + space);
      }
    } else {
      // No text selected
      // charCodeAt
      const charBefore = start > 0 ? text.charCodeAt(start - 1) : 32;
      const charAfter = start < textLen ? text.charCodeAt(start) : 32;

      if (!isWhitespace(charBefore) && !isWhitespace(charAfter)) {
        // Caret is inside a word
        let wordStart = start;
        let wordEnd = start;

        // Tight V8 loop using integer comparison (charCodeAt)
        while (wordStart > 0 && !isWhitespace(text.charCodeAt(wordStart - 1))) {
          wordStart--;
        }
        while (wordEnd < textLen && !isWhitespace(text.charCodeAt(wordEnd))) {
          wordEnd++;
        }

        textarea.setSelectionRange(wordStart, wordEnd);
        const word = text.substring(wordStart, wordEnd).trim();

        // Fast check if formatting surrounds the word
        if (
          word.length >= charsLen * 2 &&
          word.startsWith(charsToAdd) &&
          word.endsWith(charsToAdd)
        ) {
          const unformattedWord = word.substring(charsLen, word.length - charsLen);
          textarea.focus();
          document.execCommand('insertText', false, unformattedWord);
          cursorShift = -charsLen;
        } else {
          textarea.focus();
          document.execCommand('insertText', false, charsToAdd + word + charsToAdd);
        }
      } else {
        // Caret is not inside a word
        textarea.focus();
        document.execCommand('insertText', false, charsToAdd + charsToAdd);
      }
    }

    // REUSE EVENT OBJECT
    textarea.dispatchEvent(INPUT_EVENT);

    // Set cursor position
    textarea.selectionStart = start + cursorShift;
    textarea.selectionEnd = (isTextSelected ? start + selectedText.length : start) + cursorShift;
  });
}
