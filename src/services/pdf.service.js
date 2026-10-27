const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fichasService = require('./fichas.service');
const { orderAspirantsForDisplay } = require('../utils/aspirantes-order');

function resolveFilePath(p) {
  if (!p) return null;
  const direct = path.resolve(p);
  if (fs.existsSync(direct)) return direct;
  const normalized = String(p).replace(/\\/g,'/');
  const storageIndex = normalized.toLowerCase().lastIndexOf('/storage/');
  if (storageIndex >= 0) {
    const portable = path.resolve(normalized.slice(storageIndex + 1));
    if (fs.existsSync(portable)) return portable;
  }
  return null;
}
function fileUrl(p) {
  const resolved = resolveFilePath(p);
  if (!resolved) {
    // SVG placeholder as data URI
    return 'data:image/svg+xml;base64,' + Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200"><rect width="100%" height="100%" fill="#9d2c28"/><text x="50%" y="52%" text-anchor="middle" font-family="Arial" font-size="18" fill="white">SIN FOTO</text></svg>`
    ).toString('base64');
  }
  const mimeByExtension = {
    '.jpg':'image/jpeg',
    '.jpeg':'image/jpeg',
    '.png':'image/png',
    '.webp':'image/webp',
    '.gif':'image/gif'
  };
  const mime = mimeByExtension[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(resolved).toString('base64')}`;
}
function webPhotoUrl(p) {
  if (!p) return fileUrl(null);
  const normalized = String(p).replace(/\\/g,'/');
  const storageIndex = normalized.toLowerCase().lastIndexOf('/storage/');
  if (storageIndex >= 0) return normalized.slice(storageIndex);
  if (normalized.toLowerCase().startsWith('storage/')) return '/' + normalized;
  return fileUrl(null);
}
function yn(v){ return v === 1 || v === '1' ? 'SÍ' : v === 0 || v === '0' ? 'NO' : ''; }
function lastUpdated(value) {
  if (!value) return 'SIN ACTUALIZAR';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : String(value);
}

function fullName(item) {
  if (!item) return '';
  return [item.nombre,item.apellido_paterno,item.apellido_materno].filter(Boolean).join(' ') || item.nombre_completo || '';
}

function decorateActor(item) {
  if (!item) return null;
  return {
    ...item,
    nombre_completo: fullName(item),
    partido: item.partido_id === 'OTRO' ? (item.partido_otro || 'OTRO') : (item.partido || item.partido_id || ''),
    referente_completo: item.referente_completo || [item.referente_nombre,item.referente_apellido_paterno,item.referente_apellido_materno].filter(Boolean).join(' ')
  };
}

const territoryTypes = {
  COTS: 'ENLACE DISTRITAL COTS',
  SN: 'SERVIDORES DE LA NACIÓN',
  SP: 'SERVIDORES DEL PUEBLO'
};

async function renderTemplate(ficha,{includeHoja2=true,photo=fileUrl,showPageNumbers=true}={}) {
  const template = path.resolve('./templates/ficha-municipal/page1.ejs');
  const displayFicha = {
    ...ficha,
    aspirantes: orderAspirantsForDisplay(ficha.aspirantes, ficha.presidencia)
  };
  return ejs.renderFile(template,{ficha:displayFicha,photo,yn,lastUpdated,includeHoja2,showPageNumbers},{async:false});
}

async function render({municipioId,officeId,includeHoja2=true,photo=fileUrl,showPageNumbers=true}) {
  const ficha = fichasService.getFicha(municipioId,officeId);
  const html = await renderTemplate(ficha,{includeHoja2,photo,showPageNumbers});
  return { ficha, html };
}

exports.renderPreview = async ({municipioId,officeId}) => {
  const { html } = await render({municipioId,officeId,includeHoja2:false,photo:webPhotoUrl});
  return html;
};

exports.renderDraftPreview = async ({municipioId,officeId,payload}) => {
  const current = fichasService.getFicha(municipioId,officeId);
  const diputacionesFederales = (payload.diputacionesFederales || (payload.diputacionFederal ? [payload.diputacionFederal] : [])).map(decorateActor);
  const diputacionesLocales = (payload.diputacionesLocales || (payload.diputacionLocal ? [payload.diputacionLocal] : [])).map(decorateActor);
  const draft = {
    ...current,
    grupo_politico: payload.grupo_politico || '',
    grupo_politico_imagen_path: payload.grupo_politico_imagen_path || '',
    grupos_presencia: (payload.grupos_presencia || []).map(item => ({
      ...item,
      actor_politico: item.actor_politico || '',
      grupo_nombre: item.grupo_nombre || '',
      imagen_path: item.imagen_path || ''
    })),
    presidencia: decorateActor(payload.presidencia),
    diputacionFederal: diputacionesFederales[0] || null,
    diputacionLocal: diputacionesLocales[0] || null,
    diputacionesFederales,
    diputacionesLocales,
    lideres: (payload.lideres || []).map(decorateActor),
    aspirantes: (payload.aspirantes || []).map(decorateActor),
    territorio: (payload.territorio || []).map(item => ({
      ...decorateActor(item),
      tipo_personal: item.tipo_personal || territoryTypes[item.tipo_personal_id] || ''
    })),
    personal_coordinacion: (payload.personal_coordinacion || current.personal_coordinacion || []).map(item => ({
      ...item,
      nombre: normalizePersonName(item.nombre || item.nombre_completo || ''),
      cargo: normalizeText(item.cargo || ''),
      coordinacion_general: normalizeText(item.coordinacion_general || ''),
      region: normalizeText(item.region || ''),
      telefono: normalizeText(item.telefono || '')
    }))
  };
  return renderTemplate(draft,{includeHoja2:false,photo:webPhotoUrl});
};

async function htmlToPdfBytes(html,browser) {
  const page = await browser.newPage();
  try {
    await page.setContent(html,{waitUntil:'networkidle0'});
    await page.evaluate(async () => {
      await Promise.all(Array.from(document.images).map(image => {
        if (image.complete) return Promise.resolve();
        return new Promise(resolve => {
          image.addEventListener('load',resolve,{once:true});
          image.addEventListener('error',resolve,{once:true});
        });
      }));
    });
    return await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:0,right:0,bottom:0,left:0}});
  } finally {
    await page.close();
  }
}

async function appendFicha(finalPdf,ficha,browser) {
  const html = await renderTemplate(ficha,{includeHoja2:false,photo:fileUrl,showPageNumbers:false});
  const basePdfBytes = await htmlToPdfBytes(html,browser);
  const basePdf = await PDFDocument.load(basePdfBytes);
  const basePages = await finalPdf.copyPages(basePdf,basePdf.getPageIndices());
  basePages.forEach(page => finalPdf.addPage(page));

  for (const attachment of ficha.hojas || []) {
    const attachmentPath = resolveFilePath(attachment.ruta);
    if (!attachmentPath) throw Object.assign(new Error(`NO SE ENCONTRÓ EL ANEXO: ${attachment.nombre_original}`),{status:400});
    const bytes = fs.readFileSync(attachmentPath);
    const extension = path.extname(attachmentPath).toLowerCase();
    if (attachment.mime_type === 'application/pdf' || extension === '.pdf') {
      let sourcePdf;
      try { sourcePdf = await PDFDocument.load(bytes); }
      catch { throw Object.assign(new Error(`NO SE PUDO LEER EL PDF: ${attachment.nombre_original}. VERIFICA QUE NO ESTÉ PROTEGIDO.`),{status:400}); }
      const pages = await finalPdf.copyPages(sourcePdf,sourcePdf.getPageIndices());
      pages.forEach(page => finalPdf.addPage(page));
      continue;
    }

    const image = extension === '.png' || attachment.mime_type === 'image/png'
      ? await finalPdf.embedPng(bytes)
      : await finalPdf.embedJpg(bytes);
    const page = finalPdf.addPage([595.28,841.89]);
    const margin = 18;
    const scale = Math.min((page.getWidth()-margin*2)/image.width,(page.getHeight()-margin*2)/image.height);
    const width = image.width*scale;
    const height = image.height*scale;
    page.drawImage(image,{x:(page.getWidth()-width)/2,y:(page.getHeight()-height)/2,width,height});
  }
}

function hasInformation(ficha) {
  return Boolean(ficha.presidencia || ficha.diputacionFederal || ficha.diputacionLocal || ficha.lideres.length || ficha.aspirantes.length || ficha.territorio.length || ficha.personal_coordinacion?.length || ficha.grupo_politico || ficha.grupo_politico_imagen_path || ficha.grupos_presencia?.length || ficha.hojas.length);
}

async function addConsecutiveFooters(pdf,pageUpdates=[]) {
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  pages.forEach((page,index) => {
    const label = `${index+1}`;
    const width = 24;
    const height = 22;
    const x = page.getWidth()-width-12;
    page.drawRectangle({x,y:0,width,height,color:rgb(0.60,0.10,0.27),opacity:0.96});
    const textWidth = font.widthOfTextAtSize(label,8);
    page.drawText(label,{x:x+(width-textWidth)/2,y:7,size:8,font,color:rgb(1,1,1)});
    if (pageUpdates[index]) {
      const updatedLabel = `ÚLTIMA ACTUALIZACIÓN: ${lastUpdated(pageUpdates[index])}`;
      const updatedWidth = font.widthOfTextAtSize(updatedLabel,6.5);
      page.drawRectangle({x:10,y:0,width:updatedWidth+12,height:18,color:rgb(1,1,1),opacity:0.92});
      page.drawText(updatedLabel,{x:16,y:6,size:6.5,font,color:rgb(0.35,0.38,0.42)});
    }
  });
}

exports.generate = async ({municipioId,officeId}) => {
  const ficha = fichasService.getFicha(municipioId,officeId);
  fs.mkdirSync(path.resolve('./storage/pdfs'),{recursive:true});
  const safe = ficha.municipio.nombre.replace(/[^\p{L}\p{N}_-]+/gu,'_');
  const out = path.resolve(`./storage/pdfs/${safe}.pdf`);
  const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
  const finalPdf = await PDFDocument.create();
  const pageUpdates = [];
  const firstPage = finalPdf.getPageCount();
  try { await appendFicha(finalPdf,ficha,browser); }
  finally { await browser.close(); }
  for (let index=firstPage; index<finalPdf.getPageCount(); index++) pageUpdates[index]=ficha.ultima_actualizacion;
  await addConsecutiveFooters(finalPdf,pageUpdates);

  fs.writeFileSync(out,await finalPdf.save());
  return out;
};

exports.generateGeneral = async ({municipioIds,officeId}) => {
  const fichas = municipioIds.map(id => fichasService.getFicha(id,officeId)).filter(hasInformation);
  if (!fichas.length) throw Object.assign(new Error('SELECCIONA AL MENOS UN MUNICIPIO CON INFORMACIÓN'),{status:400});
  fs.mkdirSync(path.resolve('./storage/pdfs'),{recursive:true});
  const out = path.resolve('./storage/pdfs/FICHAS_MUNICIPALES_GENERAL.pdf');
  const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
  const finalPdf = await PDFDocument.create();
  const pageUpdates = [];
  try {
    for (const ficha of fichas) {
      const firstPage = finalPdf.getPageCount();
      await appendFicha(finalPdf,ficha,browser);
      for (let index=firstPage; index<finalPdf.getPageCount(); index++) pageUpdates[index]=ficha.ultima_actualizacion;
    }
  } finally { await browser.close(); }
  await addConsecutiveFooters(finalPdf,pageUpdates);
  fs.writeFileSync(out,await finalPdf.save());
  return out;
};
