const ExcelJS = require('exceljs');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const fichasService = require('./fichas.service');

const COLORS = {
  primary: 'FF9F123F',
  green: 'FF003B34',
  soft: 'FFF2F2F2',
  white: 'FFFFFFFF',
  border: 'FFB8B8B8'
};

function yesNo(value) {
  if (value === 1 || value === '1') return 'SÍ';
  if (value === 0 || value === '0') return 'NO';
  return 'SIN DATO';
}

function formatLastUpdate(value) {
  if (!value) return 'SIN ACTUALIZAR';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : String(value);
}

function resolvePhoto(photoPath) {
  if (!photoPath) return null;
  const direct = path.resolve(photoPath);
  if (fs.existsSync(direct)) return direct;
  const normalized = String(photoPath).replace(/\\/g,'/');
  const marker = normalized.toLowerCase().lastIndexOf('/storage/');
  if (marker >= 0) {
    const portable = path.resolve(normalized.slice(marker + 1));
    if (fs.existsSync(portable)) return portable;
  }
  return null;
}

function styleSheet(sheet) {
  sheet.views = [{state:'frozen',ySplit:1}];
  sheet.autoFilter = {from:{row:1,column:1},to:{row:1,column:sheet.columnCount}};
  const header = sheet.getRow(1);
  header.height = 24;
  header.eachCell(cell => {
    cell.font = {bold:true,color:{argb:COLORS.white}};
    cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:COLORS.green}};
    cell.alignment = {vertical:'middle',horizontal:'center',wrapText:true};
    cell.border = {bottom:{style:'thin',color:{argb:COLORS.border}}};
  });
  sheet.eachRow((row,rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = {vertical:'middle',wrapText:true};
    if (rowNumber % 2 === 0) {
      row.eachCell(cell => { cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:COLORS.soft}}; });
    }
  });
}

function addPhoto(workbook,sheet,row,photoPath,columnNumber=2) {
  const file = resolvePhoto(photoPath);
  if (!file) return;
  const extension = path.extname(file).toLowerCase();
  if (!['.jpg','.jpeg','.png'].includes(extension)) return;
  const imageId = workbook.addImage({filename:file,extension:extension === '.png' ? 'png' : 'jpeg'});
  sheet.addImage(imageId,{
    tl:{col:columnNumber-1+0.12,row:row.number-1+0.12},
    ext:{width:44,height:52},
    editAs:'oneCell'
  });
  row.height = 43;
}

async function addCompressedPhoto(workbook,sheet,row,photoPath,cache,columnNumber) {
  const file = resolvePhoto(photoPath);
  if (!file) return;
  let imagePromise = cache.get(file);
  if (!imagePromise) {
    imagePromise = sharp(file)
      .rotate()
      .resize(120,150,{fit:'cover',position:'attention',withoutEnlargement:true})
      .jpeg({quality:68,progressive:true})
      .toBuffer()
      .then(thumbnail => workbook.addImage({buffer:thumbnail,extension:'jpeg'}));
    cache.set(file,imagePromise);
  }
  const imageId = await imagePromise;
  sheet.addImage(imageId,{
    tl:{col:columnNumber-1+0.12,row:row.number-1+0.12},
    ext:{width:44,height:55},
    editAs:'oneCell'
  });
  row.height = Math.max(row.height || 0,44);
}

function actorRows(items) {
  return items.filter(Boolean).map((actor,index) => ({
    numero:index+1,
    foto:'',
    nombre:actor.nombre_completo || '',
    partido:actor.partido || '',
    referente:actor.referente_completo || '',
    subreferente:actor.subreferente || actor.subreferente_texto || '',
    puede_reelegirse:yesNo(actor.puede_reelegirse),
    pretende_reelegirse:yesNo(actor.pretende_reelegirse),
    podria_ganar:yesNo(actor.podria_ganar_eleccion),
    observaciones:actor.observaciones || '',
    _foto_path:actor.foto_path
  }));
}

