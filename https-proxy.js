const https = require('https');
const http = require('http');
const fs = require('fs');

const HTTPS_PORT = 443;
const HTTP_PORT = 3000;

const options = {
  key: fs.readFileSync('/etc/nginx/ssl/privkey.pem'),
  cert: fs.readFileSync('/etc/nginx/ssl/fullchain.pem'),
};

// Create HTTPS server that proxies to local HTTP
const server = https.createServer(options, (req, res) => {
  const proxy = http.request({
    hostname: '127.0.0.1',
    port: HTTP_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  }, (pres) => {
    res.writeHead(pres.statusCode, pres.headers);
    pres.pipe(res);
  });
  req.pipe(proxy);
  proxy.on('error', () => res.end());
});

// WebSocket upgrade proxy for Socket.io
server.on('upgrade', (req, socket, head) => {
  const proxy = http.request({
    hostname: '127.0.0.1',
    port: HTTP_PORT,
    path: req.url,
    method: 'GET',
    headers: req.headers,
  });
  proxy.on('upgrade', (pres, psocket, phead) => {
    psocket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      Object.entries(pres.headers).map(([k, v]) => k + ': ' + v).join('\r\n') +
      '\r\n\r\n'
    );
    psocket.pipe(socket).pipe(psocket);
  });
  proxy.end();
});

server.listen(HTTPS_PORT, () => {
  console.log('HTTPS proxy: 443 -> 3000');
});
