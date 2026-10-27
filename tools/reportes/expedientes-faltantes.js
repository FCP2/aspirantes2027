'use strict';

// Reporte de solo lectura: no modifica ninguna de las dos bases SQLite.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ExcelJS = require('exceljs');

const municipalPath = path.resolve(process.env.DATABASE_PATH || './data/municipal.sqlite');
const linksPath = path.resolve(process.env.ACTORES_LINK_DB_PATH || './data/integracion-actores.sqlite');
const outputPath = path.resolve(process.env.EXPEDIENTES_REPORT_PATH || './storage/reportes/expedientes-municipios.xlsx');
const municipalDb = new DatabaseSync(municipalPath, { readOnly: true });

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function fullName(row) {
  return [row.nombre, row.apellido_paterno, row.apellido_materno]
    .map(value => String(value || '').trim()).filter(Boolean).join(' ');
}

function loadPeople() {
  const rows = [];
  const actors = municipalDb.prepare(`
    SELECT m.id municipio_id,m.nombre municipio,
           p.id persona_id,p.nombre,p.apellido_paterno,p.apellido_materno,
           a.tipo_actor
    FROM actores_municipio a
    JOIN municipios m ON m.id=a.municipio_id
    JOIN personas p ON p.id=a.persona_id
    WHERE a.activo=1 AND p.activo=1
      AND a.tipo_actor IN ('PRESIDENCIA_MUNICIPAL','LIDER','ASPIRANTE_2027')
  `).all();
  actors.forEach(row => rows.push({
    ...row,
    bloque: row.tipo_actor === 'PRESIDENCIA_MUNICIPAL' ? 'PRESIDENCIA MUNICIPAL'
      : row.tipo_actor === 'LIDER' ? 'LÍDERES' : 'ASPIRANTES 2027',
    nombre_completo: fullName(row)
  }));

  if (tableExists(municipalDb, 'personal_territorio')) {
    const territory = municipalDb.prepare(`
      SELECT m.id municipio_id,m.nombre municipio,
             p.id persona_id,p.nombre,p.apellido_paterno,p.apellido_materno
      FROM personal_territorio t
      JOIN municipios m ON m.id=t.municipio_id
      JOIN personas p ON p.id=t.persona_id
      WHERE t.activo=1 AND p.activo=1
    `).all();
    territory.forEach(row => rows.push({ ...row, bloque: 'PERSONAL EN TERRITORIO', nombre_completo: fullName(row) }));
  }
  return rows;
}

function loadStatuses(ids) {
  const result = new Map();
  if (!fs.existsSync(linksPath)) return result;
  const db = new DatabaseSync(linksPath, { readOnly: true });
  if (!tableExists(db, 'verificaciones_personas')) return result;
  const placeholders = ids.map(() => '?').join(',');
  const verifications = ids.length ? db.prepare(`SELECT * FROM verificaciones_personas WHERE persona_local_id IN (${placeholders})`).all(...ids) : [];
  verifications.forEach(item => result.set(String(item.persona_local_id), item));
  if (tableExists(db, 'enlaces_personas') && ids.length) {
    db.prepare(`SELECT * FROM enlaces_personas WHERE persona_local_id IN (${placeholders})`).all(...ids).forEach(item => {
      result.set(String(item.persona_local_id), { ...result.get(String(item.persona_local_id)), ...item, estado: 'ENLAZADA', puntuacion: 100 });
    });
  }
  db.close();
  return result;
}

function statusInfo(status) {
  if (!status) return ['SIN EXPEDIENTE', 'No existe coincidencia ni enlace guardado.', 'missing'];
  if (status.estado === 'ENLAZADA') return ['ENLAZADO', 'Expediente confirmado manualmente.', 'linked'];
  if (['DISPONIBLE', 'REVISAR'].includes(status.estado)) return ['POSIBLE COINCIDENCIA', 'Revisar manualmente: el nombre coincide, pero no está confirmado al 100%.', 'review'];
  return ['SIN EXPEDIENTE', status.detalle || 'No se localizó un expediente.', 'missing'];
}

async function main() {
  const people = loadPeople();
  const statuses = loadStatuses([...new Set(people.map(row => String(row.persona_id)))]);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Prototipo Fichas Municipales';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Expedientes');
  sheet.columns = [
    { header: '#', key: 'numero', width: 7 },
    { header: 'MUNICIPIO', key: 'municipio', width: 34 },
    { header: 'BLOQUE', key: 'bloque', width: 28 },
    { header: 'NOMBRE COMPLETO', key: 'nombre', width: 38 },
    { header: 'ESTADO DEL EXPEDIENTE', key: 'estado', width: 24 },
    { header: 'OBSERVACIÓN', key: 'observacion', width: 65 },
    { header: 'PUNTUACIÓN', key: 'puntuacion', width: 13 },
    { header: 'ÚLTIMA VERIFICACIÓN', key: 'verificado', width: 22 }
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8F173D' } };
  sheet.autoFilter = { from: 'A1', to: 'H1' };
  people.sort((a, b) => a.municipio.localeCompare(b.municipio, 'es') || a.bloque.localeCompare(b.bloque, 'es') || a.nombre_completo.localeCompare(b.nombre_completo, 'es'));
  people.forEach((person, index) => {
    const status = statuses.get(String(person.persona_id));
    const [label, observation, kind] = statusInfo(status);
    const row = sheet.addRow({ numero: index + 1, municipio: person.municipio, bloque: person.bloque, nombre: person.nombre_completo, estado: label, observacion: observation, puntuacion: status?.puntuacion ?? '', verificado: status?.verificado_en || '' });
    row.alignment = { vertical: 'top', wrapText: true };
    if (kind === 'review') row.getCell('estado').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3D39A' } };
    if (kind === 'missing') row.getCell('estado').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7D7D7' } };
    if (kind === 'linked') row.getCell('estado').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCEFE4' } };
  });
  const summary = workbook.addWorksheet('Resumen');
  summary.columns = [{ header: 'INDICADOR', key: 'indicador', width: 32 }, { header: 'TOTAL', key: 'total', width: 14 }];
  summary.addRows([
    { indicador: 'PERSONAS REVISADAS', total: people.length },
    { indicador: 'SIN EXPEDIENTE', total: people.filter(p => statusInfo(statuses.get(String(p.persona_id)))[2] === 'missing').length },
    { indicador: 'POSIBLES COINCIDENCIAS (REVISAR)', total: people.filter(p => statusInfo(statuses.get(String(p.persona_id)))[2] === 'review').length },
    { indicador: 'ENLACES CONFIRMADOS', total: people.filter(p => statusInfo(statuses.get(String(p.persona_id)))[2] === 'linked').length }
  ]);
  summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8F173D' } };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Reporte generado: ${outputPath}`);
  console.log(`Registros: ${people.length}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
