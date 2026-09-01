import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, projectMachines, machines } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { requestProjectScan } from '@/lib/daemon-status';

const norm = (p: string | null | undefined) => (p || '').replace(/\/+$/, '');

// POST — scan a folder on a machine for projects, annotate against existing
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { machineId, path, depth } = await request.json();
  const targetMachine = machineId || session.machineId;
  if (targetMachine !== session.machineId) {
    // Only allow scanning machines the session user owns
    const [m] = await db.select().from(machines).where(eq(machines.id, targetMachine));
    if (!m || m.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  if (!path || typeof path !== 'string') {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }
  const boundedDepth = Math.min(Math.max(parseInt(depth, 10) || 2, 0), 3);

  const result = await requestProjectScan(targetMachine, path, boundedDepth);
  if (!result) return NextResponse.json({ error: 'Machine offline' }, { status: 503 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  // Existing projects on this machine: directly owned + mapped copies
  const owned = await db.select().from(projects).where(eq(projects.machineId, targetMachine));
  const mappings = await db.select().from(projectMachines)
    .where(eq(projectMachines.machineId, targetMachine));
  const mapped = (await Promise.all(
    mappings.map(async (m) => {
      const [p] = await db.select().from(projects).where(eq(projects.id, m.projectId));
      if (!p) return null;
      return { id: p.id, name: p.name, rootPath: m.rootPath || p.rootPath, port: m.port ?? p.port };
    })
  )).filter((x): x is NonNullable<typeof x> => x !== null);

  const existing = [
    ...owned.map((p) => ({ id: p.id, name: p.name, rootPath: p.rootPath, port: p.port })),
    ...mapped,
  ];
  const byPath = new Map(
    existing.filter((e) => e.rootPath).map((e) => [norm(e.rootPath), e])
  );
  const byPort = new Map(
    existing.filter((e) => e.port).map((e) => [e.port as number, e])
  );

  const annotated = result.projects.map((d: any) => {
    const pathMatch = byPath.get(norm(d.path));
    const portMatch = d.port != null ? byPort.get(d.port) : undefined;
    return {
      ...d,
      existing: !!pathMatch,
      existingProjectId: pathMatch?.id,
      existingName: pathMatch?.name,
      portConflict: !pathMatch && !!portMatch,
      portConflictWith: !pathMatch && portMatch ? portMatch.name : undefined,
    };
  });

  return NextResponse.json({ path, count: annotated.length, projects: annotated });
}
