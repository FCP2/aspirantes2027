let municipios=[],selectedMunicipioId=null,ficha=null,currentModal=null,isDirty=false,draftPreviewTimer=null,draftPreviewController=null,previewRequestNumber=0;
const selectedGeneralMunicipios=new Set();
let generatingMunicipalPdf=false;
let generatingMunicipalExcel=false;
const pendingFileOperations=new Set();
const tiposTerritorio={COTS:'ENLACE DISTRITAL COTS',SN:'SERVIDORES DE LA NACIÓN',SP:'SERVIDORES DEL PUEBLO'};
const partidoOptions=['MORENA','PRI','PAN','PVEM','PT','MC'];
const deputyDirectoryCache={FEDERAL:null,LOCAL:null};
let directoryManagerType=null,directoryManagerRecords=[];
let actorStatuses=new Map(),actorStatusGeneration=0;

const $=id=>document.getElementById(id);
const upper=s=>String(s||'').toLocaleUpperCase('es-MX').trim().replace(/\s+/g,' ');
const cleanText=s=>String(s||'').trim().replace(/\s+/g,' ');
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const lowerNameWords=new Set(['de','del','la','las','los','y','e','da','das','do','dos']);
const uppercaseNameExceptions=new Set(['HDO','IMM','PRI','PRD','PAN','PVEM','PT','MC','MORENA','COTS','INE','IEEM','DIF','IMSS','ISSSTE','UAEM','SNTE','CNTE','SUTEYM','PES','RSP','FXM']);
function setPreviewHidden(hidden){
 const workspace=document.querySelector('.workspace'),hideButton=$('togglePreview'),showButton=$('showPreviewTab');
 workspace.classList.toggle('preview-hidden',hidden);hideButton.setAttribute('aria-pressed',String(hidden));showButton.setAttribute('aria-pressed',String(hidden));showButton.classList.toggle('hidden',!hidden);
 try{localStorage.setItem('fichas.previewHidden',hidden?'1':'0')}catch(_){ }
 if(!hidden)requestAnimationFrame(fitPreview);
}
$('togglePreview').onclick=()=>setPreviewHidden(!document.querySelector('.workspace').classList.contains('preview-hidden'));
$('showPreviewTab').onclick=()=>setPreviewHidden(false);
try{setPreviewHidden(localStorage.getItem('fichas.previewHidden')==='1')}catch(_){setPreviewHidden(false)}
function naturalName(value){return cleanText(value).split(' ').map((word,index)=>{const lower=word.toLocaleLowerCase('es-MX');if(index>0&&lowerNameWords.has(lower))return lower;return word.split('-').map(part=>{const partLower=part.toLocaleLowerCase('es-MX');if(uppercaseNameExceptions.has(part.toLocaleUpperCase('es-MX')))return part.toLocaleUpperCase('es-MX');return partLower.charAt(0).toLocaleUpperCase('es-MX')+partLower.slice(1)}).join('-')}).join(' ')}
const dictionaryKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX');
const nameDictionary=Array.isArray(window.NAME_DICTIONARY)?window.NAME_DICTIONARY:[];
const canonicalNames=new Map(nameDictionary.map(value=>[dictionaryKey(value),value]));
function editDistance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let previous=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const saved=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));previous=saved}}return row[b.length]}
function suggestNaturalName(value){let changed=false;const suggestion=naturalName(value).split(' ').map((word,index)=>{const key=dictionaryKey(word);const exact=canonicalNames.get(key);if(exact&&exact!==word){changed=true;return exact}if(index>0&&lowerNameWords.has(key)||key.length<6||!key)return word;const matches=nameDictionary.filter(candidate=>{const candidateKey=dictionaryKey(candidate);return candidateKey[0]===key[0]&&Math.abs(candidateKey.length-key.length)<=1&&editDistance(key,candidateKey)===1});if(matches.length===1&&matches[0]!==word){changed=true;return matches[0]}return word}).join(' ');return changed?suggestion:''}
function formatLastUpdate(value){if(!value)return'SIN ACTUALIZAR';const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);return match?`ACT. ${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`:`ACT. ${value}`}
function fullName(x){return [x?.nombre,x?.apellido_paterno,x?.apellido_materno].filter(Boolean).join(' ')}
const surnameParticles=new Set(['de','del','la','las','los','san','santa']);
function separatedPersonName(person){
 if(person?.apellido_paterno||person?.apellido_materno)return{nombre:person.nombre||'',apellido_paterno:person.apellido_paterno||'',apellido_materno:person.apellido_materno||''};
 const words=cleanText(person?.nombre||'').split(' ').filter(Boolean);
 if(words.length<2)return{nombre:words.join(' '),apellido_paterno:'',apellido_materno:''};
 if(words.length===2)return{nombre:words[0],apellido_paterno:words[1],apellido_materno:''};
 const maternal=words[words.length-1];
 const paternalCore=words.length-2;
 let paternalStart=paternalCore;
 while(paternalStart>0&&surnameParticles.has(words[paternalStart-1].toLocaleLowerCase('es-MX')))paternalStart--;
 if(paternalStart===0)paternalStart=paternalCore;
 return{nombre:words.slice(0,paternalStart).join(' '),apellido_paterno:words.slice(paternalStart,words.length-1).join(' '),apellido_materno:maternal};
}
function photoUrl(value){
 const normalized=String(value||'').replaceAll('\\','/');
 const marker=normalized.toLowerCase().lastIndexOf('/storage/');
 if(marker>=0)return normalized.slice(marker);
 return normalized.toLowerCase().startsWith('storage/')?`/${normalized}`:normalized;
}
function upperInputs(scope=document){
 scope.querySelectorAll('.upper').forEach(el=>el.addEventListener('input',()=>{el.value=el.value.toLocaleUpperCase('es-MX')}));
 scope.querySelectorAll('.natural-text').forEach(el=>el.addEventListener('blur',()=>{el.value=cleanText(el.value)}));
 scope.querySelectorAll('.person-name').forEach(input=>{
  if(input.dataset.nameAssistant)return;input.dataset.nameAssistant='1';input.spellcheck=false;
  const feedback=document.createElement('button');feedback.type='button';feedback.className='name-suggestion';feedback.hidden=true;input.insertAdjacentElement('afterend',feedback);
  input.addEventListener('input',()=>{feedback.hidden=true});
  input.addEventListener('blur',()=>{const formatted=naturalName(input.value);if(formatted!==input.value){input.value=formatted;input.dispatchEvent(new Event('input',{bubbles:true}))}const suggestion=suggestNaturalName(formatted);feedback.hidden=!suggestion;if(suggestion){feedback.textContent=`¿QUISISTE ESCRIBIR ${suggestion}?`;feedback.onclick=()=>{input.value=suggestion;feedback.hidden=true;input.dispatchEvent(new Event('input',{bubbles:true}))}}});
 });
}

