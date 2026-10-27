'use strict';

const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const router = require('express').Router();
const controller = require('../controllers/revision-fuentes.controller');
const revision = require('../../tools/revision-fuentes');
const access = require('../middleware/access-control');

fs.mkdirSync(revision.inputDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, revision.inputDir),
  filename: (_req, file, callback) => {
    const base = path.basename(file.originalname, path.extname(file.originalname))
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'fuente';
    callback(null, `${Date.now()}-${base}.html`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const validExtension = /\.html?$/i.test(file.originalname);
    const validMime = ['text/html', 'application/xhtml+xml', 'application/octet-stream'].includes(file.mimetype);
    callback(validExtension && validMime ? null : new Error('SOLO SE PERMITEN ARCHIVOS HTML.'), validExtension && validMime);
  }
});

router.get('/', controller.data);
router.post('/fuentes', access.requireRole('editor'), upload.single('file'), controller.upload);

module.exports = router;
