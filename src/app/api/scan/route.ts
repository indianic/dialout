import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scanHistory, projects, projectMachines, systemServices } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { userOwnsMachine } from '@/lib/machine-access';
import { isMachineOnline, requestPortScan } from '@/lib/daemon-status';

function parseAddonPorts(s: string): number[] {
  return (s || '').split(',').map((x) => parseInt(x.trim())).filter((n) => !isNaN(n) && n > 0);
}

export async function POST(request: Request) {
  try {
    // This was `session?.machineId` with no null guard, so an unauthenticated
    // caller who supplied a machineId got a full port scan of that machine.
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { from = 3000, to = 9999, machineId } = await request.json();
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const rangeSize = end - start + 1;

    // Determine target machine, and prove the caller owns it.
    const targetMachine = machineId || session.machineId;
    if (targetMachine !== session.machineId && !(await userOwnsMachine(session.userId, targetMachine))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Excluded ports are scoped to the target machine. Reading every project
    // and service globally meant the exclusion list silently encoded which
    // ports other users had registered.
    const machineProjects = await db.select().from(projects)
      .where(eq(projects.machineId, targetMachine));
    const machineMappings = await db.select().from(projectMachines)
      .where(eq(projectMachines.machineId, targetMachine));
    const machineServices = await db.select().from(systemServices)
      .where(eq(systemServices.machineId, targetMachine));

    const excludedPorts = new Set<number>();
    machineProjects.forEach((p) => {
      if (p.port) excludedPorts.add(p.port);
      parseAddonPorts(p.addonPorts || '').forEach((n) => excludedPorts.add(n));
    });
    machineMappings.forEach((m) => {
      if (m.port) excludedPorts.add(m.port);
      parseAddonPorts(m.addonPorts || '').forEach((n) => excludedPorts.add(n));
    });
    machineServices.forEach((s) => excludedPorts.add(s.port));

    const machineOnline = targetMachine ? await isMachineOnline(targetMachine) : false;

    let results: number[] = [];

    if (!machineOnline || !targetMachine) {
      return NextResponse.json(
        { error: 'daemon_offline', message: 'No daemon connected. Install the DevDash agent on your machine to scan ports remotely.' },
        { status: 503 }
      );
    }

    // Route scan through daemon
    const scanResult = await requestPortScan(targetMachine, { from: start, to: end });
    if (scanResult) {
      results = scanResult.openPorts.filter((p) => !excludedPorts.has(p));
    }

    results.sort((a, b) => a - b);

    await db.insert(scanHistory).values({
      fromPort: start,
      toPort: start + rangeSize - 1,
      found: JSON.stringify(results),
    });

    return NextResponse.json({ ports: results, scanned: rangeSize });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