function addActorSheet(workbook,name,items,{includeDecisions=false,includeParty=true,includeReference=true,includeSubreference=false}={}) {
  const sheet = workbook.addWorksheet(name,{properties:{defaultRowHeight:20}});
  const columns = [
    {header:'NÚM.',key:'numero',width:8},
    {header:'FOTO',key:'foto',width:10},
    {header:'NOMBRE COMPLETO',key:'nombre',width:38}
  ];
  if (includeParty) columns.push({header:'PARTIDO',key:'partido',width:18});
  if (includeReference) columns.push({header:'REFERENTE',key:'referente',width:34});
  if (includeSubreference) columns.push({header:'SUBREFERENTE',key:'subreferente',width:34});
  if (includeDecisions) columns.push(
    {header:'PUEDE REELEGIRSE',key:'puede_reelegirse',width:18},
    {header:'PRETENDE REELEGIRSE',key:'pretende_reelegirse',width:20},
    {header:'PODRÍA GANAR ELECCIÓN',key:'podria_ganar',width:22},
    {header:'OBSERVACIONES',key:'observaciones',width:45}
  );
  sheet.columns = columns;
  actorRows(items).forEach(data => {
    const row = sheet.addRow(data);
    addPhoto(workbook,sheet,row,data._foto_path);
  });
  styleSheet(sheet);
  return sheet;
}

