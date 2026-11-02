module.exports = {
  apps: [
    {
      name: 'lunao-backend',
      script: './node_modules/.bin/tsx',
      args: 'server.ts',
      cwd: '/var/www/lunao',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=1536',
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/www/lunao/logs/error.log',
      out_file: '/var/www/lunao/logs/app.log',
      merge_logs: true,
      max_memory_restart: '1500M',
    },
  ],
};
