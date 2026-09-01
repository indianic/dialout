import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, projectMachines, projectNotes, projectTodos } from '@/lib/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { checkPort } from '@/lib/port-check';
import { getSession, isEnrolled } from '@/lib/auth';
import { isMachineOnline, requestPortCheck, requestUrlCheck } from '@/lib/daemon-status';
import { listOwnedMachines, userOwnsMachine } from '@/lib/machine-access';
import { parseMachineScope } from '@/lib/machine-scope';

function parseAddonPorts(s: string): number[] {
  return (s || '').split(',').map((x) => parseInt(x.trim())).filter((n) => !isNaN(n) && n > 0);
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!(await isEnrolled(session.userId))) return NextResponse.json({ error: 'Two-factor setup required' }, { status: 403 });

    const scope = parseMachineScope(new URL(request.url).searchParams.get('machineId'), session.machineId);
    if (scope === 'all') {
      const owned = await listOwnedMachines(session.userId);
      const names = new Map(owned.map((m) => [m.id, m.name]));
      const rows = await db.select().from(projects)
        .where(eq(projects.userId, session.userId))
        .orderBy(asc(projects.name));
      return NextResponse.json(rows.map((p) => ({
        ...p,
        machineName: names.get(p.machineId || 0) || '',
      })));
    }

    // Get directly owned projects on this machine
    const ownedProjects = await db.select().from(projects)
      .where(eq(projects.machineId, session.machineId))
      .orderBy(asc(projects.name));

    // Get mapped projects (copied to this machine)
    const mappings = await db.select().from(projectMachines)
      .where(eq(projectMachines.machineId, session.machineId));

    const mappedProjects = await Promise.all(
      mappings.map(async (m) => {
        const [p] = await db.select().from(projects).where(eq(projects.id, m.projectId));
        if (!p) return null;
        // Override machineId, port, addonPorts, rootPath with machine-specific values
        return {
          ...p,
          machineId: session.machineId,
          port: m.port ?? p.port,
          addonPorts: m.addonPorts || p.addonPorts,
          rootPath: m.rootPath || p.rootPath,
          _mapped: true,
        };
      })
    );

    // Combine, dedup by id
    const ownedIds = new Set(ownedProjects.map((p) => p.id));
    const allProjects = [
      ...ownedProjects,
      ...mappedProjects.filter((p): p is NonNullable<typeof p> => p !== null && !ownedIds.has(p.id)),
    ];

    // Live-check ports — use daemon relay if machine is online, else local TCP
    const machineOnline = await isMachineOnline(session.machineId);

    const withStatus = await Promise.all(
      allProjects.map(async (p) => {
        let isRunning = false;
        const allPorts = [p.port, ...parseAddonPorts(p.addonPorts || '')].filter(Boolean) as number[];

        if (allPorts.length > 0) {
          if (machineOnline) {
            const result = await requestPortCheck(session.machineId, allPorts);
            if (result) {
              isRunning = p.port ? result.openPorts.includes(p.port) : result.openPorts.length > 0;
            }
          } else {
            const checks = await Promise.all(allPorts.map((port) => checkPort(port)));
            isRunning = p.port ? checks[0] : checks.some(Boolean);
          }
        } else if (!p.port && p.url && machineOnline) {
          // Static site — check if local webserver responds via daemon
          isRunning = await requestUrlCheck(session.machineId, p.url);
        }

        await db
          .update(projects)
          .set({ isRunning, lastChecked: new Date().toISOString() })
          .where(eq(projects.id, p.id));

        return { ...p, isRunning };
      })
    );

    withStatus.sort((a, b) => {
      if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    return NextResponse.json(withStatus);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { name, port, addonPorts, url, techStack, description, startDate, runner, status, tags, notes, rootPath, startCommand, stopCommand, restartCommand, runInBackground, machineId } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const target = parseInt(String(machineId || ''), 10) || session.machineId;
    if (!(await userOwnsMachine(session.userId, target))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const autoUrl = url || (port ? `http://localhost:${port}` : '');

    const [created] = await db
      .insert(projects)
      .values({
        userId: session.userId,
        machineId: target,
        name,
        port: port || null,
        addonPorts: addonPorts || '',
        url: autoUrl,
        techStack: techStack || '',
        description: description || '',
        startDate: startDate || new Date().toISOString().split('T')[0],
        runner: runner || 'npm',
        status: status || 'active',
        tags: tags || '',
        notes: notes || '',
        rootPath: rootPath || '',
        startCommand: startCommand || '',
        stopCommand: stopCommand || '',
        restartCommand: restartCommand || '',
        runInBackground: runInBackground ?? true,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const ids: number[] = Array.isArray(body?.ids)
      ? body.ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array of integers' }, { status: 400 });
    }

    // Only delete projects owned by the current machine.
    const owned = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.machineId, session.machineId), inArray(projects.id, ids)));
    const ownedIds = owned.map((p) => p.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    await db.delete(projectNotes).where(inArray(projectNotes.projectId, ownedIds));
    await db.delete(projectTodos).where(inArray(projectTodos.projectId, ownedIds));
    await db.delete(projects).where(inArray(projects.id, ownedIds));

    return NextResponse.json({ success: true, deleted: ownedIds.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
