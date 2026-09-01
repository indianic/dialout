const { execSync } = require('child_process');

const PORT = process.env.PORT || 50051;

try {
  const pid = execSync(`lsof -ti:${PORT}`, { encoding: 'utf-8' }).trim();
  if (pid) {
    const pids = pid.split('\n').filter(Boolean);
    pids.forEach((p) => {
      try {
        execSync(`kill -9 ${p}`);
        console.log(`Killed process ${p} on port ${PORT}`);
      } catch {
        // Process may have already exited
      }
    });
    console.log(`Port ${PORT} cleared`);
  }
} catch {
  console.log(`Port ${PORT} is free`);
}
