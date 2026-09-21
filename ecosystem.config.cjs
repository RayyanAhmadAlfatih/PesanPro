const embeddedWorkers = {
  MESSAGE_WORKER_MODE: "embedded",
  SCHEDULE_WORKER_MODE: "embedded",
  BROADCAST_WORKER_MODE: "embedded",
  CAMPAIGN_WORKER_MODE: "embedded",
  AUTOREPLY_WORKER_MODE: "embedded",
  WEBHOOK_WORKER_MODE: "embedded",
};

module.exports = {
  apps: [
    {
      name: "pesanpro",
      cwd: __dirname,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/server/index.ts",
      interpreter: "node",
      node_args: "--max-old-space-size=512",
      watch: false,
      autorestart: true,
      min_uptime: "60s",
      max_restarts: 3,
      restart_delay: 10000,
      max_memory_restart: "750M",
      kill_timeout: 30000,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        ...embeddedWorkers,
      },
      env_production: {
        NODE_ENV: "production",
        ...embeddedWorkers,
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
