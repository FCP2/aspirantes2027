require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { v4: uuidv4 } = require('uuid');
const db = require('../../src/config/database');
const { normalizeText, normalizePersonName, normalizeSearch } = require('../../src/utils/textNormalizer');

const sourcePath = path.resolve(process.argv[2] || path.join(__dirname,'diputaciones.xlsx'));

function cellText(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(item=>item.text || '').join('');
    if (value.result != null) return String(value.result);
    if (value.text != null) return String(value.text);
  }
  return String(value);
}

function headerKey(value) {
  return normalizeSearch(value).replace(/[^A-Z0-9]+/g,' ').trim();
}

function columnFor(headers,aliases) {
  for (const [column,key] of headers) if (aliases.includes(key)) return column;
  return null;
}

function normalizeType(value) {
  const key = headerKey(value);
  if (key.includes('FEDERAL')) return 'FEDERAL';
  if (key.includes('LOCAL')) return 'LOCAL';
  return '';
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`NO SE ENCONTRÓ EL EXCEL: ${sourcePath}\nColócalo ahí o indica su ruta: npm run directorio:diputaciones -- "C:\\ruta\\archivo.xlsx"`);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);
  const records = [];

  for (const sheet of workbook.worksheets) {
    let headerRowNumber = 0;
    let headers = new Map();
    for (let rowNumber=1; rowNumber<=Math.min(sheet.rowCount,15); rowNumber+=1) {
      const candidate = new Map();
      sheet.getRow(rowNumber).eachCell((cell,column)=>candidate.set(column,headerKey(cellText(cell))));
      const nameColumn = columnFor(candidate,['NOMBRE COMPLETO','NOMBRE','DIPUTADO','DIPUTADA','NOMBRE DIPUTADO','NOMBRE DIPUTADA']);
      const districtColumn = columnFor(candidate,['DISTRITO','DTTO','NOMBRE DISTRITO']);
      if (nameColumn && districtColumn) { headerRowNumber=rowNumber; headers=candidate; break; }
    }
    if (!headerRowNumber) continue;

    const nameColumn = columnFor(headers,['NOMBRE COMPLETO','NOMBRE','DIPUTADO','DIPUTADA','NOMBRE DIPUTADO','NOMBRE DIPUTADA']);
    const districtColumn = columnFor(headers,['DISTRITO','DTTO','NOMBRE DISTRITO']);
    const typeColumn = columnFor(headers,['TIPO','TIPO DIPUTACION','AMBITO','NIVEL']);
    const sheetType = normalizeType(sheet.name);

    for (let rowNumber=headerRowNumber+1; rowNumber<=sheet.rowCount; rowNumber+=1) {
      const row = sheet.getRow(rowNumber);
      const nombreCompleto = normalizePersonName(cellText(row.getCell(nameColumn)));
      const distrito = normalizeText(cellText(row.getCell(districtColumn)));
      if (!nombreCompleto && !distrito) continue;
      const tipo = normalizeType(typeColumn ? cellText(row.getCell(typeColumn)) : '') || sheetType;
      if (!tipo) throw new Error(`NO SE PUDO DETERMINAR SI ES FEDERAL O LOCAL EN ${sheet.name}, FILA ${rowNumber}. AGREGA LA COLUMNA TIPO O RENOMBRA LA HOJA.`);
      if (!nombreCompleto || !distrito) throw new Error(`FALTA NOMBRE COMPLETO O DISTRITO EN ${sheet.name}, FILA ${rowNumber}.`);
      records.push({tipo,nombreCompleto,distrito,hoja:sheet.name,fila:rowNumber});
    }
  }
  if (!records.length) throw new Error('EL EXCEL NO CONTIENE FILAS VÁLIDAS. REVISA LOS ENCABEZADOS NOMBRE COMPLETO Y DISTRITO.');

  const upsert = db.prepare(`
    INSERT INTO directorio_diputaciones (
      id,tipo,nombre_completo,distrito,activo,origen_archivo,origen_hoja,origen_fila,created_at,updated_at
    ) VALUES (?,?,?,?,1,?,?,?,datetime('now','localtime'),datetime('now','localtime'))
    ON CONFLICT(tipo,nombre_completo,distrito) DO UPDATE SET
      activo=1,origen_archivo=excluded.origen_archivo,origen_hoja=excluded.origen_hoja,
      origen_fila=excluded.origen_fila,updated_at=datetime('now','localtime')
  `);
  db.transaction(() => {
    db.prepare('UPDATE directorio_diputaciones SET activo=0').run();
    records.forEach(record=>upsert.run(uuidv4(),record.tipo,record.nombreCompleto,record.distrito,path.basename(sourcePath),record.hoja,record.fila));
  })();
  const federal = records.filter(item=>item.tipo==='FEDERAL').length;
  const local = records.filter(item=>item.tipo==='LOCAL').length;
  console.log(`DIRECTORIO IMPORTADO: ${records.length} REGISTROS | FEDERALES: ${federal} | LOCALES: ${local}`);
}

if (require.main === module) main().catch(error=>{console.error(error.message);process.exitCode=1});

module.exports = { main };
