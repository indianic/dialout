import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, projectMachines } from '@/lib/schema';
import { eq, and, or } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

// POST /api/copy — copy a project to another machine (link, not duplicate)
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { projectId, targetMachineId, port, rootPath } = await request.json();
    if (!projectId || !targetMachineId) {
      return NextResponse.json({ error: 'projectId and targetMachineId required' }, { status: 400 });
    }

    // Verify the project belongs to this user
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project || project.userId !== session.userId) {
      return NextResponse.json({ error: 'Project not found or not yours' }, { status: 403 });
    }

    // Check if already mapped to this machine
    const existing = await db.select().from(projectMachines)
      .where(and(eq(projectMachines.projectId, projectId), eq(projectMachines.machineId, targetMachineId)));
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Project already on this machine' }, { status: 409 });
    }

    // Check port conflict on target machine
    const targetPort = port || project.port;
    if (targetPort) {
      // Check owned projects on target machine
      const ownedConflict = await db.select().from(projects)
        .where(and(eq(projects.machineId, targetMachineId), eq(projects.port, targetPort)));

      // Check mapped projects on target machine
      const mappedConflict = await db.select().from(projectMachines)
        .where(and(eq(projectMachines.machineId, targetMachineId), eq(projectMachines.port, targetPort)));

      if (ownedConflict.length > 0 || mappedConflict.length > 0) {
        return NextResponse.json({
          error: `Port ${targetPort} is already in use on this machine. Choose a different port.`,
          conflictPort: targetPort,
        }, { status: 409 });
      }
    }

    // Create the mapping
    const [mapping] = await db.insert(projectMachines).values({
      projectId,
      machineId: targetMachineId,
      port: targetPort,
      addonPorts: project.addonPorts || '',
      rootPath: rootPath || project.rootPath || '',
    }).returning();

    return NextResponse.json(mapping, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
