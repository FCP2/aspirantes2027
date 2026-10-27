'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const mapService = require('./reportes-mapa.service');
const { buildMapSvg } = require('./reference-map-pdf.service');
const { normalizeReferenceKey } = require('../utils/reference-normalizer');

function validScope(value) {
  return ['referente', 'subreferente', 'ambos'].includes(value) ? value : 'ambos';
}

function resolvePhotoFile(value) {
  if (!value) return '';

  const relative = String(value).replace(/^\/+/, '');
  const file = path.resolve(relative);

  return fs.existsSync(file) ? file : '';
}

async function createPhotoThumbnails(records) {
  const files = [...new Set(records.map(record => resolvePhotoFile(record.foto_url)).filter(Boolean))];
  const thumbnails = new Map();
  let cursor = 0;
  const workerCount = Math.min(6, files.length);

  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor++];

      try {
        const buffer = await sharp(file)
          .rotate()
          .flatten({ background: '#e8e3da' })
          .resize({
            width: 180,
            height: 240,
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 68, mozjpeg: true })
          .toBuffer();
        thumbnails.set(file, `data:image/jpeg;base64,${buffer.toString('base64')}`);
      } catch {
        thumbnails.set(file, '');
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));

  return records.map(record => ({
    ...record,
    foto_data: thumbnails.get(resolvePhotoFile(record.foto_url)) || ''
  }));
}

function generatedAt() {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short'
  }).format(new Date());
}

function flattenMunicipalities(municipalities) {
  return municipalities.flatMap(municipality => municipality.aspirantes.map(aspirant => ({
    ...aspirant,
    municipio_id: municipality.municipio_id,
    municipio: municipality.nombre,
    clave: municipality.clave
  })));
}

async function render({
  officeId,
  municipalityId,
  scope = 'ambos',
  general = false,
  subreference = ''
}) {
  const data = mapService.listAspirants(officeId);
  const municipalities = mapService.list(officeId);
  let selectedMunicipalities = general
    ? data.municipios
    : [mapService.getMunicipalityAspirants(officeId, municipalityId)];

  if (subreference) {
    const normalizedSubreference = normalizeReferenceKey(subreference);
    selectedMunicipalities = data.municipios
      .map(municipality => ({
        ...municipality,
        aspirantes: municipality.aspirantes.filter(aspirant =>
          normalizeReferenceKey(aspirant.subreferente) === normalizedSubreference
        )
      }))
      .filter(municipality => municipality.aspirantes.length > 0)
      .map(municipality => ({
        ...municipality,
        total_aspirantes: municipality.aspirantes.length
      }));
  }

  const selectedIds = selectedMunicipalities.map(item => item.municipio_id);
  const records = await createPhotoThumbnails(flattenMunicipalities(selectedMunicipalities));

  return ejs.renderFile(path.resolve('./templates/reportes/aspirants-map.ejs'), {
    general,
    displayMode: subreference ? 'subreferente' : validScope(scope),
    subreferenceName: subreference,
    reportTitle: subreference
      ? `ASPIRANTES 2027 · SUBREFERENTE: ${subreference.toUpperCase()}`
      : 'ASPIRANTES 2027 · REPORTE GENERAL',
    records,
    municipalities: selectedMunicipalities,
    municipality: general ? null : selectedMunicipalities[0],
    mapSvg: buildMapSvg(municipalities, selectedIds, '#9f123f'),
    totalMunicipalities: selectedMunicipalities.length,
    generatedAt: generatedAt()
  });
}

async function writePdf(html, output) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);
    await page.emulateMediaType('print');
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });
    await page.pdf({
      path: output,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: 120000
    });
  } finally {
    await browser.close();
  }
}

exports.renderPreview = options => render({ ...options, general: false });
exports.renderGeneralPreview = options => render({ ...options, general: true });
exports.renderSubreferenceGeneralPreview = options => render({
  ...options,
  general: true,
  subreference: String(options.subreference || '').trim()
});

exports.generate = async options => {
  const municipality = mapService.getMunicipalityAspirants(options.officeId, options.municipalityId);
  const html = await render({ ...options, general: false });
  const directory = path.resolve('./storage/pdfs');
  fs.mkdirSync(directory, { recursive: true });
  const safeName = municipality.nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();
  const output = path.join(directory, `ASPIRANTES_2027_${safeName}.pdf`);

  await writePdf(html, output);
  return output;
};

exports.generateGeneral = async options => {
  const html = await render({ ...options, general: true });
  const directory = path.resolve('./storage/pdfs');
  fs.mkdirSync(directory, { recursive: true });
  const output = path.join(directory, 'ASPIRANTES_2027_GENERAL.pdf');

  await writePdf(html, output);
  return output;
};

exports.generateSubreferenceGeneral = async options => {
  const subreference = String(options.subreference || '').trim();
  const html = await render({ ...options, general: true, subreference });
  const directory = path.resolve('./storage/pdfs');
  fs.mkdirSync(directory, { recursive: true });
  const safeName = subreference
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();
  const output = path.join(directory, `ASPIRANTES_2027_SUBREFERENTE_${safeName}.pdf`);

  await writePdf(html, output);
  return output;
};
