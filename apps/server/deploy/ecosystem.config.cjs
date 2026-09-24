// 放在每个 release 根目录；共享密钥文件只由 Node 的 --env-file 加载。
const path = require('node:path');
const fs = require('node:fs');
const release = fs.realpathSync(__dirname);
const root = path.resolve(release, '../..');
module.exports = {
  apps: [{
    name: 'markflow',
    cwd: path.join(release, 'server'),
    script: path.join(release, 'server/dist/main.js'),
    interpreter: 'node',
    node_args: ['--env-file=' + path.join(root, 'shared/server.env')],
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    restart_delay: 3000,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 15000,
    max_memory_restart: '700M',
    time: true,
    env: { NODE_ENV: 'production', MARKFLOW_RELEASE_ID: path.basename(release) },
  }],
};
