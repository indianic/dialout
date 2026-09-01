export interface ChecklistItem {
    /** Display name, e.g. "Hyper". */
    label: string;
    /** Canonical token stored in config and matched at runtime. */
    token: string;
    /** Optional parenthetical, e.g. "not installed" / "this terminal". */
    hint?: string;
    checked: boolean;
}
export interface ChecklistState {
    items: ChecklistItem[];
    cursor: number;
}
export declare function clampCursor(len: number, cursor: number): number;
export declare function moveCursor(state: ChecklistState, delta: number): ChecklistState;
export declare function toggleAt(state: ChecklistState, index?: number): ChecklistState;
export declare function toggleAll(state: ChecklistState): ChecklistState;
export declare function selectedTokens(state: ChecklistState): string[];
export declare function renderChecklist(state: ChecklistState): string;
//# sourceMappingURL=checklist.d.ts.map