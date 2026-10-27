'use strict';

const path = require('node:path');
const ExcelJS = require('exceljs');
const { v4: uuidv4 } = require('uuid');
const db = require('../../src/config/database');
const { normalizeReferenceKey } = require('../../src/utils/reference-normalizer');

const filePath = path.resolve(process.argv[2] || process.env.HISTORIAL_EXCEL || './storage/importaciones/alcaldes.xlsx');
const corrections = new Map([
  ['HIGINIP MARTINEZ MIRANDA', 'HIGINIO MARTINEZ MIRANDA'],
  ['HIGINIO MARTINEZ MIRANDA', 'HIGINIO MARTINEZ MIRANDA'],
  ['HORACIO DUARTE OLIVARES', 'HORACIO DUARTE OLIVARES'],
  ['HDO', 'HORACIO DUARTE OLIVARES']
]);
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalize = value => {
  const key = normalizeReferenceKey(clean(value));
  return corrections.get(key) || key;
};
const municipioAliases = new Map([
  ['SANTO TOMAS DE LOS PLATANOS', 'SANTO TOMAS']
]);
const municipioKey = value => {
  const key = normalizeReferenceKey(clean(value));
  return municipioAliases.get(key) || key;
};

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const municipios = new Map(db.prepare('SELECT id,nombre FROM municipios').all().map(row => [municipioKey(row.nombre), row]));
  const upsert = db.prepare(`
    INSERT INTO historial_presidencias
      (id,periodo,municipio_id,municipio_nombre,presidente_nombre,partido,referente_original,referente_normalizado,estado_normalizacion,origen_hoja,origen_fila)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(periodo,municipio_nombre) DO UPDATE SET
      municipio_id=excluded.municipio_id,presidente_nombre=excluded.presidente_nombre,
      partido=excluded.partido,referente_original=excluded.referente_original,
      referente_normalizado=excluded.referente_normalizado,
      estado_normalizacion=excluded.estado_normalizacion,origen_hoja=excluded.origen_hoja,
      origen_fila=excluded.origen_fila
  `);
  let imported = 0; let unresolved = 0;
  const transaction = db.transaction(() => {
    for (const sheet of workbook.worksheets) {
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const values = sheet.getRow(rowNumber).values;
        const municipioNombre = clean(values[2]);
        if (!municipioNombre) continue;
        const presidente = clean(values[3]);
        const partido = clean(values[4]);
        const referenteOriginal = clean(values[5]);
        const municipio = municipios.get(municipioKey(municipioNombre));
        const referenteNormalizado = normalize(referenteOriginal);
        const estado = referenteOriginal && referenteNormalizado && !['POR VALIDAR','SIN REFERENTE'].includes(referenteNormalizado)
          ? (corrections.has(normalizeReferenceKey(referenteOriginal)) ? 'CORREGIDO_DICCIONARIO' : 'NORMALIZADO')
          : 'REQUIERE_VALIDACION';
        if (!municipio) unresolved += 1;
        upsert.run(uuidv4(), sheet.name, municipio?.id || null, municipioNombre, presidente, partido, referenteOriginal, referenteNormalizado, estado, sheet.name, rowNumber);
        imported += 1;
      }
    }
  });
  transaction();
  console.log(`Historial importado: ${imported} registros.`);
  console.log(`Municipios no vinculados al catálogo actual: ${unresolved}.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
