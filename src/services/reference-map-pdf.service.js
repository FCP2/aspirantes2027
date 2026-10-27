'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const wellknown = require('wellknown');
const mapService = require('./reportes-mapa.service');

function resolveFilePath(value) {
  if (!value) return null;
  const direct = path.resolve(value);
  if (fs.existsSync(direct)) return direct;
  const normalized = String(value).replace(/\\/g, '/');
  const index = normalized.toLowerCase().lastIndexOf('/storage/');
  if (index >= 0) {
    const portable = path.resolve(normalized.slice(index + 1));
    if (fs.existsSync(portable)) return portable;
  }
  return null;
}

function photoDataUri(value) {
  const file = resolveFilePath(value);
  if (!file) return '';
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

function coordinates(geometry) {
  const result = [];
  const visit = value => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') result.push(value);
    else value.forEach(visit);
  };
  visit(geometry?.coordinates);
  return result;
}

function geometryRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

function buildMapSvg(municipalities, selectedIds, activeColor='#a8174b') {
  const parsed = municipalities.map(row => {
    try { return { row, geometry: row.wkt ? wellknown.parse(row.wkt) : null }; }
    catch { return { row, geometry: null }; }
  }).filter(item => item.geometry);
  const all = parsed.flatMap(item => coordinates(item.geometry));
  if (!all.length) return '';
  const bounds = all.reduce((result,point) => ({
    minX:Math.min(result.minX,point[0]),maxX:Math.max(result.maxX,point[0]),
    minY:Math.min(result.minY,point[1]),maxY:Math.max(result.maxY,point[1])
  }),{ minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity });
  const width = 610;
  const height = 500;
  const padding = 18;
  const scale = Math.min((width-padding*2)/(bounds.maxX-bounds.minX),(height-padding*2)/(bounds.maxY-bounds.minY));
  const offsetX = (width-(bounds.maxX-bounds.minX)*scale)/2;
  const offsetY = (height-(bounds.maxY-bounds.minY)*scale)/2;
  const project = point => [offsetX+(point[0]-bounds.minX)*scale,height-offsetY-(point[1]-bounds.minY)*scale];
  const selected = new Set(selectedIds);

  const paths = parsed.map(({ row, geometry }) => {
    const d = geometryRings(geometry).map(ring => ring.map((point,index) => {
      const [x,y] = project(point);
      return `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ') + ' Z').join(' ');
    const active = selected.has(row.municipio_id);
    const rowColor = typeof activeColor === 'function' ? activeColor(row) : activeColor;
    return `<path d="${d}" fill="${active ? rowColor : '#d6d7d4'}" stroke="${active ? rowColor : '#ffffff'}" stroke-width="${active ? 1.5 : .65}"/>`;
  }).join('');
  const escape = value => String(value).replace(/[&<>"']/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
  const wrap = value => {
    const lines=[];
    String(value).split(/\s+/).forEach(word => {
      const last=lines[lines.length-1];
      if (!last || `${last} ${word}`.length>15) lines.push(word);
      else lines[lines.length-1]=`${last} ${word}`;
    });
    return lines.slice(0,3);
  };
  const labels = parsed.filter(item=>selected.has(item.row.municipio_id)).map(({ row,geometry }) => {
    const points=coordinates(geometry);
    const box=points.reduce((result,point)=>({minX:Math.min(result.minX,point[0]),maxX:Math.max(result.maxX,point[0]),minY:Math.min(result.minY,point[1]),maxY:Math.max(result.maxY,point[1])}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
    const [x,y]=project([(box.minX+box.maxX)/2,(box.minY+box.maxY)/2]);
    const lines=wrap(row.nombre);
    return `<text x="${x.toFixed(1)}" y="${(y-(lines.length-1)*2.2).toFixed(1)}" text-anchor="middle">${lines.map((line,index)=>`<tspan x="${x.toFixed(1)}" dy="${index?4.4:0}">${escape(line)}</tspan>`).join('')}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Municipios vinculados al referente"><g>${paths}</g><g class="map-labels">${labels}</g></svg>`;
}

async function render({ officeId, key }) {
  const reference = mapService.getReference(officeId, key);
  const municipalities = mapService.list(officeId);
  const presidencyRecords = reference.registros.filter(item => item.tipo_actor === 'PRESIDENCIA_MUNICIPAL');
  const deputyRecords = reference.registros.filter(item => item.tipo_actor === 'DIPUTACION_FEDERAL' || item.tipo_actor === 'DIPUTACION_LOCAL');
  const uniqueMunicipalityIds = records => [...new Set(records.map(item => item.municipio_id))];
  const presidencyMunicipalityIds = uniqueMunicipalityIds(presidencyRecords);
  const deputyMunicipalityIds = uniqueMunicipalityIds(deputyRecords);
  const template = path.resolve('./templates/reportes/reference-map.ejs');
  return ejs.renderFile(template, {
    reference,
    presidencyRecords,
    deputyRecords,
    presidencyMunicipalityCount: presidencyMunicipalityIds.length,
    deputyMunicipalityCount: deputyMunicipalityIds.length,
    presidencyMapSvg: buildMapSvg(municipalities, presidencyMunicipalityIds, reference.color || '#a8174b'),
    deputyMapSvg: buildMapSvg(municipalities, deputyMunicipalityIds, reference.color || '#a8174b'),
    generatedAt: new Intl.DateTimeFormat('es-MX',{dateStyle:'long',timeStyle:'short'}).format(new Date()),
    photo: photoDataUri
  });
}

exports.renderPreview = render;

exports.generate = async ({ officeId, key }) => {
  const reference = mapService.getReference(officeId, key);
  const html = await render({ officeId, key });
  const directory = path.resolve('./storage/pdfs');
  fs.mkdirSync(directory,{ recursive:true });
  const safe = reference.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').toUpperCase();
  const output = path.join(directory,`MAPA_REFERENTE_${safe || 'SIN_NOMBRE'}.pdf`);
  const browser = await puppeteer.launch({ headless:true, args:['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);
    await page.emulateMediaType('print');
    // El reporte ya contiene SVG e imágenes como data URI. Esperar networkidle0
    // no aporta nada y puede bloquear la descarga en reportes con muchas fotos.
    await page.setContent(html,{ waitUntil:'domcontentloaded', timeout:120000 });
    await page.evaluate(async()=>{
      if(document.fonts?.ready)await document.fonts.ready;
      await Promise.all([...document.images].map(image=>image.complete ? Promise.resolve() : new Promise(resolve=>{
        image.addEventListener('load',resolve,{once:true});
        image.addEventListener('error',resolve,{once:true});
      })));
    });
    await page.pdf({ path:output, printBackground:true, preferCSSPageSize:true, margin:{top:0,right:0,bottom:0,left:0}, timeout:120000 });
  } finally {
    await browser.close();
  }
  return output;
};

exports.buildMapSvg = buildMapSvg;
