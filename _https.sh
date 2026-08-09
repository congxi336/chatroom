#!/bin/bash
# Restore and patch server.js for HTTPS
set -e

for dir in /root/chat /root/chat2; do
    cd $dir
    git checkout server.js 2>/dev/null
    
    # Add https require after http require
    sed -i 's|const http = require.*|const http = require("http");\nconst https = require("https");|' server.js
    
    # Replace server.listen block with HTTP + HTTPS version
    python3 << 'PYEOF'
import re
with open('server.js', 'r') as f:
    c = f.read()

old = r"""server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  匿名聊天室已启动`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  导入密钥文件: ${KEY_FILE}`);
  console.log(`========================================\n`);
});"""

new = """server.listen(PORT, () => console.log('HTTP on :' + PORT));

try {
  const httpsOptions = {
    key: require('fs').readFileSync('/etc/nginx/ssl/privkey.pem'),
    cert: require('fs').readFileSync('/etc/nginx/ssl/fullchain.pem'),
  };
  const httpsServer = https.createServer(httpsOptions, app);
  httpsServer.listen(443, () => console.log('HTTPS on :443'));
} catch(e) { console.log('HTTPS skip: ' + e.message); }"""

c = c.replace(old, new)
with open('server.js', 'w') as f:
    f.write(c)
print(dir + "/server.js patched")
PYEOF
done

# Restart
pkill -f "node server" 2>/dev/null
sleep 2
cd /root/chat  && PORT=3000 nohup node server.js > /tmp/c1.log 2>&1 &
cd /root/chat2 && PORT=3001 nohup node server.js > /tmp/c2.log 2>&1 &
sleep 4
cat /tmp/c1.log
ss -tlnp | grep -E ":443|:3000|:3001"
curl -sk -o /dev/null -w "HTTPS:%{http_code}\n" https://127.0.0.1:443/
echo "https://schoolthreemusketeers.cc.cd"