exports.generate = async ({municipioId,officeId}) => {
  const ficha = fichasService.getFicha(municipioId,officeId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de Fichas Municipales';
  workbook.created = new Date();
  workbook.modified = new Date();

  const summary = workbook.addWorksheet('Resumen');
  summary.columns = [{header:'CAMPO',key:'field',width:34},{header:'INFORMACIÓN',key:'value',width:75}];
  [
    ['Municipio',ficha.municipio.nombre],
    ['Clave municipal',ficha.municipio.cve_municipio || ficha.municipio.clave || ficha.municipio.id || municipioId],
    ['Estatus',ficha.estatus],
    ['Número de actualizaciones',ficha.revision],
    ['Última actualización',formatLastUpdate(ficha.ultima_actualizacion)],
    ['Grupo político dominante',ficha.grupo_politico || ''],
    ['Fecha de exportación',new Date().toLocaleString('es-MX')]
  ].forEach(([field,value]) => summary.addRow({field,value}));
  styleSheet(summary);
  summary.getRow(2).font = {bold:true,color:{argb:COLORS.primary}};

  const publicFunctions = [
    ficha.presidencia && {...ficha.presidencia,tipo_cargo:'PRESIDENCIA MUNICIPAL'},
    ...(ficha.diputacionesFederales || (ficha.diputacionFederal ? [ficha.diputacionFederal] : [])).map(actor=>({...actor,tipo_cargo:'DIPUTACIÓN FEDERAL'})),
    ...(ficha.diputacionesLocales || (ficha.diputacionLocal ? [ficha.diputacionLocal] : [])).map(actor=>({...actor,tipo_cargo:'DIPUTACIÓN LOCAL'}))
  ].filter(Boolean);
  addActorSheet(workbook,'Funciones públicas',publicFunctions,{includeDecisions:true});
  const functionsSheet = workbook.getWorksheet('Funciones públicas');
  functionsSheet.spliceColumns(
    3,0,
    ['CARGO',...publicFunctions.map(actor=>actor.tipo_cargo)],
    ['DISTRITO',...publicFunctions.map(actor=>actor.distrito || actor.distrito_texto || '')]
  );
  functionsSheet.getColumn(3).width = 26;
  functionsSheet.getColumn(4).width = 30;
  styleSheet(functionsSheet);

  addActorSheet(workbook,'Líderes',ficha.lideres,{includeParty:false,includeReference:true});
  const presenceGroups = workbook.addWorksheet('Grupos con presencia');
  presenceGroups.columns = [
    {header:'NÚM.',key:'numero',width:8},
    {header:'IMAGEN',key:'foto',width:10},
    {header:'ACTOR POLÍTICO',key:'actor',width:42},
    {header:'NOMBRE DEL GRUPO',key:'grupo',width:48}
  ];
  (ficha.grupos_presencia || []).forEach((group,index) => {
    const row = presenceGroups.addRow({numero:index+1,foto:'',actor:group.actor_politico || '',grupo:group.grupo_nombre || ''});
    addPhoto(workbook,presenceGroups,row,group.imagen_path);
  });
  styleSheet(presenceGroups);
  addActorSheet(workbook,'Aspirantes 2027',ficha.aspirantes,{includeParty:true,includeReference:true,includeSubreference:true});

  const territory = workbook.addWorksheet('Personal en territorio');
  territory.columns = [
    {header:'NÚM.',key:'numero',width:8},
    {header:'FOTO',key:'foto',width:10},
    {header:'NOMBRE COMPLETO',key:'nombre',width:38},
    {header:'TIPO DE PERSONAL',key:'tipo',width:30},
    {header:'CARGO / FUNCIÓN',key:'cargo_funcion',width:30},
    {header:'REFERENTE',key:'referente',width:34}
  ];
  ficha.territorio.forEach((person,index) => {
    const row = territory.addRow({numero:index+1,foto:'',nombre:person.nombre_completo || '',tipo:person.tipo_personal || '',cargo_funcion:person.cargo_funcion || person.cargo_funcion_texto || '',referente:person.referente_completo || ''});
    addPhoto(workbook,territory,row,person.foto_path);
  });
  styleSheet(territory);

  const attachments = workbook.addWorksheet('Anexos');
  attachments.columns = [
    {header:'NÚM.',key:'numero',width:8},
    {header:'ARCHIVO',key:'nombre',width:48},
    {header:'TIPO',key:'tipo',width:24},
    {header:'RUTA LOCAL',key:'ruta',width:75}
  ];
  ficha.hojas.forEach((file,index) => attachments.addRow({numero:index+1,nombre:file.nombre_original || '',tipo:file.mime_type || '',ruta:file.ruta || ''}));
  styleSheet(attachments);

  return {ficha,buffer:await workbook.xlsx.writeBuffer()};
};

exports.generateGeneral = async ({municipioIds,officeId,includePhotos=false}) => {
  if (!Array.isArray(municipioIds) || !municipioIds.length) {
    throw Object.assign(new Error('SELECCIONA AL MENOS UN MUNICIPIO CON INFORMACIÓN'),{status:400});
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de Fichas Municipales';
  workbook.created = new Date();
  workbook.modified = new Date();
  const sheet = workbook.addWorksheet('Reporte general',{properties:{defaultRowHeight:22}});
  sheet.columns = [
    {header:'MUNICIPIO',key:'municipio',width:34},
    {header:'CLAVE MUNICIPAL',key:'clave',width:17},
    {header:'ESTATUS',key:'estatus',width:16},
    {header:'NÚMERO DE ACTUALIZACIONES',key:'revision',width:25},
    {header:'ÚLTIMA ACTUALIZACIÓN',key:'ultima_actualizacion',width:22},
    {header:'BLOQUE',key:'bloque',width:28},
    {header:'CARGO / TIPO',key:'cargo',width:30},
    {header:'CARGO / FUNCIÓN',key:'cargo_funcion',width:30},
    {header:'DISTRITO',key:'distrito',width:30},
    {header:'NÚM.',key:'numero',width:8},
    {header:'NOMBRE COMPLETO',key:'nombre',width:38},
    {header:'PARTIDO',key:'partido',width:18},
    {header:'REFERENTE',key:'referente',width:34},
    {header:'SUBREFERENTE',key:'subreferente',width:34},
    {header:'PUEDE REELEGIRSE',key:'puede_reelegirse',width:18},
    {header:'PRETENDE REELEGIRSE',key:'pretende_reelegirse',width:20},
    {header:'PODRÍA GANAR ELECCIÓN',key:'podria_ganar',width:22},
    {header:'OBSERVACIONES',key:'observaciones',width:42},
    {header:'GRUPO POLÍTICO DOMINANTE',key:'grupo_politico',width:34},
    {header:'GRUPO CON PRESENCIA',key:'grupo_presencia',width:38},
    {header:includePhotos ? 'FOTO' : 'TIENE FOTO',key:'tiene_foto',width:includePhotos ? 11 : 13},
    {header:'ARCHIVO ANEXO',key:'anexo',width:46},
    {header:'TIPO DE ANEXO',key:'tipo_anexo',width:22}
  ];

  const photoEntries = [];
  for (const municipioId of municipioIds) {
    const ficha = fichasService.getFicha(municipioId,officeId);
    const base = {
      municipio:ficha.municipio.nombre,
      clave:ficha.municipio.cve_municipio || ficha.municipio.clave || ficha.municipio.id || municipioId,
      estatus:ficha.estatus,
      revision:ficha.revision,
      ultima_actualizacion:formatLastUpdate(ficha.ultima_actualizacion),
      grupo_politico:ficha.grupo_politico || ''
    };
    let municipalityRows = 0;
    const addActor = (bloque,cargo,actor,numero,{decisions=false,reference=true}={}) => {
      if (!actor) return;
      const row = sheet.addRow({
        ...base,bloque,cargo,cargo_funcion:actor.cargo_funcion || actor.cargo_funcion_texto || '',distrito:actor.distrito || actor.distrito_texto || '',numero,
        nombre:actor.nombre_completo || '',
        partido:actor.partido || '',
        referente:reference ? (actor.referente_completo || '') : '',
        subreferente:actor.subreferente || actor.subreferente_texto || '',
        puede_reelegirse:decisions ? yesNo(actor.puede_reelegirse) : '',
        pretende_reelegirse:decisions ? yesNo(actor.pretende_reelegirse) : '',
        podria_ganar:decisions ? yesNo(actor.podria_ganar_eleccion) : '',
        observaciones:actor.observaciones || '',
        tiene_foto:includePhotos && actor.foto_path ? '' : (actor.foto_path ? 'SÍ' : 'NO')
      });
      if (includePhotos && actor.foto_path) photoEntries.push({row,photoPath:actor.foto_path});
      municipalityRows += 1;
    };

    addActor('FUNCIONES PÚBLICAS','PRESIDENCIA MUNICIPAL',ficha.presidencia,1,{decisions:true});
    (ficha.diputacionesFederales || (ficha.diputacionFederal ? [ficha.diputacionFederal] : [])).forEach((actor,index)=>addActor('FUNCIONES PÚBLICAS','DIPUTACIÓN FEDERAL',actor,index+1));
    (ficha.diputacionesLocales || (ficha.diputacionLocal ? [ficha.diputacionLocal] : [])).forEach((actor,index)=>addActor('FUNCIONES PÚBLICAS','DIPUTACIÓN LOCAL',actor,index+1));
    if (ficha.grupo_politico || ficha.grupo_politico_imagen_path) {
      const row = sheet.addRow({...base,bloque:'INFLUENCIA',cargo:'GRUPO POLÍTICO DOMINANTE',numero:1,nombre:ficha.grupo_politico || '',tiene_foto:includePhotos && ficha.grupo_politico_imagen_path ? '' : (ficha.grupo_politico_imagen_path ? 'SÍ' : 'NO')});
      if (includePhotos && ficha.grupo_politico_imagen_path) photoEntries.push({row,photoPath:ficha.grupo_politico_imagen_path});
      municipalityRows += 1;
    }
    (ficha.grupos_presencia || []).forEach((group,index) => {
      const row = sheet.addRow({...base,bloque:'INFLUENCIA',cargo:'GRUPO CON PRESENCIA',numero:index+1,nombre:group.actor_politico || '',grupo_presencia:group.grupo_nombre || '',tiene_foto:includePhotos && group.imagen_path ? '' : (group.imagen_path ? 'SÍ' : 'NO')});
      if (includePhotos && group.imagen_path) photoEntries.push({row,photoPath:group.imagen_path});
      municipalityRows += 1;
    });
    ficha.lideres.forEach((actor,index) => addActor('INFLUENCIA','LÍDER',actor,index+1));
    ficha.aspirantes.forEach((actor,index) => addActor('ASPIRANTES 2027','ASPIRANTE',actor,index+1));
    ficha.territorio.forEach((actor,index) => addActor('PERSONAL EN TERRITORIO',actor.tipo_personal || '',actor,index+1));
    ficha.hojas.forEach((file,index) => {
      sheet.addRow({...base,bloque:'ANEXOS',cargo:'ARCHIVO ADJUNTO',numero:index+1,anexo:file.nombre_original || '',tipo_anexo:file.mime_type || ''});
      municipalityRows += 1;
    });
    if (!municipalityRows) sheet.addRow({...base,bloque:'RESUMEN MUNICIPAL',cargo:'SIN REGISTROS DETALLADOS'});
  }

  if (includePhotos && photoEntries.length) {
    const photoCache = new Map();
    for (let index=0; index<photoEntries.length; index+=4) {
      await Promise.all(photoEntries.slice(index,index+4).map(entry =>
        addCompressedPhoto(workbook,sheet,entry.row,entry.photoPath,photoCache,19)
      ));
    }
  }

  styleSheet(sheet);
  sheet.views = [{state:'frozen',xSplit:2,ySplit:1}];
  sheet.pageSetup = {orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
  sheet.headerFooter.oddFooter = '&LReporte general de fichas municipales&C&P de &N&R&D';
  return {buffer:await workbook.xlsx.writeBuffer()};
};