function personEditor(prefix='p',data={},opts={party:true,ref:true,type:false,pres:false}){
 const customParty=Boolean(data.partido_otro||(data.partido_id&&!partidoOptions.includes(data.partido_id))||(data.partido&&!partidoOptions.includes(data.partido)));
 const customPartyName=data.partido_otro||(customParty?data.partido:'')||'';
 const party=opts.party?`<label>PARTIDO<select data-f="partido_id" class="input party-select"><option value="">SELECCIONAR</option>${partidoOptions.map(x=>`<option value="${x}" ${data.partido===x||data.partido_id===x?'selected':''}>${x}</option>`).join('')}<option value="OTRO" ${customParty?'selected':''}>OTRO</option></select></label><label class="party-other ${customParty?'':'hidden-field'}">OTRO PARTIDO<input data-f="partido_otro" class="input upper" value="${customPartyName}" placeholder="NOMBRE O SIGLAS"></label>`:'';
 const referenceListId=`referentes-${prefix}`;
 const ref=opts.ref?`<label class="reference-label ${opts.subref?'':'span2'}">REFERENTE<input data-f="referente_nombre" class="input person-name reference-input" list="${referenceListId}" autocomplete="off" value="${escapeHtml(data.referente_completo||data.referente_nombre||'')}" placeholder="Busca o escribe un referente"><input data-f="referente_persona_id" type="hidden" value="${escapeHtml(data.referente_persona_id||'')}"><datalist id="${referenceListId}" class="reference-options"></datalist><small class="field-hint">SELECCIONA UNO GUARDADO O ESCRIBE UNO NUEVO</small></label>`:'';
 const subref=opts.subref?`<label class="span2">SUBREFERENTE (OPCIONAL)<input data-f="subreferente" class="input person-name" value="${data.subreferente||data.subreferente_texto||''}" placeholder="Nombre del subreferente"></label>`:'';
 const type=opts.type?`<label>TIPO DE PERSONAL<select data-f="tipo_personal_id" class="input">${Object.entries(tiposTerritorio).map(([k,v])=>`<option value="${k}" ${(data.tipo_personal_id===k||data.tipo_personal===v)?'selected':''}>${v}</option>`).join('')}</select></label>`:'';
 const roleListId=`cargos-funcion-${prefix}`;
 const role=opts.type?`<label class="span2">CARGO / FUNCIÓN (OPCIONAL)<input data-f="cargo_funcion" class="input natural-text" list="${roleListId}" value="${escapeHtml(data.cargo_funcion||data.cargo_funcion_texto||'')}" placeholder="Ej. Enlace municipal"><datalist id="${roleListId}"><option value="Enlace municipal"></option><option value="Enlace estatal"></option><option value="Enlace distrital"></option><option value="Enlace regional"></option><option value="Coordinador"></option></datalist><small class="field-hint">SELECCIONA UNA SUGERENCIA O ESCRIBE OTRA FUNCIÓN</small></label>`:'';
 const directory=opts.directoryType?`<label class="span3">SELECCIONAR DEL DIRECTORIO DE DIPUTACIONES<select data-f="directorio_diputacion_id" class="input deputy-directory"><option value="">CARGANDO DIRECTORIO...</option></select><small class="field-hint">AL SELECCIONAR SE COMPLETAN NOMBRE Y DISTRITO</small></label>`:'';
 const personListId=`personas-${prefix}`;
 const personDictionary=opts.personDictionary?`<label class="span3">BUSCAR PERSONA EN DICCIONARIO<input class="input person-dictionary-input" list="${personListId}" autocomplete="off" value="" placeholder="Escribe el nombre para buscar"><datalist id="${personListId}" class="person-dictionary-options"></datalist><small class="field-hint">AL SELECCIONAR SE COMPLETAN NOMBRE, APELLIDOS Y FOTOGRAFÍA. TAMBIÉN PUEDES CAPTURAR MANUALMENTE.</small></label>`:'';
 const district=opts.district?`<label class="span2">DISTRITO<input data-f="distrito" class="input natural-text" value="${escapeHtml(data.distrito||data.distrito_texto||'')}" placeholder="Ej. Dtto. 1 Jilotepec" ${opts.directoryType?'readonly':''}></label>`:'';
 const nameFields=opts.directoryType
  ? `<label class="span3">NOMBRE COMPLETO<input data-f="nombre" class="input person-name" value="${escapeHtml(data.nombre_completo||fullName(data))}" readonly></label><input data-f="apellido_paterno" type="hidden" value=""><input data-f="apellido_materno" type="hidden" value="">`
  : `<label>NOMBRE<input data-f="nombre" class="input person-name" value="${data.nombre||''}"></label><label>APELLIDO PATERNO<input data-f="apellido_paterno" class="input person-name" value="${data.apellido_paterno||''}"></label><label>APELLIDO MATERNO<input data-f="apellido_materno" class="input person-name" value="${data.apellido_materno||''}"></label>`;
 const pres=opts.pres?`
  <label>PUEDE REELEGIRSE<select data-f="puede_reelegirse" class="input decision-select"><option value="">SIN DATO</option><option value="1" ${data.puede_reelegirse==1?'selected':''}>SÍ</option><option value="0" ${data.puede_reelegirse==0?'selected':''}>NO</option></select></label>
  <label>PRETENDE REELEGIRSE<select data-f="pretende_reelegirse" class="input decision-select"><option value="">SIN DATO</option><option value="1" ${data.pretende_reelegirse==1?'selected':''}>SÍ</option><option value="0" ${data.pretende_reelegirse==0?'selected':''}>NO</option></select></label>
  <label>PODRÍA GANAR ELECCIÓN<select data-f="podria_ganar_eleccion" class="input decision-select"><option value="">SIN DATO</option><option value="1" ${data.podria_ganar_eleccion==1?'selected':''}>SÍ</option><option value="0" ${data.podria_ganar_eleccion==0?'selected':''}>NO</option></select></label>
  <label class="span3">COALICIÓN Y SIGLADO<textarea data-f="observaciones" rows="3" class="input natural-text">${data.observaciones||''}</textarea></label>`:'';
 return `<div class="person-editor" data-editor="${prefix}">
   <div class="photo-col"><div class="photo-box">${data.foto_path?`<img src="${photoUrl(data.foto_path)}">`:'FOTO'}</div><input type="file" accept="image/jpeg,image/png" hidden><button type="button" class="button secondary smallbtn photoPick">CARGAR FOTO</button><button type="button" class="button danger-outline smallbtn photoRemove" ${data.foto_path?'':'disabled'}>QUITAR FOTO</button><input data-f="persona_id" type="hidden" value="${data.persona_id||''}"><input data-f="foto_path" type="hidden" value="${data.foto_path||''}"><input data-f="foto_eliminar" type="hidden" value="0"></div>
   <div class="form-grid">
    ${personDictionary}${directory}${nameFields}${party}${type}${role}${district}${ref}${subref}${pres}
   </div>
 </div>`;
}
function groupPresenceEditor(data={}){
 const imagePath=data.imagen_path||'';
 return `<div class="person-editor" data-editor="grupo-presencia">
   <div class="photo-col"><div class="photo-box">${imagePath?`<img src="${photoUrl(imagePath)}">`:'IMAGEN'}</div><input type="file" accept="image/jpeg,image/png" hidden><button type="button" class="button secondary smallbtn photoPick">CARGAR IMAGEN</button><button type="button" class="button danger-outline smallbtn photoRemove" ${imagePath?'':'disabled'}>QUITAR IMAGEN</button><input data-f="imagen_path" type="hidden" value="${escapeHtml(imagePath)}"><input data-f="foto_eliminar" type="hidden" value="0"></div>
   <div class="form-grid">
    <label class="span3">NOMBRE DEL ACTOR POLÍTICO<input data-f="actor_politico" class="input person-name" value="${escapeHtml(data.actor_politico||'')}" placeholder="Nombre completo"></label>
    <label class="span3">NOMBRE DEL GRUPO<input data-f="grupo_nombre" class="input natural-text" value="${escapeHtml(data.grupo_nombre||'')}" placeholder="Nombre del grupo con presencia"></label>
   </div>
  </div>`;
}
function coordinationEditor(data={}){
 const imagePath=data.foto_path||'';
 return `<div class="person-editor" data-editor="personal-coordinacion">
  <div class="photo-col"><div class="photo-box">${imagePath?`<img src="${photoUrl(imagePath)}">`:'FOTO'}</div><input type="file" accept="image/jpeg,image/png" hidden><button type="button" class="button secondary smallbtn photoPick">CARGAR FOTO</button><button type="button" class="button danger-outline smallbtn photoRemove" ${imagePath?'':'disabled'}>QUITAR FOTO</button><input data-f="foto_path" type="hidden" value="${escapeHtml(imagePath)}"><input data-f="foto_eliminar" type="hidden" value="0"></div>
  <div class="form-grid">
   <label class="span3">NOMBRE COMPLETO<input data-f="nombre" class="input person-name" value="${escapeHtml(data.nombre||data.nombre_completo||'')}" placeholder="Nombre del personal"></label>
   <label>CARGO / FUNCIÓN<input data-f="cargo" class="input natural-text" value="${escapeHtml(data.cargo||'')}" placeholder="Ej. Director de Gobierno"></label>
   <label>COORDINACIÓN GENERAL<input data-f="coordinacion_general" class="input natural-text" value="${escapeHtml(data.coordinacion_general||'')}" placeholder="Ej. Valle de Toluca"></label>
   <label>REGIÓN DE ATENCIÓN<input data-f="region" class="input natural-text" value="${escapeHtml(data.region||'')}" placeholder="Ej. Jilotepec"></label>
   <label>TELÉFONO<input data-f="telefono" class="input" type="tel" value="${escapeHtml(data.telefono||'')}" placeholder="Teléfono de contacto"></label>
  </div>
 </div>`;
}

