import type { AiCommand, CommandSource } from './capabilities';

// The menu opens only when the slash starts the message. A slash anywhere else
// is a path, a date, or a fraction — not a command.
export function commandQuery(text: string): string | null {
  if (!text.startsWith('/')) return null;
  const rest = text.slice(1);
  // A space means the command has been chosen and arguments are being typed.
  if (/\s/.test(rest)) return null;
  return rest;
}

// User commands are the ones they wrote; plugins outnumber them 52 to 29 on a
// real install, so source is the tie-breaker or the list buries them.
const SOURCE_RANK: Record<CommandSource, number> = {
  user: 0, project: 1, builtin: 2, plugin: 3,
};

// Lower is better.
function score(c: AiCommand, q: string): number {
  const name = c.name.toLowerCase();
  const bare = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
  const desc = c.description.toLowerCase();

  if (!q) return 40;
  if (bare.startsWith(q)) return 0;
  if (name.startsWith(q)) return 10;   // the plugin prefix
  if (bare.includes(q)) return 20;
  if (name.includes(q)) return 25;
  if (desc.includes(q)) return 30;
  return Infinity;                     // no match at all
}

export function rankCommands(commands: AiCommand[], query: string): AiCommand[] {
  const q = query.trim().toLowerCase();

  return commands
    .map((c) => ({ c, s: score(c, q) }))
    .filter((x) => x.s !== Infinity)
    .sort((a, b) =>
      a.s - b.s
      || SOURCE_RANK[a.c.source] - SOURCE_RANK[b.c.source]
      || a.c.name.localeCompare(b.c.name))
    .map((x) => x.c);
}
