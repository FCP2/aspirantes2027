require('dotenv').config();
if (process.env.RENDER === 'true' || process.env.MUNICIPAL_DB_ENGINE === 'postgres') {
  throw new Error('db:reset está prohibido en PostgreSQL y en Render.');
}
if (process.env.CONFIRM_RESET_LOCAL !== 'BORRAR_DATOS_LOCALES') {
  throw new Error('db:reset requiere CONFIRM_RESET_LOCAL=BORRAR_DATOS_LOCALES. No se borró ningún dato.');
}
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(process.env.DATABASE_PATH || './data/municipal.sqlite');
for (const suffix of ['', '-wal', '-shm']) {
  const p = dbPath + suffix;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
require('./init');
