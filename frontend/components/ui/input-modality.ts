/**
 * How the reader last used the page: a key or a pointer. Browsers decide
 * `:focus-visible` by heuristic, and when a window or tab regains focus they
 * fire `focus` again on the element that had it, so a button that was only
 * clicked repaints its ring and a tooltip that opens on focus opens by itself
 * (leftover paint on returning to the tab). Tracking the reader's real input
 * fixes both once, for every surface:
 *
 *  - `<html data-input-modality="pointer">` after a press; the focus-ring
 *    rules in globals.css draw no ring under it. Only focus that arrives while
 *    a key is down brings the ring back: a key that moves no focus (Shift,
 *    Page Down) changes nothing, and neither does a script focus (`<main>`
 *    after navigation) or Escape returning focus to its trigger, which keep
 *    the modality the reader was already in.
 *  - `focusFromKeyboard()` is true only when the last input was a key and the
 *    window has not lost focus since, so a Tooltip opens on focus for a
 *    keyboard reader's Tab and never for a restored focus.
 *
 * A shortcut (Ctrl, Alt or Meta held, as when switching tabs) is not keyboard
 * navigation and changes nothing.
 *
 * A text field the reader did not Tab into is `data-quiet-focus` until it
 * blurs and draws no ring (globals.css): a field an overlay or an Edit action
 * focuses on open, and a press into a dialog's field, show the caret only.
 */
type InputModality = 'keyboard' | 'pointer';

let modality: InputModality | null = null;
/** True from a navigating key's press to its release: a focus now came from it. */
let keyDown = false;
/** True from a Tab's press to its release: the one key that moves focus into a field. */
let tabDown = false;
/** True from a press to its release: a field focused now was pressed into. */
let pressed = false;
/** True from the window losing focus until the reader's next key or press. */
let away = false;
let installed = false;

function set(next: InputModality) {
  modality = next;
  away = false;
  document.documentElement.dataset.inputModality = next;
}

const TEXT_FIELD =
  'input:not([type=button], [type=checkbox], [type=radio], [type=range], [type=reset], [type=submit]), textarea, select, [contenteditable]:not([contenteditable=false])';
const OVERLAY = 'dialog, [role=dialog], [role=alertdialog], [role=menu]';

function textField(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement && target.matches(TEXT_FIELD) ? target : null;
}

function onKeyDown(event: KeyboardEvent) {
  keyDown = !(event.ctrlKey || event.altKey || event.metaKey || event.key === 'Escape');
  tabDown = keyDown && event.key === 'Tab';
  // A trap with one stop (the palette's field) keeps focus where it is: Tab still rings it.
  if (tabDown) delete textField(document.activeElement)?.dataset.quietFocus;
}

function onKeyUp() {
  keyDown = false;
  tabDown = false;
}

function onFocusIn(event: FocusEvent) {
  if (keyDown) set('keyboard');
  const field = textField(event.target);
  if (!field) return;
  if (!tabDown && (!pressed || field.closest(OVERLAY))) field.dataset.quietFocus = '';
  else delete field.dataset.quietFocus;
}

function onFocusOut(event: FocusEvent) {
  const field = textField(event.target);
  if (field) delete field.dataset.quietFocus;
}

function onPointerDown(event: PointerEvent) {
  keyDown = false;
  tabDown = false;
  pressed = true;
  set('pointer');
  // A press into a dialog's field that already has focus moves no focus.
  const field = textField(event.target);
  if (field && field === document.activeElement && field.closest(OVERLAY)) {
    field.dataset.quietFocus = '';
  }
}

function onPointerUp() {
  pressed = false;
}

// An element's blur does not bubble, so a listener on the window (not in the
// capture phase) hears only the window itself losing focus.
function onWindowBlur() {
  away = true;
  keyDown = false;
  tabDown = false;
  pressed = false;
}

/** Starts tracking once, when this module first loads. */
function trackInputModality() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // Capture, so a handler that stops propagation cannot hide an input, and the
  // modality is current before React's own focus handlers (a Tooltip's) read it.
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);
  window.addEventListener('blur', onWindowBlur);
}

/** Whether a focus arriving now came from the keyboard, not a press or a restored window. */
export function focusFromKeyboard(): boolean {
  return modality === 'keyboard' && !away;
}

trackInputModality();
