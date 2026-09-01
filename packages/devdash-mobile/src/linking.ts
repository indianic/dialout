// Deep links. Push payloads use `/ai/{machineId}/{tmuxName}` (the web path);
// the app's route is `/session/...`. Custom-scheme URLs come in as
// `devdash://session/1/foo` (host = first segment) or `devdash:///session/1/foo`.

export function hrefFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const segs = [u.hostname, ...u.pathname.split('/')].filter(Boolean);
    return hrefFromSegments(segs);
  } catch {
    return null;
  }
}

export function hrefFromSegments(segs: string[]): string | null {
  const iAi = segs.findIndex((s) => s === 'ai' || s === 'session');
  if (iAi >= 0 && segs[iAi + 1] && segs[iAi + 2]) {
    return `/session/${segs[iAi + 1]}/${encodeURIComponent(decodeURIComponent(segs[iAi + 2]))}`;
  }
  const iProj = segs.indexOf('project');
  if (iProj >= 0 && segs[iProj + 1]) return `/project/${segs[iProj + 1]}`;
  const iTerm = segs.indexOf('terminal');
  if (iTerm >= 0 && segs[iTerm + 1]) {
    const rest = segs.slice(iTerm + 1).join('/');
    return `/terminal/${rest}`;
  }
  return null;
}