function wirePhoto(scope){
 const btn=scope.querySelector('.photoPick'),removeBtn=scope.querySelector('.photoRemove'),input=scope.querySelector('input[type=file]'),box=scope.querySelector('.photo-box'),hidden=scope.querySelector('[data-f=foto_path],[data-f=imagen_path]'),removeFlag=scope.querySelector('[data-f=foto_eliminar]');
 if(!btn)return;
 btn.onclick=()=>input.click();
 input.onchange=async()=>{
  if(!input.files[0])return;
  btn.disabled=true;
  const operation=api.upload('/api/files/photo',input.files[0]);
  pendingFileOperations.add(operation);
  try{const x=await operation;hidden.value=x.path;removeFlag.value='0';box.innerHTML=`<img src="${photoUrl(x.path)}">`;removeBtn.disabled=false;markDirty()}
  catch(e){alert(e.message)}
  finally{pendingFileOperations.delete(operation);btn.disabled=false}
 };
 removeBtn.onclick=()=>{hidden.value='';removeFlag.value='1';input.value='';box.textContent='FOTO';removeBtn.disabled=true;markDirty()};
}
function wirePartyOther(scope){
 const select=scope.querySelector('.party-select'),field=scope.querySelector('.party-other');
 if(!select||!field)return;
 const toggle=()=>field.classList.toggle('hidden-field',select.value!=='OTRO');
 select.addEventListener('change',toggle);toggle();
}
function wireReferencePicker(scope){
 const input=scope.querySelector('.reference-input'),hidden=scope.querySelector('[data-f=referente_persona_id]'),list=scope.querySelector('.reference-options');
 if(!input||!hidden||!list)return;
 let timer=null,requestNumber=0,options=[];
 const matchSelection=()=>{const value=dictionaryKey(input.value);const match=options.find(item=>dictionaryKey(item.nombre_completo)===value);hidden.value=match?.id||''};
 const load=async()=>{
  const current=++requestNumber;
  try{
   options=await api.get(`/api/personas/referentes?q=${encodeURIComponent(cleanText(input.value))}`);
   if(current!==requestNumber)return;
   list.innerHTML=options.map(item=>`<option value="${escapeHtml(item.nombre_completo)}"></option>`).join('');
   matchSelection();
  }catch(_){if(current===requestNumber)list.innerHTML=''}
 };
 input.addEventListener('focus',load);
 input.addEventListener('input',()=>{matchSelection();if(timer)clearTimeout(timer);timer=setTimeout(load,180)});
 input.addEventListener('change',matchSelection);
}
async function wireDeputyDirectory(scope,type){
 const select=scope.querySelector('.deputy-directory');
 if(!select)return;
 const nameInput=scope.querySelector('[data-f=nombre]'),districtInput=scope.querySelector('[data-f=distrito]'),personIdInput=scope.querySelector('[data-f=persona_id]'),photoInput=scope.querySelector('[data-f=foto_path]'),photoBox=scope.querySelector('.photo-box'),photoRemove=scope.querySelector('.photoRemove');
 const currentName=dictionaryKey(nameInput.value),currentDistrict=dictionaryKey(districtInput.value);
 try{
  if(!deputyDirectoryCache[type])deputyDirectoryCache[type]=api.get(`/api/directorio/diputaciones?tipo=${type}`);
  const records=await deputyDirectoryCache[type];
  select.innerHTML=`<option value="">${records.length?'SELECCIONAR DIPUTACIÓN':'DIRECTORIO SIN IMPORTAR'}</option>${records.map(item=>`<option value="${item.id}">${escapeHtml(item.nombre_completo)} · ${escapeHtml(item.distrito)}</option>`).join('')}`;
  const current=records.find(item=>dictionaryKey(item.nombre_completo)===currentName&&dictionaryKey(item.distrito)===currentDistrict);
  if(current)select.value=current.id;
  select.onchange=()=>{const selected=records.find(item=>item.id===select.value);if(!selected)return;const changed=dictionaryKey(nameInput.value)!==dictionaryKey(selected.nombre_completo);if(changed){personIdInput.value='';photoInput.value='';photoBox.textContent='FOTO';photoRemove.disabled=true}nameInput.value=selected.nombre_completo;districtInput.value=selected.distrito;nameInput.dispatchEvent(new Event('input',{bubbles:true}));districtInput.dispatchEvent(new Event('input',{bubbles:true}))};
 }catch(error){select.innerHTML='<option value="">NO SE PUDO CARGAR EL DIRECTORIO</option>';select.title=error.message}
}
function wirePersonDictionary(scope){
 const input=scope.querySelector('.person-dictionary-input'),list=scope.querySelector('.person-dictionary-options');
 if(!input||!list)return;
 const personId=scope.querySelector('[data-f=persona_id]'),name=scope.querySelector('[data-f=nombre]'),lastName=scope.querySelector('[data-f=apellido_paterno]'),secondLastName=scope.querySelector('[data-f=apellido_materno]'),photoPath=scope.querySelector('[data-f=foto_path]'),removeFlag=scope.querySelector('[data-f=foto_eliminar]'),photoBox=scope.querySelector('.photo-box'),photoRemove=scope.querySelector('.photoRemove');
 let timer=null,requestNumber=0,options=[];
 const applySelection=()=>{
  const selected=options.find(item=>dictionaryKey(item.nombre_completo||fullName(item))===dictionaryKey(input.value));
  if(!selected)return false;
  const separated=separatedPersonName(selected);
  personId.value=selected.id;name.value=naturalName(separated.nombre);lastName.value=naturalName(separated.apellido_paterno);secondLastName.value=naturalName(separated.apellido_materno);
  photoPath.value=selected.foto_path||'';removeFlag.value='0';photoBox.innerHTML=selected.foto_path?`<img src="${photoUrl(selected.foto_path)}">`:'FOTO';photoRemove.disabled=!selected.foto_path;
  [name,lastName,secondLastName].forEach(field=>field.dispatchEvent(new Event('input',{bubbles:true})));
  return true;
 };
 const load=async()=>{
  const current=++requestNumber;
  try{
   const records=await api.get(`/api/personas/search?q=${encodeURIComponent(cleanText(input.value))}`);
   if(current!==requestNumber)return;
   options=records.map(item=>({...item,nombre_completo:fullName(item)}));
   list.innerHTML=options.map(item=>`<option value="${escapeHtml(item.nombre_completo)}">${item.foto_path?'CON FOTO':'SIN FOTO'}</option>`).join('');
   applySelection();
  }catch(_){if(current===requestNumber)list.innerHTML=''}
 };
 input.addEventListener('focus',load);
 input.addEventListener('input',()=>{if(timer)clearTimeout(timer);timer=setTimeout(load,180)});
 input.addEventListener('change',applySelection);
}
function editorData(scope){
 const o={};scope.querySelectorAll('[data-f]').forEach(el=>o[el.dataset.f]=el.value);
 if(scope.id==='presidenciaEditor'){
  o.referentes_principales=[...scope.querySelectorAll('.presidency-reference-row')]
   .map(row=>({
    referente_nombre:naturalName(row.querySelector('.reference-input')?.value||''),
    referente_persona_id:row.querySelector('[data-f="referente_persona_id"]')?.value||''
   }))
   .filter(reference=>reference.referente_nombre);
  const primaryReference=o.referentes_principales[0];
  o.referente_nombre=primaryReference?.referente_nombre||'';
  o.referente_persona_id=primaryReference?.referente_persona_id||'';
 }
 if(o.referente_nombre){
   const parts=naturalName(o.referente_nombre).split(' ');
   o.referente_nombre=parts.join(' '); o.referente_apellido_paterno='';o.referente_apellido_materno='';
 }
 ['nombre','apellido_paterno','apellido_materno','subreferente','actor_politico'].forEach(k=>{if(o[k]!=null)o[k]=naturalName(o[k])});
 ['observaciones','distrito','grupo_nombre','cargo_funcion','cargo','coordinacion_general','region','telefono'].forEach(k=>{if(o[k]!=null)o[k]=cleanText(o[k])});
 if(o.partido_otro!=null)o.partido_otro=upper(o.partido_otro);
 return o;
}
function markDirty(){
 isDirty=true;
 $('saveStatus').textContent='CAMBIOS SIN GUARDAR';
 $('previewNote').textContent='VISTA PREVIA EN VIVO · CAMBIOS AÚN SIN GUARDAR';
 scheduleDraftPreview();
 applyActorIndicators();
}

