"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adapterFor = adapterFor;
const claude_1 = require("./claude");
const codex_1 = require("./codex");
const grok_1 = require("./grok");
const ADAPTERS = {
    claude: claude_1.claudeAdapter,
    codex: codex_1.codexAdapter,
    grok: grok_1.grokAdapter,
};
function adapterFor(kind) {
    return ADAPTERS[kind];
}
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map