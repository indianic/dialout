// Vendors we know today. A client that switches exhaustively on this will
// break the week a fourth is added — treat an unknown kind as generic at
// runtime (string on the wire, this union at compile time for the ones we
// have adapters for).
export type AiKind = 'claude' | 'codex' | 'grok';