function wireDecisionColors(scope){scope.querySelectorAll('.decision-select').forEach(select=>{const paint=()=>select.classList.toggle('decision-no',select.value==='0');select.addEventListener('change',paint);paint()})}
function presidencyReferenceRow(reference={},index=0){
 const listId=`presidencia-referentes-${index}`;
 const name=reference.referente_completo||reference.nombre_completo||reference.referente_nombre||'';
 return `<div class="presidency-reference-row">
  <label>REFERENTE ${index+1}
   <input class="input person-name reference-input" list="${listId}" autocomplete="off" value="${escapeHtml(name)}" placeholder="Busca o escribe un referente">
   <input data-f="referente_persona_id" type="hidden" value="${escapeHtml(reference.referente_persona_id||'')}">
   <datalist id="${listId}" class="reference-options"></datalist>
   <small class="field-hint">SELECCIONA UNO GUARDADO O ESCRIBE UNO NUEVO</small>
  </label>
  <button type="button" class="button danger-outline smallbtn" data-remove-presidency-reference aria-label="Quitar referente">QUITAR</button>
 </div>`;
}
function wirePresidencyReferenceRows(){
 const scope=$('presidenciaEditor');
 scope.querySelectorAll('.presidency-reference-row').forEach(row=>{
  if(row.dataset.referenceWired)return;
  row.dataset.referenceWired='1';
  upperInputs(row);
  wireReferencePicker(row);
  row.querySelector('.reference-input')?.addEventListener('input',markDirty);
  row.querySelector('[data-remove-presidency-reference]').onclick=()=>{
   row.remove();
   updatePresidencyReferenceLabels();
   markDirty();
  };
 });
}
function updatePresidencyReferenceLabels(){
 $('presidenciaEditor').querySelectorAll('.presidency-reference-row label').forEach((label,index)=>{
  const input=label.querySelector('.reference-input');
  label.firstChild.textContent=`REFERENTE PRINCIPAL ${index+1}`;
  const list=label.querySelector('datalist');
  if(list){const listId=`presidencia-referentes-${index}`;list.id=listId;input.setAttribute('list',listId)}
 });
}
function renderPres(){
 const scope=$('presidenciaEditor');
 const presidency=ficha?.presidencia||{};
 const references=presidency.referentes_principales||(
  presidency.referente_completo||presidency.referente_nombre
   ? [{referente_completo:presidency.referente_completo||presidency.referente_nombre,referente_persona_id:presidency.referente_persona_id}]
   : []
 );
 scope.innerHTML=personEditor('pres',presidency,{party:true,ref:false,pres:true});
 scope.insertAdjacentHTML('beforeend',`<section class="presidency-references">
  <div class="presidency-references-heading"><div><strong>REFERENTES</strong><small>PUEDES AGREGAR MÁS DE UNO; CADA REFERENTE MOSTRARÁ ESTE MUNICIPIO EN EL MAPA</small></div>
    <button type="button" class="button secondary smallbtn" id="addPresidencyReference">
      <i class="bi bi-person-plus-fill"></i> 
      AGREGAR
    </button>
  </div>
  <div class="presidency-reference-list">${(references.length?references:[{}]).map(presidencyReferenceRow).join('')}</div>
 </section>`);
 upperInputs(scope);
 wirePhoto(scope);
 wirePartyOther(scope);
 wireDecisionColors(scope);
 wirePresidencyReferenceRows();
 $('addPresidencyReference').onclick=()=>{
  const list=scope.querySelector('.presidency-reference-list');
  list.insertAdjacentHTML('beforeend',presidencyReferenceRow({},list.children.length));
  wirePresidencyReferenceRows();
  updatePresidencyReferenceLabels();
  list.lastElementChild?.querySelector('.reference-input')?.focus();
  markDirty();
 };
 scope.querySelectorAll('input,select,textarea').forEach(element=>element.addEventListener('input',markDirty));
}
function actorParty(x){return x?.partido_id==='OTRO'?(x.partido_otro||'OTRO'):(x?.partido||x?.partido_id||'')}
function actorReference(x){return x?.referente_completo||x?.referente_nombre||''}
function actorSubreference(x){return x?.subreferente||x?.subreferente_texto||''}
function actorCardDetail(key,x){
 const parts=[];
 if(key==='territorio'){const type=x.tipo_personal||tiposTerritorio[x.tipo_personal_id]||'';if(type)parts.push(`TIPO: ${type}`);const role=x.cargo_funcion||x.cargo_funcion_texto||'';if(role)parts.push(`CARGO / FUNCIÓN: ${role}`)}
 else if(key==='personal_coordinacion'){if(x.cargo)parts.push(x.cargo);if(x.coordinacion_general)parts.push(x.coordinacion_general);if(x.region)parts.push(`REGIÓN: ${x.region}`);if(x.telefono)parts.push(`TEL: ${x.telefono}`)}
 else {const party=actorParty(x);if(party)parts.push(`PARTIDO: ${party}`)}
 if(x.distrito||x.distrito_texto)parts.push(`DISTRITO: ${x.distrito||x.distrito_texto}`);
 const reference=actorReference(x);if(reference)parts.push(`REF: ${reference}`);
 const subreference=actorSubreference(x);if(key==='aspirantes'&&subreference)parts.push(`SUBREF: ${subreference}`);
 return parts.join(' · ');
}
function summary(id,data){$(id).innerHTML=data?`<div class="record-card"><div class="record-thumb">${data.foto_path?`<img src="${photoUrl(data.foto_path)}">`:''}</div><div><strong>${data.nombre_completo||fullName(data)}</strong><small>${actorCardDetail('',data)}</small></div></div>`:'<div class="empty">SIN REGISTRO</div>'}
function renderList(key,id){
 const arr=ficha?.[key]||[];const el=$(id);
 if(!arr.length){el.innerHTML='<div class="empty">SIN REGISTROS</div>';return}
 el.innerHTML=arr.map((x,i)=>{const isGroup=key==='grupos_presencia';const imagePath=isGroup?x.imagen_path:x.foto_path;const title=isGroup?x.actor_politico:(x.nombre_completo||fullName(x)||x.nombre);const detail=isGroup?`GRUPO: ${x.grupo_nombre||''}`:actorCardDetail(key,x);return `<div class="record-card" data-persona-id="${escapeHtml(x.persona_id||'')}"><div class="record-thumb">${imagePath?`<img src="${photoUrl(imagePath)}">`:''}</div><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div><div class="record-actions"><button data-edit="${key}:${i}">EDITAR</button><button data-del="${key}:${i}">ELIMINAR</button></div></div>`}).join('');
 el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const [k,i]=b.dataset.edit.split(':');openModal(k,Number(i))});
 el.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{const [k,i]=b.dataset.del.split(':');ficha[k].splice(Number(i),1);renderAll(true);markDirty()});
}
function relevantActorPeople(){
 if(!ficha)return[];
 return [
  ficha.presidencia,
  ...(ficha.lideres||[]),
  ...(ficha.aspirantes||[]),
  ...(ficha.territorio||[])
 ].filter(person=>person?.persona_id).map(person=>({...person,nombre_completo:person.nombre_completo||fullName(person)}));
}
function createActorIndicator(person,status,extraClass=''){
 const button=document.createElement('button');button.type='button';button.className=`capture-actor-link ${status.estado==='REVISAR'?'review':''} ${extraClass}`.trim();
 button.title=status.estado==='REVISAR'?'Revisar posibles expedientes en Actores':'Abrir expediente en Actores';
 button.setAttribute('aria-label',button.title);button.innerHTML=`<i class="bi ${status.estado==='REVISAR'?'bi-paperclip':'bi-paperclip'}"></i>`;
 button.onclick=()=>window.captureActors.open(person,status);return button;
}
function applyActorIndicators(){
 document.querySelectorAll('.capture-actor-link').forEach(button=>button.remove());
 if(isDirty||!ficha)return;
 const presidency=ficha.presidencia;
 if(presidency?.persona_id){const status=actorStatuses.get(presidency.persona_id);if(status&&['DISPONIBLE','ENLAZADA','REVISAR'].includes(status.estado))$('presidenciaEditor').querySelector('.person-editor')?.appendChild(createActorIndicator({...presidency,nombre_completo:presidency.nombre_completo||fullName(presidency)},status,'presidency-actor-link'))}
 ['lideres','aspirantes','territorio'].forEach(key=>{
  (ficha[key]||[]).forEach(person=>{
   const status=actorStatuses.get(person.persona_id);
   if(!person.persona_id||!status||!['DISPONIBLE','ENLAZADA','REVISAR'].includes(status.estado))return;
   const card=$(key==='lideres'?'lideresList':key==='territorio'?'territorioList':'aspirantesList')
    .querySelector(`.record-card[data-persona-id="${CSS.escape(person.persona_id)}"]`);
   card?.querySelector('.record-actions')?.prepend(createActorIndicator({...person,nombre_completo:person.nombre_completo||fullName(person)},status));
  });
 });
}
async function refreshActorStatuses(generation=++actorStatusGeneration,attempt=0){
 const people=relevantActorPeople();const ids=[...new Set(people.map(person=>person.persona_id))];
 if(!ids.length){actorStatuses=new Map();applyActorIndicators();return}
 try{
  const statuses=await api.get(`/api/integracion-actores/estados?ids=${encodeURIComponent(ids.join(','))}`);
  if(generation!==actorStatusGeneration)return;
  actorStatuses=new Map((statuses||[]).map(status=>[status.persona_local_id,status]));applyActorIndicators();
  const pending=ids.some(id=>!actorStatuses.has(id)||actorStatuses.get(id).estado==='PENDIENTE');
  if(pending&&attempt<3)setTimeout(()=>{if(generation===actorStatusGeneration)refreshActorStatuses(generation,attempt+1)},[2500,6000,12000][attempt]);
 }catch(_){if(generation===actorStatusGeneration)applyActorIndicators()}
}
function syncInlineState(){
 if(!ficha)return;
 const presidencyScope=$('presidenciaEditor');
 if(presidencyScope?.querySelector('[data-f="nombre"]')){
  const presidency=editorData(presidencyScope);
  ficha.presidencia=presidency.nombre?{...(ficha.presidencia||{}),...presidency,nombre_completo:fullName(presidency),partido:presidency.partido_id||''}:null;
 }
 ficha.grupo_politico=cleanText($('grupoPolitico')?.value||'');
}
function renderAll(preserveInlineState=false){
 if(preserveInlineState)syncInlineState();
 renderPres();renderList('diputacionesFederales','diputacionesFederalesList');renderList('diputacionesLocales','diputacionesLocalesList');
 renderList('lideres','lideresList');renderList('grupos_presencia','gruposPresenciaList');renderList('aspirantes','aspirantesList');renderList('territorio','territorioList');renderList('personal_coordinacion','personalCoordinacionList');
 $('grupoPolitico').value=ficha?.grupo_politico||'';renderGroupPhoto();$('recordStatus').textContent=ficha?.estatus||'PENDIENTE';$('recordRevision').textContent=`REV. ${ficha?.revision||0}`;$('recordUpdated').textContent=formatLastUpdate(ficha?.ultima_actualizacion);
 renderAttachments();
 applyActorIndicators();
 if(!preserveInlineState)updatePreview();
}
function openModal(kind,index=null){
 const config={
  diputacionesFederales:{title:'DIPUTACIÓN FEDERAL',party:true,ref:true,district:true,directoryType:'FEDERAL'},
  diputacionesLocales:{title:'DIPUTACIÓN LOCAL',party:true,ref:true,district:true,directoryType:'LOCAL'},
  lideres:{title:'LÍDER',party:false,ref:true},
  aspirantes:{title:'ASPIRANTE 2027',party:true,ref:true,subref:true,personDictionary:true},
  territorio:{title:'PERSONAL EN TERRITORIO',party:false,ref:true,type:true,personDictionary:true},
  grupos_presencia:{title:'GRUPO CON PRESENCIA',groupPresence:true},
  personal_coordinacion:{title:'PERSONAL DE LA COORDINACIÓN',coordination:true}
 }[kind];
 const data=index===null?(ficha?.[kind] && !Array.isArray(ficha[kind])?ficha[kind]:{}):(ficha[kind][index]||{});
 currentModal={kind,index};$('modalTitle').textContent=config.title;$('modalForm').innerHTML=config.groupPresence?groupPresenceEditor(data):config.coordination?coordinationEditor(data):personEditor('modal',data,config);upperInputs($('modalForm'));wirePhoto($('modalForm'));wirePartyOther($('modalForm'));wireReferencePicker($('modalForm'));wirePersonDictionary($('modalForm'));wireDeputyDirectory($('modalForm'),config.directoryType);$('modalBackdrop').classList.remove('hidden');
}
$('modalClose').onclick=$('modalCancel').onclick=()=>$('modalBackdrop').classList.add('hidden');
 $('modalSave').onclick=()=>{const x=editorData($('modalForm'));const {kind,index}=currentModal;if(kind==='grupos_presencia'){if(!x.actor_politico||!x.grupo_nombre){alert('EL NOMBRE DEL ACTOR POLÍTICO Y DEL GRUPO SON OBLIGATORIOS');return}}else if(!x.nombre){alert('EL NOMBRE ES OBLIGATORIO');return}if(x.partido_id==='OTRO'&&!x.partido_otro){alert('ESCRIBE EL NOMBRE O LAS SIGLAS DEL PARTIDO');return}if(['diputacionesFederales','diputacionesLocales','lideres','aspirantes','territorio','grupos_presencia','personal_coordinacion'].includes(kind)){if(index===null)ficha[kind].push(x);else ficha[kind][index]=x}else ficha[kind]=x;$('modalBackdrop').classList.add('hidden');renderAll(true);markDirty()};
