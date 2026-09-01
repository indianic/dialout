// Local default: port 50051, name "devdash-local".
// Production deploys override APP_NAME via GitLab CI/CD variables —
// see .gitlab-ci.yml. Port stays 50051 in both environments.
const PORT = process.env.PORT || 50051;
const WS_PORT = process.env.WS_PORT || 50052;
const APP_NAME = process.env.APP_NAME || 'devdash-local';

module.exports = {
  apps: [
    {
      name: APP_NAME,
      script: 'node_modules/.bin/next',
      args: `start -p ${PORT}`,
      cwd: __dirname,
      // `next start` runs in fork mode: it does NOT emit PM2's `ready` IPC
      // event, so `wait_ready: true` made PM2 time out after listen_timeout
      // and kill a perfectly healthy server, crash-looping it (status:errored).
      // Fork mode + no wait_ready lets PM2 track the real process lifecycle.
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
    {
      name: `${APP_NAME}-ws`,
      script: 'node_modules/.bin/tsx',
      args: 'src/ws-server/index.ts',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        WS_PORT: String(WS_PORT),
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
    },
  ],
};
