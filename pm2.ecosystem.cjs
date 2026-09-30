// pm2 ecosystem file for CardinalMap
module.exports = {
  apps: [
    {
      name: 'cardinalmap',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', PORT: 3000 },
      max_memory_restart: '512M',
      error_file: '~/.pm2/logs/cardinalmap-error.log',
      out_file: '~/.pm2/logs/cardinalmap-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
