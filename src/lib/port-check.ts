import net from 'net';

export function checkPort(port: number, host = '127.0.0.1', timeout = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const done = (result: boolean) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(timeout);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));

    try {
      socket.connect(port, host);
    } catch {
      done(false);
    }
  });
}
