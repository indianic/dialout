"use strict";
// Pure state + rendering for the interactive terminal-app multi-select used by
// `setup-cowork`. All functions are immutable (return new state) so the
// raw-mode driver in cli.ts stays a thin keypress→state→redraw loop.
Object.defineProperty(exports, "__esModule", { value: true });
exports.clampCursor = clampCursor;
exports.moveCursor = moveCursor;
exports.toggleAt = toggleAt;
exports.toggleAll = toggleAll;
exports.selectedTokens = selectedTokens;
exports.renderChecklist = renderChecklist;
function clampCursor(len, cursor) {
    if (len <= 0)
        return 0;
    if (cursor < 0)
        return 0;
    if (cursor > len - 1)
        return len - 1;
    return cursor;
}
function moveCursor(state, delta) {
    return { ...state, cursor: clampCursor(state.items.length, state.cursor + delta) };
}
function toggleAt(state, index) {
    const i = index ?? state.cursor;
    if (i < 0 || i >= state.items.length)
        return state;
    const items = state.items.map((it, idx) => (idx === i ? { ...it, checked: !it.checked } : it));
    return { ...state, items };
}
function toggleAll(state) {
    const allChecked = state.items.length > 0 && state.items.every((it) => it.checked);
    const items = state.items.map((it) => ({ ...it, checked: !allChecked }));
    return { ...state, items };
}
function selectedTokens(state) {
    return state.items.filter((it) => it.checked).map((it) => it.token);
}
// One line per item: '› ' marks the cursor row (two spaces otherwise), then
// '[x]'/'[ ]', the label, and an optional '(hint)'.
function renderChecklist(state) {
    return state.items
        .map((it, i) => {
        const pointer = i === state.cursor ? '›' : ' ';
        const box = it.checked ? '[x]' : '[ ]';
        const hint = it.hint ? `  (${it.hint})` : '';
        return `${pointer} ${box} ${it.label}${hint}`;
    })
        .join('\n');
}
//# sourceMappingURL=checklist.js.map