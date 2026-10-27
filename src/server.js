require('dotenv').config();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

// El servicio de Render permanece cerrado a la captura mientras se termina
// la migración. Así se monta el disco sin crear una SQLite vacía en producción.
if (process.env.RENDER === 'true' && process.env.MUNICIPAL_APP_READY !== 'true') {
  const http = require('node:http');

  http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('maintenance');
      return;
    }

    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Sistema en mantenimiento por migración.');
  }).listen(PORT, HOST, () => {
    console.log(`Servicio de mantenimiento iniciado en ${HOST}:${PORT}`);
  });
} else {
  const app = require('./app');

  app.listen(PORT, HOST, () => {
    console.log(`Sistema iniciado en http://${HOST}:${PORT}`);
  });
}
