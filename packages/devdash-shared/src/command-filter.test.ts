import { describe, it, expect } from 'vitest';
import { commandQuery, rankCommands } from './command-filter';
import type { AiCommand } from './capabilities';

const cmd = (name: string, source: AiCommand['source'], description = ''): AiCommand =>
  ({ name, source, description });

describe('commandQuery', () => {
  it('opens on a lone slash', () => {
    expect(commandQuery('/')).toBe('');
  });

  it('returns the text after the slash', () => {
    expect(commandQuery('/comp')).toBe('comp');
  });

  // A slash mid-sentence is a path or a date, not a command.
  it('does not open for a slash that is not first', () => {
    expect(commandQuery('what about /tmp')).toBe(null);
    expect(commandQuery(' /leading-space')).toBe(null);
  });

  it('closes once the command is complete', () => {
    expect(commandQuery('/compact now')).toBe(null);
  });

  it('is closed for ordinary text and for empty input', () => {
    expect(commandQuery('')).toBe(null);
    expect(commandQuery('hello')).toBe(null);
  });
});

describe('rankCommands', () => {
  const all = [
    cmd('code-review:code-review', 'plugin', 'Review a PR'),
    cmd('compact', 'builtin', 'Compact conversation history'),
    cmd('commit-commands:clean_gone', 'plugin', 'Delete merged branches'),
    cmd('seo', 'user', 'SEO Machine'),
    cmd('deploy', 'project', 'Ship it'),
  ];

  it('puts a name prefix match above a name substring above a description match', () => {
    const names = rankCommands(all, 'co').map((c) => c.name);
    expect(names[0]).toBe('compact');            // prefix on the bare name
    expect(names).toContain('code-review:code-review');
    expect(names).not.toContain('seo');
  });

  // 52 of 81 commands are plugin-namespaced, so the prefix has to be searchable
  // or half the list is unreachable by typing.
  it('matches the plugin namespace as well as the command name', () => {
    const names = rankCommands(all, 'commit').map((c) => c.name);
    expect(names).toContain('commit-commands:clean_gone');
  });

  it('matches a word in the description', () => {
    const names = rankCommands(all, 'branches').map((c) => c.name);
    expect(names).toEqual(['commit-commands:clean_gone']);
  });

  // Plugins outnumber the user's own commands 52:29, so a purely alphabetical
  // sort buries the ones they wrote.
  it('breaks ties by source, user first and plugin last', () => {
    const tie = [cmd('zzz', 'plugin'), cmd('zzz2', 'user'), cmd('zzz3', 'project')];
    expect(rankCommands(tie, 'zzz').map((c) => c.source)).toEqual(['user', 'project', 'plugin']);
  });

  it('an empty query returns everything, still ranked by source', () => {
    expect(rankCommands(all, '')).toHaveLength(5);
    expect(rankCommands(all, '')[0].source).toBe('user');
  });

  it('is case insensitive', () => {
    expect(rankCommands(all, 'SEO').map((c) => c.name)).toEqual(['seo']);
  });
});
