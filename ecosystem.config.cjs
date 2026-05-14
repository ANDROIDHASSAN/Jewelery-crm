// PM2 ecosystem — Day 38 deploy artifact.
// Two apps share one codebase. Web serves /api/* + client/dist. Worker runs BullMQ + crons.

module.exports = {
  apps: [
    {
      name: 'goldos-web',
      cwd: './server',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      max_memory_restart: '512M',
      kill_timeout: 5000,
    },
    {
      name: 'goldos-worker',
      cwd: './server',
      script: 'dist/workers/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '256M',
    },
  ],
};
