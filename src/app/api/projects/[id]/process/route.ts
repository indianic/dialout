import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { isMachineOnline, requestRunCommand } from '@/lib/daemon-status';
import { userOwnsMachine } from '@/lib/machine-access';

type Action = 'start' | 'stop' | 'restart';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const projectId = parseInt(id, 10);
    const body = await request.json().catch(() => ({}));
    const action = body.action as Action;
    if (!['start', 'stop', 'restart'].includes(action)) {
      return NextResponse.json({ error: 'invalid action' }, { status: 400 });
    }
    if (Number.isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Native clients are not bound to the JWT's current machine — they list
    // every owned machine — so ownership of the project's machine is the
    // check, not equality with session.machineId.
    const target = project.machineId;
    if (target == null || !(await userOwnsMachine(session.userId, target))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const stored = {
      start: project.startCommand || '',
      stop: project.stopCommand || '',
      restart: project.restartCommand || '',
    };

    // Resolve command(s) to run for this action.
    const provided = typeof body.command === 'string' ? body.command.trim() : '';
    const background = body.background ?? project.runInBackground ?? true;
    const cwd = project.rootPath || '';
    const logName = `project-${project.id}`;

    // restart with no explicit restart command but both start+stop present → stop then start
    if (action === 'restart' && !stored.restart && !provided && stored.start && stored.stop) {
      if (!(await isMachineOnline(target))) {
        return NextResponse.json({ error: 'Machine offline' }, { status: 502 });
      }
      const stopRes = await requestRunCommand(target, { command: stored.stop, cwd, background: false, logName });
      const startRes = await requestRunCommand(target, { command: stored.start, cwd, background, logName });
      if (startRes === null) return NextResponse.json({ error: 'Machine offline' }, { status: 502 });
      return NextResponse.json({ ...startRes, stopResult: stopRes });
    }

    const command = provided || stored[action];
    if (!command) {
      return NextResponse.json({ error: 'no-command', action }, { status: 409 });
    }

    // Optionally persist the provided command to the matching field.
    if (provided && body.save) {
      const col = action === 'start' ? { startCommand: provided } :
                  action === 'stop' ? { stopCommand: provided } :
                  { restartCommand: provided };
      await db.update(projects)
        .set({ ...col, ...(action === 'start' ? { runInBackground: background } : {}), updatedAt: new Date().toISOString() })
        .where(eq(projects.id, projectId));
    }

    if (!(await isMachineOnline(target))) {
      return NextResponse.json({ error: 'Machine offline' }, { status: 502 });
    }

    const result = await requestRunCommand(target, {
      command,
      cwd,
      background: action === 'start' ? background : false,
      logName,
    });
    if (result === null) return NextResponse.json({ error: 'Machine offline' }, { status: 502 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
