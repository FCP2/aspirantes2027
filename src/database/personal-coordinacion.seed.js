const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const MIGRATION_KEY = '20260929_personal_coordinacion_directorio_ssgg';
const seedPath = path.join(__dirname, 'seeds', 'personal-coordinacion.json');

function normalizeMunicipality(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tableExists(name) {
  return Boolean(db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`
  ).get(name));
}

function seedPersonalCoordinacion() {
  if (!fs.existsSync(seedPath)) return { skipped: 'No se encontró el directorio fuente.' };
  if (!tableExists('municipios') || !tableExists('personal_coordinacion')) {
    return { skipped: 'El catálogo municipal o la tabla destino aún no existe.' };
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS system_migrations (
      migration_key TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
  if (db.prepare('SELECT 1 FROM system_migrations WHERE migration_key=?').get(MIGRATION_KEY)) {
    return { skipped: 'El directorio ya fue aplicado.' };
  }

  const directory = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const municipalityRows = db.prepare('SELECT id,nombre FROM municipios').all();
  const municipalitiesByName = new Map(
    municipalityRows.map(row => [normalizeMunicipality(row.nombre), row])
  );
  const assignments = [];
  const assignedMunicipalities = new Set();
  const unmatched = [];
  const duplicateCoverage = [];

  for (const coordination of directory.coordinaciones || []) {
    for (const region of coordination.regiones || []) {
      for (const municipalityName of region.municipios || []) {
        const municipality = municipalitiesByName.get(normalizeMunicipality(municipalityName));
        if (!municipality) {
          unmatched.push(municipalityName);
          continue;
        }
        if (assignedMunicipalities.has(municipality.id)) {
          duplicateCoverage.push(municipality.nombre);
          continue;
        }

        assignedMunicipalities.add(municipality.id);
        assignments.push({ municipioId: municipality.id, coordinator: coordination, region });
      }
    }
  }

  const uncovered = municipalityRows
    .filter(row => !assignedMunicipalities.has(row.id))
    .map(row => row.nombre);

  if (unmatched.length || duplicateCoverage.length || uncovered.length) {
    const details = {
      unmatched,
      duplicateCoverage,
      uncovered,
      catalogMunicipalities: municipalityRows.length,
      coveredMunicipalities: assignedMunicipalities.size
    };
    console.warn('Directorio de coordinación no aplicado; revisar cobertura:', details);
    return { skipped: 'La cobertura del directorio no coincide con el catálogo.', details };
  }

  const selectExisting = db.prepare(`
    SELECT 1 FROM personal_coordinacion
    WHERE municipio_id=? AND LOWER(TRIM(nombre))=LOWER(TRIM(?))
    LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT INTO personal_coordinacion (
      id, municipio_id, nombre, cargo, coordinacion_general, region,
      telefono, foto_path, orden_visual, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, datetime('now','localtime'), datetime('now','localtime'))
  `);
  let inserted = 0;
  let alreadyPresent = 0;

  db.transaction(() => {
    for (const { municipioId, coordinator, region } of assignments) {
      const people = [
        {
          nombre: coordinator.coordinador,
          cargo: 'COORDINADOR(A) GENERAL',
          coordinacionGeneral: coordinator.nombre,
          region: '',
          telefono: coordinator.telefono,
          ordenVisual: 1
        },
        {
          nombre: region.director,
          cargo: 'DIRECTOR(A) REGIONAL',
          coordinacionGeneral: coordinator.nombre,
          region: region.nombre,
          telefono: region.telefono,
          ordenVisual: 2
        }
      ];

      for (const person of people) {
        if (selectExisting.get(municipioId, person.nombre)) {
          alreadyPresent++;
          continue;
        }
        insert.run(
          crypto.randomUUID(),
          municipioId,
          person.nombre,
          person.cargo,
          person.coordinacionGeneral,
          person.region || null,
          person.telefono,
          person.ordenVisual
        );
        inserted++;
      }
    }

    db.prepare('INSERT INTO system_migrations (migration_key) VALUES (?)').run(MIGRATION_KEY);
  })();

  const result = { municipios: assignments.length, inserted, alreadyPresent };
  console.info('Directorio de coordinación aplicado:', result);
  return result;
}

module.exports = seedPersonalCoordinacion;
