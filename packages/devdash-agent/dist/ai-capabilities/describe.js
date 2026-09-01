"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeCommand = describeCommand;
const MAX = 160;
function clamp(s) {
    const t = s.trim().replace(/\s+/g, ' ');
    return t.length <= MAX ? t : `${t.slice(0, MAX - 1)}…`;
}
// Frontmatter is NOT reliable in real command files — ~/.claude/commands/seo.md
// opens with a bare `# SEO Machine`. So this falls all the way through to the
// first non-empty line rather than returning nothing.
function describeCommand(markdown) {
    const text = String(markdown || '');
    // Closed frontmatter only: an unterminated block is body text, not metadata.
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (fm) {
        const d = fm[1].match(/^description:\s*(.+)$/m);
        if (d)
            return clamp(d[1].replace(/^["']|["']$/g, ''));
    }
    const body = fm ? text.slice(fm[0].length) : text;
    const heading = body.match(/^#{1,6}\s+(.+)$/m);
    if (heading)
        return clamp(heading[1]);
    for (const line of body.split('\n')) {
        if (line.trim())
            return clamp(line);
    }
    return '';
}
//# sourceMappingURL=describe.js.map