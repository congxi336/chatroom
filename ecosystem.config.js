// PM2 ecosystem configuration for anonymous-chat
module.exports = {
  apps: [
    {
      name: 'chat-room-1',
      script: 'server.js',
      cwd: '/root/chat',
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '256M',
      restart_delay: 3000,
      max_restarts: 10,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/root/chat/logs/err.log',
      out_file: '/root/chat/logs/out.log',
    },
    {
      name: 'chat-room-2',
      script: 'server.js',
      cwd: '/root/chat2',
      env: {
        PORT: 3001,
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '256M',
      restart_delay: 3000,
      max_restarts: 10,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/root/chat2/logs/err.log',
      out_file: '/root/chat2/logs/out.log',
    },
  ],
};