document.querySelectorAll('[data-single]').forEach(b=>b.onclick=()=>openModal(b.dataset.single,null));
document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>openModal(b.dataset.add,null));

function directoryKey(type){return type==='FEDERAL'?'diputacionesFederales':'diputacionesLocales'}
function resetDirectoryForm(){
 $('directoryRecordId').value='';$('directoryName').value='';$('directoryDistrict').value='';
 $('directorySave').textContent='DAR DE ALTA';$('directoryCancelEdit').classList.add('hidden');
}
function renderDirectoryManager(){
 $('directoryCount').textContent=directoryManagerRecords.length;
 if(!directoryManagerRecords.length){$('directoryList').innerHTML='<div class="empty">DIRECTORIO SIN REGISTROS ACTIVOS</div>';return}
 $('directoryList').innerHTML=directoryManagerRecords.map(item=>`<div class="directory-row">
  <strong>${escapeHtml(item.nombre_completo)}</strong><span>${escapeHtml(item.distrito)}</span>
  <div class="directory-row-actions"><button type="button" data-directory-use="${item.id}">AGREGAR A FICHA</button><button type="button" data-directory-edit="${item.id}">MODIFICAR</button><button type="button" class="directory-delete" data-directory-delete="${item.id}">DAR DE BAJA</button></div>
 </div>`).join('');
 $('directoryList').querySelectorAll('[data-directory-edit]').forEach(button=>button.onclick=()=>{
  const item=directoryManagerRecords.find(record=>record.id===button.dataset.directoryEdit);if(!item)return;
  $('directoryRecordId').value=item.id;$('directoryName').value=item.nombre_completo;$('directoryDistrict').value=item.distrito;
  $('directorySave').textContent='GUARDAR CAMBIOS';$('directoryCancelEdit').classList.remove('hidden');$('directoryName').focus();
 });
 $('directoryList').querySelectorAll('[data-directory-use]').forEach(button=>button.onclick=()=>{
  if(!ficha||!selectedMunicipioId)return alert('SELECCIONA UN MUNICIPIO');
  const item=directoryManagerRecords.find(record=>record.id===button.dataset.directoryUse);if(!item)return;
  const key=directoryKey(directoryManagerType),duplicate=ficha[key].some(actor=>dictionaryKey(actor.nombre_completo||fullName(actor))===dictionaryKey(item.nombre_completo)&&dictionaryKey(actor.distrito||actor.distrito_texto)===dictionaryKey(item.distrito));
  if(duplicate)return alert('ESTA DIPUTACIÓN YA ESTÁ AGREGADA EN LA FICHA');
  ficha[key].push({nombre:item.nombre_completo,apellido_paterno:'',apellido_materno:'',nombre_completo:item.nombre_completo,distrito:item.distrito,partido_id:'',referente_nombre:'',foto_path:''});
  renderAll(true);markDirty();
  if(window.Swal)Swal.fire({icon:'success',title:'AGREGADO A LA FICHA',text:item.nombre_completo,showConfirmButton:false,timer:1100});
 });
 $('directoryList').querySelectorAll('[data-directory-delete]').forEach(button=>button.onclick=async()=>{
  const item=directoryManagerRecords.find(record=>record.id===button.dataset.directoryDelete);if(!item)return;
  const confirmed=window.Swal?await Swal.fire({icon:'warning',title:'¿DAR DE BAJA?',text:`${item.nombre_completo} dejará de aparecer en el directorio, pero no se eliminará de fichas guardadas.`,showCancelButton:true,confirmButtonText:'DAR DE BAJA',cancelButtonText:'CANCELAR'}):{isConfirmed:confirm(`¿DAR DE BAJA A ${item.nombre_completo}?`)};
  if(!confirmed.isConfirmed)return;
  try{await api.delete(`/api/directorio/diputaciones/${item.id}`);deputyDirectoryCache[directoryManagerType]=null;await loadDirectoryManager();if(window.Swal)Swal.fire({icon:'success',title:'REGISTRO DADO DE BAJA',showConfirmButton:false,timer:1000})}
  catch(error){if(window.Swal)Swal.fire({icon:'error',title:'NO SE PUDO DAR DE BAJA',text:error.message});else alert(error.message)}
 });
}
async function loadDirectoryManager(){
 $('directoryList').innerHTML='<div class="empty">CARGANDO DIRECTORIO...</div>';
 try{directoryManagerRecords=await api.get(`/api/directorio/diputaciones?tipo=${directoryManagerType}`);renderDirectoryManager()}
 catch(error){$('directoryList').innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`}
}
async function openDirectoryManager(type){
 directoryManagerType=type;resetDirectoryForm();
 $('directoryTitle').textContent=`DIRECTORIO DE DIPUTACIÓN ${type}`;$('directoryBackdrop').classList.remove('hidden');
 await loadDirectoryManager();
}
document.querySelectorAll('[data-manage-directory]').forEach(button=>button.onclick=()=>openDirectoryManager(button.dataset.manageDirectory));
$('directoryClose').onclick=()=>$('directoryBackdrop').classList.add('hidden');
$('directoryCancelEdit').onclick=resetDirectoryForm;
$('directoryForm').onsubmit=async event=>{
 event.preventDefault();
 const id=$('directoryRecordId').value;
 const payload={tipo:directoryManagerType,nombre_completo:naturalName($('directoryName').value),distrito:upper($('directoryDistrict').value)};
 if(!payload.nombre_completo||!payload.distrito)return alert('EL NOMBRE COMPLETO Y EL DISTRITO SON OBLIGATORIOS');
 $('directorySave').disabled=true;
 try{
  if(id)await api.put(`/api/directorio/diputaciones/${id}`,payload);else await api.post('/api/directorio/diputaciones',payload);
  deputyDirectoryCache[directoryManagerType]=null;resetDirectoryForm();await loadDirectoryManager();
  if(window.Swal)Swal.fire({icon:'success',title:id?'DIRECTORIO ACTUALIZADO':'REGISTRO DADO DE ALTA',showConfirmButton:false,timer:1100});
 }catch(error){if(window.Swal)Swal.fire({icon:'error',title:'NO SE PUDO GUARDAR',text:error.message});else alert(error.message)}
 finally{$('directorySave').disabled=false}
};
upperInputs($('directoryForm'));

function buildPayload(){
 const pres=editorData($('presidenciaEditor'));
 return {
  presidencia:pres.nombre?pres:null,
  diputacionesFederales:ficha?.diputacionesFederales||[],diputacionesLocales:ficha?.diputacionesLocales||[],
  lideres:ficha?.lideres||[],grupos_presencia:ficha?.grupos_presencia||[],aspirantes:ficha?.aspirantes||[],territorio:ficha?.territorio||[],personal_coordinacion:ficha?.personal_coordinacion||[],
  grupo_politico:cleanText($('grupoPolitico').value),grupo_politico_imagen_path:ficha?.grupo_politico_imagen_path||null,hoja2_archivo_id:ficha?.hojas?.[0]?.id||null
 };
}

async function saveFicha({showSuccess=true,keepLoader=false,loadingTitle=''}={}){
 if(!selectedMunicipioId){alert('SELECCIONA UN MUNICIPIO');return false}
 const savedMunicipioId=selectedMunicipioId;
 const savedMunicipioName=ficha?.municipio?.nombre||'MUNICIPIO';
 const wasUpdate=Number(ficha?.revision||0)>0;
 $('saveStatus').textContent='GUARDANDO...';
 if(window.Swal)Swal.fire({title:loadingTitle||(wasUpdate?'ACTUALIZANDO FICHA...':'GUARDANDO FICHA...'),text:savedMunicipioName,allowOutsideClick:false,allowEscapeKey:false,didOpen:()=>Swal.showLoading()});
 try{
  if(pendingFileOperations.size){
   $('saveStatus').textContent='ESPERANDO FOTOGRAFÍA...';
   if(window.Swal)Swal.update({title:'TERMINANDO DE CARGAR LA FOTO...',text:savedMunicipioName});
   await Promise.all([...pendingFileOperations]);
  }
  const payload=buildPayload();
  const saveResult = await api.put(`/api/fichas/${savedMunicipioId}`,payload);
  const referencePropagation = saveResult?.propagacion_referentes;
  isDirty=false;
  await reloadMunicipios();
  resetWorkspaceAfterSave();
  $('saveStatus').textContent='FICHA GUARDADA. SELECCIONA EL SIGUIENTE MUNICIPIO';
  const propagationMessage = referencePropagation?.total_diputados
   ? ` También se actualizó el referente de ${referencePropagation.total_diputados} diputado(s) en ${referencePropagation.total_municipios} ficha(s) relacionada(s).`
   : '';
  if(window.Swal&&showSuccess)await Swal.fire({icon:'success',title:wasUpdate?'FICHA ACTUALIZADA':'FICHA GUARDADA',text:`${savedMunicipioName} se guardó correctamente.${propagationMessage}`,showConfirmButton:false,timer:propagationMessage?2800:1600,timerProgressBar:true});
  else if(window.Swal&&!keepLoader)Swal.close();
  return savedMunicipioId;
 }
 catch(e){$('saveStatus').textContent='ERROR AL GUARDAR';if(window.Swal)await Swal.fire({icon:'error',title:'NO SE PUDO GUARDAR',text:e.message,confirmButtonText:'ACEPTAR'});else alert(e.message);return false}
}
$('saveAll').onclick=$('saveAllTop').onclick=()=>saveFicha();
$('grupoPolitico').addEventListener('input',markDirty);
function renderGroupPhoto(){
 const imagePath=ficha?.grupo_politico_imagen_path||'';
 $('grupoPhotoBox').innerHTML=imagePath?`<img src="${photoUrl(imagePath)}">`:'IMAGEN';
 $('grupoPhotoRemove').disabled=!imagePath;
}
$('grupoPhotoPick').onclick=()=>{if(!selectedMunicipioId)return alert('SELECCIONA UN MUNICIPIO');$('grupoPhotoInput').click()};
$('grupoPhotoInput').onchange=async()=>{
 const file=$('grupoPhotoInput').files[0];if(!file||!selectedMunicipioId)return;
 $('grupoPhotoPick').disabled=true;
 try{const uploaded=await api.upload('/api/files/photo',file);ficha.grupo_politico_imagen_path=uploaded.path;renderGroupPhoto();markDirty()}
 catch(e){alert(e.message)}finally{$('grupoPhotoPick').disabled=false}
};
$('grupoPhotoRemove').onclick=()=>{if(!ficha)return;ficha.grupo_politico_imagen_path='';$('grupoPhotoInput').value='';renderGroupPhoto();markDirty()};
$('generatePdf').onclick=async()=>{
 if(generatingMunicipalPdf)return;
 if(!selectedMunicipioId)return alert('SELECCIONA UN MUNICIPIO');
 generatingMunicipalPdf=true;
 $('generatePdf').disabled=true;
 const municipioName=ficha?.municipio?.nombre||'FICHA_MUNICIPAL';
 try{
  const savedMunicipioId=await saveFicha({showSuccess:false,keepLoader:true,loadingTitle:'PREPARANDO PDF...'});
  if(!savedMunicipioId)return;
  if(window.Swal)Swal.update({title:'GENERANDO PDF...',text:municipioName});
  const response=await fetch(`/api/pdf/${savedMunicipioId}`);
  if(!response.ok){let message='NO SE PUDO GENERAR EL PDF';try{message=(await response.json()).message||message}catch{}throw new Error(message)}
  const url=URL.createObjectURL(await response.blob());
  const link=document.createElement('a');
  link.href=url;link.download=`${municipioName.replace(/[^A-ZÁÉÍÓÚÜÑ0-9_-]+/gi,'_')}.pdf`;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  $('saveStatus').textContent='PDF GENERADO Y DESCARGADO';
  if(window.Swal)await Swal.fire({icon:'success',title:'FICHA DESCARGADA',text:`El PDF de ${municipioName} se descargó correctamente.`,showConfirmButton:false,timer:1600,timerProgressBar:true});
 }catch(e){$('saveStatus').textContent='ERROR AL GENERAR PDF';if(window.Swal)await Swal.fire({icon:'error',title:'NO SE PUDO DESCARGAR',text:e.message,confirmButtonText:'ACEPTAR'});else alert(e.message)}finally{generatingMunicipalPdf=false;$('generatePdf').disabled=false}
};

$('generateExcel').onclick=async()=>{
 if(generatingMunicipalExcel)return;
 if(!selectedMunicipioId)return alert('SELECCIONA UN MUNICIPIO');
 generatingMunicipalExcel=true;
 $('generateExcel').disabled=true;
 const municipioName=ficha?.municipio?.nombre||'FICHA_MUNICIPAL';
 try{
  const savedMunicipioId=await saveFicha({showSuccess:false,keepLoader:true,loadingTitle:'PREPARANDO EXCEL...'});
  if(!savedMunicipioId)return;
  if(window.Swal)Swal.update({title:'GENERANDO EXCEL...',text:municipioName});
  const response=await fetch(`/api/excel/${savedMunicipioId}`);
  if(!response.ok){let message='NO SE PUDO GENERAR EL EXCEL';try{message=(await response.json()).message||message}catch{}throw new Error(message)}
  const url=URL.createObjectURL(await response.blob());
  const link=document.createElement('a');
  link.href=url;link.download=`${municipioName.replace(/[^A-ZÃÃ‰ÃÃ“ÃšÃœÃ‘0-9_-]+/gi,'_')}.xlsx`;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  $('saveStatus').textContent='EXCEL GENERADO Y DESCARGADO';
  if(window.Swal)await Swal.fire({icon:'success',title:'EXCEL DESCARGADO',text:`La ficha de ${municipioName} se descargÃ³ correctamente.`,showConfirmButton:false,timer:1600,timerProgressBar:true});
 }catch(e){$('saveStatus').textContent='ERROR AL GENERAR EXCEL';if(window.Swal)await Swal.fire({icon:'error',title:'NO SE PUDO DESCARGAR',text:e.message,confirmButtonText:'ACEPTAR'});else alert(e.message)}finally{generatingMunicipalExcel=false;$('generateExcel').disabled=false}
};

function resetWorkspaceAfterSave(){
 cancelDraftPreview();
 actorStatusGeneration++;actorStatuses=new Map();
 selectedMunicipioId=null;
 ficha=null;
 currentModal=null;
 $('selectedMunicipio').textContent='SELECCIONE UN MUNICIPIO';
 renderMunicipios($('municipioSearch').value);
 renderAll();
 $('recordStatus').textContent='PENDIENTE';
 $('recordRevision').textContent='REV. 0';
 $('recordUpdated').textContent='SIN ACTUALIZAR';
 $('previewNote').textContent='SELECCIONA UN MUNICIPIO. LA VISTA SE ACTUALIZA AL GUARDAR.';
 document.querySelector('.tab[data-tab="funciones"]').click();
 document.querySelector('.capture-panel').scrollTop=0;
}

function clearCapture(){
 if(!selectedMunicipioId)return alert('SELECCIONA UN MUNICIPIO');
 if(!confirm('SE LIMPIARÁN LOS CAMPOS EN PANTALLA. PARA BORRAR TAMBIÉN LOS DATOS GUARDADOS, DESPUÉS PULSA GUARDAR FICHA.'))return;
 ficha={municipio:ficha.municipio,estatus:ficha.estatus,revision:ficha.revision,ultima_actualizacion:ficha.ultima_actualizacion,grupo_politico:'',grupo_politico_imagen_path:'',grupos_presencia:[],presidencia:null,diputacionFederal:null,diputacionLocal:null,diputacionesFederales:[],diputacionesLocales:[],lideres:[],aspirantes:[],territorio:[],personal_coordinacion:[],hojas:ficha.hojas||[],hoja2:ficha.hojas?.[0]||null};
 renderAll();markDirty();
 document.querySelector('.tab[data-tab="funciones"]').click();
}
$('clearAll').onclick=$('clearAllTop').onclick=clearCapture;

function renderAttachments(){
 const attachments=ficha?.hojas||[];
 if(!attachments.length){$('hoja2Info').innerHTML='<div class="empty">SIN ARCHIVOS ADJUNTOS</div>';return}
 $('hoja2Info').innerHTML=attachments.map((file,index)=>`<div class="attachment-card"><div class="attachment-icon">${file.mime_type==='application/pdf'?'PDF':'IMG'}</div><div><strong>${escapeHtml(file.nombre_original)}</strong><small>ANEXO ${index+1}${file.mime_type==='application/pdf'?' · SE INCLUIRÁN TODAS SUS PÁGINAS':''}</small></div><div class="record-actions"><button type="button" data-replace-attachment="${file.id}">REEMPLAZAR</button><button type="button" data-delete-attachment="${file.id}">ELIMINAR</button></div></div>`).join('');
 $('hoja2Info').querySelectorAll('[data-delete-attachment]').forEach(button=>button.onclick=()=>deleteAttachment(button.dataset.deleteAttachment));
 $('hoja2Info').querySelectorAll('[data-replace-attachment]').forEach(button=>button.onclick=()=>replaceAttachment(button.dataset.replaceAttachment));
}
async function addAttachments(files){
 if(!files?.length||!selectedMunicipioId)return;
 try{
  $('hoja2Dropzone').classList.add('uploading');
  const uploaded=await api.uploadMany(`/api/files/anexos/${selectedMunicipioId}`,files);
  ficha.hojas=[...(ficha.hojas||[]),...uploaded].sort((a,b)=>(a.orden_visual||0)-(b.orden_visual||0));
  ficha.hoja2=ficha.hojas[0]||null;renderAttachments();$('saveStatus').textContent=`${uploaded.length} ARCHIVO(S) ADJUNTADO(S)`;
 }catch(e){alert(e.message)}finally{$('hoja2Dropzone').classList.remove('uploading');$('hoja2Input').value=''}
}
async function deleteAttachment(id){
 const file=(ficha?.hojas||[]).find(item=>item.id===id);if(!file)return;
 if(!confirm(`¿ELIMINAR EL ANEXO ${file.nombre_original}? ESTA ACCIÓN TAMBIÉN BORRARÁ EL ARCHIVO LOCAL.`))return;
 try{await api.delete(`/api/files/anexos/${selectedMunicipioId}/${id}`);ficha.hojas=ficha.hojas.filter(item=>item.id!==id);ficha.hoja2=ficha.hojas[0]||null;renderAttachments();$('saveStatus').textContent='ANEXO ELIMINADO'}catch(e){alert(e.message)}
}
function replaceAttachment(id){
 const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,application/pdf';
 input.onchange=async()=>{const file=input.files[0];if(!file)return;try{const updated=await api.replaceUpload(`/api/files/anexos/${selectedMunicipioId}/${id}`,file);ficha.hojas=ficha.hojas.map(item=>item.id===id?updated:item);ficha.hoja2=ficha.hojas[0]||null;renderAttachments();$('saveStatus').textContent='ANEXO REEMPLAZADO'}catch(e){alert(e.message)}};
 input.click();
}
$('hoja2Dropzone').onclick=()=>$('hoja2Input').click();
$('hoja2Input').onchange=()=>addAttachments($('hoja2Input').files);
['dragover','drop'].forEach(ev=>$('hoja2Dropzone').addEventListener(ev,e=>e.preventDefault()));
$('hoja2Dropzone').addEventListener('drop',e=>addAttachments(e.dataTransfer.files));

function updatePreview(){
 cancelDraftPreview();
 if(!selectedMunicipioId){$('pdfPreview').removeAttribute('src');$('pdfPreview').removeAttribute('srcdoc');return}
 $('pdfPreview').removeAttribute('srcdoc');
 $('pdfPreview').src=`/api/pdf/preview/${selectedMunicipioId}?v=${Date.now()}`;
 $('previewNote').textContent=isDirty?'VISTA PREVIA EN VIVO · CAMBIOS AÚN SIN GUARDAR':'ESTA VISTA USA LA MISMA PLANTILLA QUE EL PDF FINAL.';
}
function cancelDraftPreview(){
 if(draftPreviewTimer){clearTimeout(draftPreviewTimer);draftPreviewTimer=null}
 if(draftPreviewController){draftPreviewController.abort();draftPreviewController=null}
 previewRequestNumber++;
}
function scheduleDraftPreview(){
 if(!selectedMunicipioId)return;
 if(draftPreviewTimer)clearTimeout(draftPreviewTimer);
 draftPreviewTimer=setTimeout(renderDraftPreview,250);
}
async function renderDraftPreview(){
 if(!selectedMunicipioId||!ficha)return;
 draftPreviewTimer=null;
 if(draftPreviewController)draftPreviewController.abort();
 draftPreviewController=new AbortController();
 const requestNumber=++previewRequestNumber;
 try{
  const html=await api.postHtml(`/api/pdf/preview/${selectedMunicipioId}`,buildPayload(),draftPreviewController.signal);
  if(requestNumber!==previewRequestNumber)return;
  const frame=$('pdfPreview');
  frame.removeAttribute('src');
  frame.srcdoc=html;
  $('previewNote').textContent='VISTA PREVIA EN VIVO · CAMBIOS AÚN SIN GUARDAR';
 }catch(e){
  if(e.name!=='AbortError'&&requestNumber===previewRequestNumber)$('previewNote').textContent='NO SE PUDO ACTUALIZAR LA VISTA PREVIA';
 }finally{
  if(requestNumber===previewRequestNumber)draftPreviewController=null;
 }
}
function fitPreview(){
 const paper=document.querySelector('.preview-panel .paper'),frame=$('pdfPreview');
 if(!paper||!frame||!paper.clientWidth||!frame.offsetWidth)return;
 const scale=paper.clientWidth/frame.offsetWidth;
 frame.style.transform=`scale(${scale})`;
 paper.style.height=`${frame.offsetHeight*scale}px`;
}
function renderMunicipios(q=''){
 const query=upper(q).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 $('municipiosList').innerHTML='';
 const list=municipios.filter(m=>m.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query));
 $('municipioCount').textContent=list.length;
 list.forEach(m=>{const d=document.createElement('div');d.className=`municipio-item ${m.id===selectedMunicipioId?'active':''} ${m.tiene_informacion?'':'municipio-no-data'}`;d.innerHTML=`<div class="municipio-row"><strong>${m.nombre}</strong>${m.tiene_informacion?`<input class="municipio-general-check" type="checkbox" aria-label="INCLUIR ${escapeHtml(m.nombre)} EN PDF GENERAL" ${selectedGeneralMunicipios.has(m.id)?'checked':''}>`:''}</div><span class="status">${m.estatus||'PENDIENTE'} · REV ${m.revision||0}${m.tiene_informacion?' · CON INFORMACIÓN':''}${m.ultima_actualizacion?`<br>${formatLastUpdate(m.ultima_actualizacion)}`:''}</span>`;d.onclick=()=>selectMunicipio(m);const checkbox=d.querySelector('.municipio-general-check');if(checkbox)checkbox.onclick=event=>{event.stopPropagation();checkbox.checked?selectedGeneralMunicipios.add(m.id):selectedGeneralMunicipios.delete(m.id);updateGeneralControls()};$('municipiosList').appendChild(d)})
 updateGeneralControls();
}
function updateGeneralControls(){
 const count=selectedGeneralMunicipios.size;
 $('generateGeneral').disabled=!count;
 $('generateGeneral').textContent=`PDF GENERAL (${count})`;
 $('generateGeneralExcel').disabled=!count;
 $('generateGeneralExcel').textContent=`EXCEL GENERAL (${count})`;
 const available=municipios.filter(m=>m.tiene_informacion);
 $('selectGeneralAll').textContent=available.length&&available.every(m=>selectedGeneralMunicipios.has(m.id))?'QUITAR SELECCIÓN':'SELECCIONAR CON INFORMACIÓN';
}
$('selectGeneralAll').onclick=()=>{
 const available=municipios.filter(m=>m.tiene_informacion);
 const allSelected=available.length&&available.every(m=>selectedGeneralMunicipios.has(m.id));
 available.forEach(m=>allSelected?selectedGeneralMunicipios.delete(m.id):selectedGeneralMunicipios.add(m.id));
 renderMunicipios($('municipioSearch').value);
};
$('generateGeneral').onclick=async()=>{
 if(isDirty)return alert('GUARDA O DESCARTA LOS CAMBIOS ACTUALES ANTES DE GENERAR EL PDF GENERAL.');
 if(!selectedGeneralMunicipios.size)return alert('SELECCIONA AL MENOS UN MUNICIPIO CON INFORMACIÓN.');
 const pdfWindow=window.open('about:blank','_blank');
 $('generateGeneral').disabled=true;$('generalStatus').textContent='GENERANDO PDF GENERAL...';
 try{
  const response=await fetch('/api/pdf/general',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({municipioIds:[...selectedGeneralMunicipios]})});
  if(!response.ok){let message='NO SE PUDO GENERAR EL PDF GENERAL';try{message=(await response.json()).message||message}catch{}throw new Error(message)}
  const url=URL.createObjectURL(await response.blob());
  if(pdfWindow)pdfWindow.location=url;else window.open(url,'_blank');
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  $('generalStatus').textContent='PDF GENERAL GENERADO CORRECTAMENTE';
 }catch(e){if(pdfWindow)pdfWindow.close();$('generalStatus').textContent='ERROR AL GENERAR';alert(e.message)}finally{updateGeneralControls()}
};
$('generateGeneralExcel').onclick=async()=>{
 if(isDirty)return alert('GUARDA O DESCARTA LOS CAMBIOS ACTUALES ANTES DE GENERAR EL EXCEL GENERAL.');
 if(!selectedGeneralMunicipios.size)return alert('SELECCIONA AL MENOS UN MUNICIPIO CON INFORMACIÃ“N.');
 const includePhotos=$('generalExcelPhotos').checked;
 $('generateGeneralExcel').disabled=true;$('generalStatus').textContent='GENERANDO EXCEL GENERAL...';
 if(window.Swal)Swal.fire({title:'GENERANDO EXCEL GENERAL...',text:`${selectedGeneralMunicipios.size} MUNICIPIOS${includePhotos?' · COMPRIMIENDO FOTOS':''}`,allowOutsideClick:false,allowEscapeKey:false,didOpen:()=>Swal.showLoading()});
 try{
  const response=await fetch('/api/excel/general',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({municipioIds:[...selectedGeneralMunicipios],includePhotos})});
  if(!response.ok){let message='NO SE PUDO GENERAR EL EXCEL GENERAL';try{message=(await response.json()).message||message}catch{}throw new Error(message)}
  const url=URL.createObjectURL(await response.blob());
  const link=document.createElement('a');link.href=url;link.download='REPORTE_GENERAL_FICHAS_MUNICIPALES.xlsx';document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  $('generalStatus').textContent='EXCEL GENERAL DESCARGADO CORRECTAMENTE';
  if(window.Swal)await Swal.fire({icon:'success',title:'EXCEL GENERAL DESCARGADO',text:'El reporte seleccionado se descargará correctamente.',showConfirmButton:false,timer:1800,timerProgressBar:true});
 }catch(e){$('generalStatus').textContent='ERROR AL GENERAR EXCEL';if(window.Swal)await Swal.fire({icon:'error',title:'NO SE PUDO DESCARGAR',text:e.message,confirmButtonText:'ACEPTAR'});else alert(e.message)}finally{updateGeneralControls()}
};
async function reloadMunicipios(){municipios=await api.get('/api/municipios');const available=new Set(municipios.filter(m=>m.tiene_informacion).map(m=>m.id));for(const id of selectedGeneralMunicipios)if(!available.has(id))selectedGeneralMunicipios.delete(id);renderMunicipios($('municipioSearch').value)}
async function selectMunicipio(m){
 if(isDirty && m.id!==selectedMunicipioId && !confirm('HAY CAMBIOS SIN GUARDAR. ¿QUIERES CAMBIAR DE MUNICIPIO Y DESCARTARLOS?'))return;
 selectedMunicipioId=m.id;$('selectedMunicipio').textContent=m.nombre;ficha=await api.get(`/api/fichas/${m.id}`);isDirty=false;actorStatuses=new Map();renderMunicipios($('municipioSearch').value);renderAll();refreshActorStatuses();$('saveStatus').textContent='SIN CAMBIOS PENDIENTES';
}
$('municipioSearch').oninput=e=>renderMunicipios(e.target.value);
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(`tab-${b.dataset.tab}`).classList.add('active')});
upperInputs();
$('pdfPreview').addEventListener('load',fitPreview);
if(window.ResizeObserver)new ResizeObserver(fitPreview).observe(document.querySelector('.preview-panel'));
else window.addEventListener('resize',fitPreview);
window.addEventListener('beforeunload',e=>{if(isDirty){e.preventDefault();e.returnValue=''}});
(async()=>{try{await reloadMunicipios()}catch(e){alert(e.message)}})();
