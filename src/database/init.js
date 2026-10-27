require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { normalizeUpper } = require('../utils/textNormalizer');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migraciones pequeñas de V1.
const fichaCols = db.prepare(`PRAGMA table_info(fichas_municipales)`).all().map(x => x.name);
if (!fichaCols.includes('grupo_politico_texto')) {
  db.exec(`ALTER TABLE fichas_municipales ADD COLUMN grupo_politico_texto TEXT`);
}

const officeId = process.env.OFFICE_ID || 'COORD-01';
const officeName = normalizeUpper(process.env.OFFICE_NAME || 'COORDINACION 1');

db.prepare(`
  INSERT OR IGNORE INTO oficinas (id, clave, nombre, activo, created_at)
  VALUES (?, ?, ?, 1, datetime('now','localtime'))
`).run(officeId, officeId, officeName);

// Coloca tu catálogo real en: src/database/seeds/municipios.json
const realPath = path.join(__dirname, 'seeds', 'municipios.json');
const samplePath = path.join(__dirname, 'seeds', 'municipios.sample.json');
const sourcePath = fs.existsSync(realPath) ? realPath : samplePath;
const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const municipios = Array.isArray(raw) ? raw : (raw.municipios || raw.features || []);

function adaptMunicipio(m, index) {
  const props = m.properties || m;
  const clave = String(
    props.clave ?? props.cve_municipio ?? props.CVE_MUN ?? props.cve_mun ??
    props.id ?? (index + 1)
  ).padStart(3, '0');

  const nombre = normalizeUpper(
    props.nombre ?? props.municipio ?? props.NOM_MUN ?? props.NOMGEO ?? props.name ?? ''
  );
  if (!nombre) return null;

  const id = String(props.id ?? props.cvegeo ?? props.CVEGEO ?? `015${clave}`);
  return { id, clave, nombre, metadata: JSON.stringify(props) };
}

const insertMunicipio = db.prepare(`
  INSERT OR IGNORE INTO municipios (id, clave, nombre, metadata_json, activo)
  VALUES (?, ?, ?, ?, 1)
`);
const assignMunicipio = db.prepare(`
  INSERT OR IGNORE INTO oficina_municipio (office_id, municipio_id, activo)
  VALUES (?, ?, 1)
`);
const insertFicha = db.prepare(`
  INSERT OR IGNORE INTO fichas_municipales (
    id, municipio_id, estatus, revision, created_at, updated_at
  ) VALUES (?, ?, 'PENDIENTE', 0, datetime('now','localtime'), datetime('now','localtime'))
`);

const tx = db.transaction(() => {
  municipios.forEach((m, i) => {
    const x = adaptMunicipio(m, i);
    if (!x) return;
    insertMunicipio.run(x.id, x.clave, x.nombre, x.metadata);
    assignMunicipio.run(officeId, x.id);
    insertFicha.run(uuidv4(), x.id);
  });

  const partidos = [
    ['MORENA','MORENA'], ['PRI','PRI'], ['PAN','PAN'], ['PVEM','PVEM'],
    ['PT','PT'], ['MC','MOVIMIENTO CIUDADANO']
  ];
  for (const [id, nombre] of partidos) {
    db.prepare(`INSERT OR IGNORE INTO partidos (id, siglas, nombre, activo) VALUES (?, ?, ?, 1)`)
      .run(id, id, nombre);
  }

  const tipos = [
    ['COTS','ENLACE DISTRITAL COTS',1],
    ['SN','SERVIDORES DE LA NACIÓN',2],
    ['SP','SERVIDORES DEL PUEBLO',3]
  ];
  for (const [id, nombre, orden] of tipos) {
    db.prepare(`
      INSERT OR IGNORE INTO tipos_personal_territorio (id, nombre, activo, orden)
      VALUES (?, ?, 1, ?)
    `).run(id, nombre, orden);
  }
});
tx();

console.log(`Base inicializada. Catálogo: ${path.basename(sourcePath)} | Oficina: ${officeId}`);
