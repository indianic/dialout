import * as net from 'net';

const TIMEOUT_MS = 800;

export function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(TIMEOUT_MS);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, '127.0.0.1');
  });
}

export async function scanPorts(ports: number[]): Promise<number[]> {
  const results = await Promise.all(
    ports.map(async (port) => ({ port, open: await checkPort(port) }))
  );
  return results.filter((r) => r.open).map((r) => r.port);
}

export async function scanRange(from: number, to: number): Promise<number[]> {
  const batchSize = 50;
  const openPorts: number[] = [];

  for (let start = from; start <= to; start += batchSize) {
    const end = Math.min(start + batchSize - 1, to);
    const ports = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const open = await scanPorts(ports);
    openPorts.push(...open);
  }

  return openPorts;
}
