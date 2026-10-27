'use strict';

const path = require('node:path');
const ExcelJS = require('exceljs');

const COLORS = {
  header: 'FF344054',
  headerText: 'FFFFFFFF',
  exact: 'FFE2F0D9',
  probable: 'FFFFF2CC',
  review: 'FFFCE4D6',
  missing: 'FFF4CCCC'
};

function fechaArchivo(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function prepararHoja(sheet, columns) {
  sheet.columns = columns;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(columns.length).letter}1` };
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

function columnasCruce(includeContext = true) {
  const context = includeContext ? [
    { header: 'Municipio', key: 'municipio', width: 28 },
    { header: 'Cargo / tipo', key: 'cargo_tipo', width: 34 },
    { header: 'Origen', key: 'origen', width: 24 },
    { header: 'Persona relacionada', key: 'persona_relacionada', width: 34 },
    { header: 'ID local', key: 'persona_local_id', width: 38 }
  ] : [
    { header: 'Nombre normalizado', key: 'nombre_normalizado', width: 38 },
    { header: 'Apariciones', key: 'apariciones', width: 12 },
    { header: 'Municipios', key: 'municipios', width: 42 },
    { header: 'Cargos / tipos', key: 'cargos', width: 42 },
    { header: 'Orígenes', key: 'origenes', width: 28 }
  ];
  return [
    { header: 'Nombre local', key: 'nombre_local', width: 38 },
    ...context,
    { header: 'Clasificación', key: 'estado', width: 24 },
    { header: 'Mejor puntuación', key: 'puntuacion', width: 18 },
    { header: 'ID persona PostgreSQL', key: 'ids_pg', width: 24 },
    { header: 'Nombre(s) PostgreSQL', key: 'nombres_pg', width: 48 },
    { header: 'Oculto en PostgreSQL', key: 'ocultos_pg', width: 20 },
    { header: 'Última actualización PostgreSQL', key: 'actualizaciones_pg', width: 26 },
    { header: 'Otros candidatos', key: 'otros_candidatos', width: 56 }
  ];
}

function filaReporte(item) {
  const candidates = item.candidatos || [];
  const primaryCount = item.estado === 'EXACTA AMBIGUA' || item.estado === 'AMBIGUA' ? candidates.length : Math.min(candidates.length, 1);
  const primary = candidates.slice(0, primaryCount);
  const alternatives = candidates.slice(primaryCount);
  return {
    ...item,
    puntuacion: candidates[0] ? Number((candidates[0].score * 100).toFixed(2)) : '',
    ids_pg: primary.map(candidate => candidate.id_persona).join(' | '),
    nombres_pg: primary.map(candidate => candidate.nombre_completo).join(' | '),
    ocultos_pg: primary.map(candidate => candidate.oculto ? 'SÍ' : 'NO').join(' | '),
    actualizaciones_pg: primary.map(candidate => candidate.updated_at ? String(candidate.updated_at) : '').join(' | '),
    otros_candidatos: alternatives
      .map(candidate => `${candidate.nombre_completo} (${(candidate.score * 100).toFixed(2)}%; ID ${candidate.id_persona})`)
      .join(' | ')
  };
}

function colorearEstados(sheet, stateColumnKey = 'estado') {
  const stateColumn = sheet.getColumn(stateColumnKey);
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const cell = sheet.getRow(index).getCell(stateColumn.number);
    const value = String(cell.value || '');
    let color = COLORS.review;
    if (value === 'COINCIDENCIA EXACTA') color = COLORS.exact;
    else if (value === 'PROBABLE') color = COLORS.probable;
    else if (value === 'NO ENCONTRADO') color = COLORS.missing;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  }
}

async function generarExcel({ nombresUnicos, porFicha, localCount, postgresCount, outputDir }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de fichas municipales — Cruce de actores';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Resumen');
  prepararHoja(summary, [
    { header: 'Concepto', key: 'concepto', width: 42 },
    { header: 'Total', key: 'total', width: 18 }
  ]);
  summary.addRows([
    { concepto: 'Apariciones locales analizadas', total: localCount },
    { concepto: 'Nombres locales únicos', total: nombresUnicos.length },
    { concepto: 'Personas consultadas en PostgreSQL', total: postgresCount },
    ...Object.entries(nombresUnicos.reduce((totals, item) => {
      totals[item.estado] = (totals[item.estado] || 0) + 1;
      return totals;
    }, {})).sort(([a], [b]) => a.localeCompare(b, 'es')).map(([estado, total]) => ({ concepto: estado, total }))
  ]);
  summary.addRow({ concepto: 'Generado', total: new Date().toLocaleString('es-MX') });

  const unique = workbook.addWorksheet('Nombres únicos');
  prepararHoja(unique, columnasCruce(false));
  unique.addRows(nombresUnicos.map(filaReporte));
  colorearEstados(unique);

  const appearances = workbook.addWorksheet('Cruce por ficha');
  prepararHoja(appearances, columnasCruce(true));
  appearances.addRows(porFicha.map(filaReporte));
  colorearEstados(appearances);

  const review = workbook.addWorksheet('Revisión manual');
  prepararHoja(review, columnasCruce(false));
  review.addRows(nombresUnicos
    .filter(item => item.estado !== 'COINCIDENCIA EXACTA')
    .map(filaReporte));
  colorearEstados(review);

  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
    });
  }

  const outputPath = path.join(outputDir, `cruce-actores-${fechaArchivo()}.xlsx`);
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

module.exports = { generarExcel };
