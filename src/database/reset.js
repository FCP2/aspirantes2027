require('dotenv').config();
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(process.env.DATABASE_PATH || './data/municipal.sqlite');
for (const suffix of ['', '-wal', '-shm']) {
  const p = dbPath + suffix;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
require('./init');
