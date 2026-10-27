'use strict';

const crypto = require('node:crypto');
const role = 'editor';
if (process.argv[2] && process.argv[2] !== role) {
  console.error('Uso: node tools/access/generate-token.js');
  process.exit(1);
}
console.log(`EDITOR_ACCESS_TOKEN=${crypto.randomBytes(32).toString('base64url')}`);
