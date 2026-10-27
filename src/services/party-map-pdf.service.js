'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ejs=require('ejs');
const puppeteer=require('puppeteer');
const mapService=require('./reportes-mapa.service');
const {buildMapSvg}=require('./reference-map-pdf.service');
function logoDataUri(url){
 const file=path.resolve('./public',String(url||'').replace(/^\/+/,''));
 if(!url||!fs.existsSync(file))return '';
 return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
}
const withEmbeddedLogos=party=>({...party,logos:(party.logos||[]).map(logoDataUri).filter(Boolean)});

async function render({officeId,key}){
 const party=withEmbeddedLogos(mapService.getParty(officeId,key));
 const municipalities=mapService.list(officeId);
 const mapSvg=buildMapSvg(municipalities,party.municipios.map(item=>item.municipio_id),party.color||'#AEB6C1');
 return ejs.renderFile(path.resolve('./templates/reportes/party-map.ejs'),{party,mapSvg,generatedAt:new Intl.DateTimeFormat('es-MX',{dateStyle:'long',timeStyle:'short'}).format(new Date())});
}
async function renderGeneral({officeId}){
 const data=mapService.listParties(officeId);
 const municipalities=mapService.list(officeId);
 const colorByMunicipality=new Map();
 const detailsByMunicipality=new Map();
 data.partidos.forEach(party=>party.municipios.forEach(municipality=>{
  colorByMunicipality.set(municipality.municipio_id,party.color||'#AEB6C1');
  detailsByMunicipality.set(municipality.municipio_id,{...municipality,partido:party.nombre,color:party.color||'#AEB6C1',logos:(party.logos||[]).map(logoDataUri).filter(Boolean)});
 }));
 const rows=municipalities.map(municipality=>detailsByMunicipality.get(municipality.municipio_id)||{
  ...municipality,
  partido:'SIN PARTIDO',
  presidencia:'',
  color:'#AEB6C1',
  logos:[]
 });
 rows.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
 const mapSvg=buildMapSvg(municipalities,[...colorByMunicipality.keys()],row=>colorByMunicipality.get(row.municipio_id)||'#AEB6C1');
 return ejs.renderFile(path.resolve('./templates/reportes/party-map-general.ejs'),{parties:data.partidos.map(withEmbeddedLogos),rows,mapSvg,covered:data.resumen.municipios_con_partido,pending:data.resumen.municipios_sin_partido,generatedAt:new Intl.DateTimeFormat('es-MX',{dateStyle:'long',timeStyle:'short'}).format(new Date())});
}
async function writePdf(html,output){
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();page.setDefaultNavigationTimeout(120000);page.setDefaultTimeout(120000);await page.emulateMediaType('print');await page.setContent(html,{waitUntil:'domcontentloaded',timeout:120000});await page.pdf({path:output,printBackground:true,preferCSSPageSize:true,margin:{top:0,right:0,bottom:0,left:0},timeout:120000});}
 finally{await browser.close()}
}
exports.renderPreview=render;
exports.renderGeneralPreview=renderGeneral;
exports.generate=async({officeId,key})=>{
 const party=mapService.getParty(officeId,key),html=await render({officeId,key});
 const directory=path.resolve('./storage/pdfs');fs.mkdirSync(directory,{recursive:true});
 const safe=party.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').toUpperCase();
 const output=path.join(directory,`MAPA_PARTIDO_${safe||'SIN_PARTIDO'}.pdf`);
 await writePdf(html,output);
 return output;
};
exports.generateGeneral=async({officeId})=>{
 const html=await renderGeneral({officeId});
 const directory=path.resolve('./storage/pdfs');fs.mkdirSync(directory,{recursive:true});
 const output=path.join(directory,'MAPA_GENERAL_PARTIDOS.pdf');
 await writePdf(html,output);
 return output;
};
