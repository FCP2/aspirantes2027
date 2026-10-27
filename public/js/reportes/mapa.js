'use strict';
(() => {
 const state = {
  mode: 'fichas',
  referenceScope: 'presidencias',
  referenceView: 'referente',
  referenceLabelsVisible: true,
  aspirantScope: 'ambos',
  aspirantView: 'general',
  municipalities: [],
  references: [],
  selectedReferenceKeys: [],
  referenceSummary: {},
  parties: [],
  partySummary: {},
  aspirantMunicipalities: [],
  aspirantSummary: {},
  subreferences: [],
  history: { periodos: [], rows: [], current: [], municipios: [] },
  historyPeriods: [],
  historyReferences: [],
  selectedMunicipality: null,
  selectedReference: null,
  referenceAspirantKey: null,
  selectedParty: null,
  selectedAspirantMunicipality: null,
  selectedSubreferenceKey: null
 };
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
 const partyLogoMap={MC:['mc'],MOVIMIENTO_CIUDADANO:['mc'],MORENA:['morena'],PAN:['pan'],PRD:['prd'],PRI:['pri'],PT:['pt'],PVEM:['pvem'],VERDE:['pvem']};
 function partyLogoUrls(value){
  const key=norm(value);
  if(partyLogoMap[key])return partyLogoMap[key].map(name=>`/img/${name}.png`);
  const tokens=[['MORENA','morena'],['PVEM','pvem'],['PRI','pri'],['PAN','pan'],['PRD','prd'],['PT','pt'],['MC','mc']];
  return tokens.filter(([token])=>new RegExp(`(^|[^A-Z])${token}([^A-Z]|$)`).test(key)).map(([,name])=>`/img/${name}.png`);
 }
 const partyReferenceAliases=new Map([
  ['PAN','PAN'],['PARTIDO ACCION NACIONAL','PAN'],
  ['PRI','PRI'],['PARTIDO REVOLUCIONARIO INSTITUCIONAL','PRI'],
  ['PRD','PRD'],['PARTIDO DE LA REVOLUCION DEMOCRATICA','PRD'],
  ['PT','PT'],['PARTIDO DEL TRABAJO','PT'],
  ['PVEM','PVEM'],['VERDE','PVEM'],['VERDE (PVEM)','PVEM'],['PARTIDO VERDE ECOLOGISTA DE MEXICO','PVEM'],
  ['MC','MC'],['MOVIMIENTO CIUDADANO','MC'],
  ['MORENA','MORENA'],['MOVIMIENTO REGENERACION NACIONAL','MORENA'],
  ['NA','NAEM'],['NAEM','NAEM'],['NUEVA ALIANZA','NAEM'],['NUEVA ALIANZA ESTADO DE MEXICO','NAEM'],['ALIANZA (NA)','NAEM']
 ]);
 const partyReferencePalette=new Map([
  ['PAN','#233A7D'],['PRI','#C62828'],['PRD','#FFCC03'],['PVEM','#89C273'],
  ['PT','#E65100'],['MC','#F08318'],['MORENA','#5C1C2A'],['NAEM','#8ABCBB']
 ]);
 function referenceParty(reference){
  const canonical=partyReferenceAliases.get(norm(reference.nombre));
  if(!canonical)return null;
  const matchingParty=state.parties.find(party=>partyReferenceAliases.get(norm(party.nombre))===canonical);
  return {key:canonical,color:matchingParty?.color||partyReferencePalette.get(canonical)};
 }
 function assignReferenceColors(references){
  const ordered=[...references].sort((a,b)=>norm(a.nombre).localeCompare(norm(b.nombre),'es'));
  const assigned=new Set(partyReferencePalette.values());
  const colors=new Map();
  ordered.forEach((reference,index)=>{
   const party=referenceParty(reference);
   if(party){
    colors.set(reference.key,{color:party.color,partyKey:party.key});
    return;
   }
   let color=String(reference.color||'').trim();
   if(!color||assigned.has(color.toUpperCase())){
    let hue=(index*137.508+19)%360;
    color=`hsl(${hue.toFixed(1)} 72% 38%)`;
    while(assigned.has(color.toUpperCase())){
     hue=(hue+137.508)%360;
     color=`hsl(${hue.toFixed(1)} 72% 38%)`;
    }
   }
   assigned.add(color.toUpperCase());
   colors.set(reference.key,{color,partyKey:null});
  });
  return references.map(reference=>({...reference,...colors.get(reference.key)}));
 }
 const empty=()=>'<div class="empty-list"><i class="bi bi-search"></i><strong>Sin resultados</strong><span>Prueba con otro nombre o filtro.</span></div>';
 function date(v){if(!v)return'Sin actualización';const d=new Date(String(v).replace(' ','T'));return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(d)}
 function flip(id,v){const e=$(id);e.textContent=String(v).padStart(3,'0');e.classList.remove('is-flipping');void e.offsetWidth;e.classList.add('is-flipping');setTimeout(()=>e.classList.remove('is-flipping'),650)}
 function progress(a,t){const p=t?Math.round(a/t*100):0;$('coverageAvailableBar').style.width=`${p}%`;$('coveragePendingBar').style.width=`${100-p}%`}
 function municipalityRows(search=true){const s=$('mapStatusFilter').value,q=search?norm($('municipioSearchMap').value):'';return state.municipalities.filter(r=>(s==='all'||(s==='available')===!!r.tiene_informacion)&&(!q||norm(r.nombre).includes(q)||r.clave.includes(q)))}
 function referenceMunicipalityIds(r){return r?.[state.referenceScope==='presidencias'?'municipios_presidencias':state.referenceScope==='locales'?'municipios_diputaciones_locales':'municipios_diputaciones_federales']||[]}
 function referenceCount(r){return state.referenceScope==='presidencias'?r.total_presidencias:state.referenceScope==='locales'?r.total_diputaciones_locales:r.total_diputaciones_federales}
 function referenceAspirantCount(r){return Number(r?.total_aspirantes||0)}
 function referenceScopeLabel(){return state.referenceScope==='presidencias'?'PRESIDENCIAS':state.referenceScope==='locales'?'DIPUTACIONES LOCALES':'DIPUTACIONES FEDERALES'}
 function referenceRows(){const q=norm($('referenceSearch').value),s=$('referenceStatusFilter').value;return state.references.filter(r=>referenceCount(r)>0&&(!q||norm(r.nombre).includes(q))&&(s==='all'||(s==='review')===r.requiere_revision))}
 function selectedReferenceRows(){return state.selectedReferenceKeys.map(key=>state.references.find(reference=>reference.key===key)).filter(reference=>reference&&referenceCount(reference)>0)}
 function renderReferenceSubLayers(){
  const panel=$('referenceViewSelector');
  if(!panel)return;
  panel.classList.toggle('hidden',state.mode!=='referentes');
  $('selectedReferenceCount').textContent=`${state.selectedReferenceKeys.length} seleccionados`;
  panel.querySelectorAll('[data-reference-view]').forEach(button=>{
   button.classList.toggle('active',button.dataset.referenceView===state.referenceView);
  });
  const labelsButton=$('toggleReferenceLabels');
  labelsButton.classList.toggle('hidden',state.mode!=='referentes'||Boolean(state.referenceAspirantKey));
  labelsButton.setAttribute('aria-pressed',String(state.referenceLabelsVisible));
  labelsButton.innerHTML=state.referenceLabelsVisible
   ? '<i class="bi bi-eye-slash" aria-hidden="true"></i><span>OCULTAR ETIQUETAS</span>'
   : '<i class="bi bi-eye" aria-hidden="true"></i><span>MOSTRAR ETIQUETAS</span>';
  updateMapReferencePhoto();
 }
 function updateMapReferencePhoto(){
  const panel=$('mapReferencePhoto');
  if(!panel)return;
  const selected=state.mode==='referentes'
   ? state.selectedReferenceKeys.map(key=>state.references.find(reference=>reference.key===key)).filter(Boolean)
   : [];
  if(state.referenceAspirantKey&&!selected.length&&state.selectedReference)selected.push(state.selectedReference);
  if(!selected.length){panel.classList.add('hidden');panel.classList.remove('is-aspirant-ranking');panel.innerHTML='';return;}
  panel.classList.remove('hidden');
  panel.classList.toggle('is-aspirant-ranking',Boolean(state.referenceAspirantKey&&selected.length===1));
  if(selected.length===1){
   const reference=selected[0];
   const role=reference.rol||reference.cargo||reference.partido||reference.partido_politico||'REFERENTE';
   const records=reference.aspirantes||[];
   const municipalityCounts=new Map();
   records.forEach(item=>{const id=String(item.municipio_id);const municipality=state.municipalities.find(row=>String(row.municipio_id)===id);const current=municipalityCounts.get(id)||{id,nombre:municipality?.nombre||'MUNICIPIO',total:0};current.total+=1;municipalityCounts.set(id,current)});
   const ranking=[...municipalityCounts.values()].sort((a,b)=>b.total-a.total||a.nombre.localeCompare(b.nombre,'es'));
   const rankingHtml=state.referenceAspirantKey?`<section class="map-reference-ranking"><header><span>MUNICIPIOS ACTIVOS</span><strong class="map-reference-ranking-count flip-value is-flipping">${String(ranking.length).padStart(2,'0')}</strong></header><div>${ranking.length?ranking.map(item=>`<div data-reference-ranking-municipio="${esc(item.id)}"><span>${esc(item.nombre)}</span><b>${String(item.total).padStart(2,'0')}</b></div>`).join(''):'<small>SIN MUNICIPIOS ACTIVOS</small>'}</div></section>`:'';
   panel.innerHTML=`<div class="map-reference-photo-content"><article class="map-reference-photo-card map-reference-photo-card-main" style="--reference-photo-color:${esc(reference.color||'#8f173d')}"><header><span class="map-reference-color-dot"></span>${esc(reference.nombre)}</header><span class="map-reference-avatar">${reference.foto_url?`<img src="${esc(reference.foto_url)}" alt="">`:'<i class="bi bi-person-fill"></i>'}</span><strong class="map-reference-role">${esc(role)}</strong></article>${rankingHtml}</div>`;
  }else{
   panel.innerHTML=`<div class="map-reference-photo-chips">${selected.map(reference=>`<div class="map-reference-photo-chip" style="--reference-photo-color:${esc(reference.color||'#8f173d')}"><span class="map-reference-chip-color"></span><span class="map-reference-chip-avatar">${reference.foto_url?`<img src="${esc(reference.foto_url)}" alt="">`:'<i class="bi bi-person-fill"></i>'}</span><strong>${esc(reference.nombre)}</strong><button type="button" data-remove-reference="${esc(reference.key)}" aria-label="Quitar ${esc(reference.nombre)}"><i class="bi bi-x-lg"></i></button></div>`).join('')}</div>`;
  }
 }
 function partyRows(){const q=norm($('partySearch').value);return state.parties.filter(p=>!q||norm(p.nombre).includes(q))}
 function aspirantRows() {
  const query = norm($('aspirantSearch').value);

  return state.aspirantMunicipalities.filter(municipality => (
   !query
   || norm(municipality.nombre).includes(query)
   || String(municipality.clave).includes(query)
  ));
 }
 function normalizedSubreferenceName(value){
  return String(value||'')
   .normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'')
   .toUpperCase()
   .replace(/[^A-Z0-9]+/g,' ')
   .replace(/\s+/g,' ')
   .trim();
 }
 function subreferenceColor(key,usedHues){
  let hash=0;
  for(const character of key)hash=(hash*31+character.charCodeAt(0))>>>0;
  let hue=hash%360;
  for(let attempt=0;attempt<12;attempt+=1){
   const separated=usedHues.every(used=>{
    const distance=Math.abs(used-hue);
    return Math.min(distance,360-distance)>=24;
   });
   if(separated)break;
   hue=(hue+137.508)%360;
  }
  usedHues.push(hue);
  return `hsl(${hue.toFixed(1)} 68% 39%)`;
 }
 function buildSubreferences(){
  const groups=new Map();
  state.aspirantMunicipalities.forEach(municipality=>{
   (municipality.aspirantes||[]).forEach(aspirant=>{
    const nombre=String(aspirant.subreferente||'').trim();
    const key=normalizedSubreferenceName(nombre);
    if(!key)return;
    if(!groups.has(key))groups.set(key,{
     key,
     variants:new Map(),
     municipalities:new Map(),
     total_aspirantes:0
    });
    const group=groups.get(key);
    group.variants.set(nombre,(group.variants.get(nombre)||0)+1);
    group.municipalities.set(municipality.municipio_id,municipality.nombre);
    group.total_aspirantes+=1;
   });
  });
  const usedHues=[];
  state.subreferences=[...groups.values()]
   .map(group=>({
    key:group.key,
    nombre:[...group.variants.entries()]
     .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es'))[0][0],
    variantes:[...group.variants.keys()].sort((a,b)=>a.localeCompare(b,'es')),
    municipios:[...group.municipalities.keys()],
    total_municipios:group.municipalities.size,
    total_aspirantes:group.total_aspirantes,
    color:subreferenceColor(group.key,usedHues)
   }))
   .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
 }
 function filteredSubreferences(){
  const query=normalizedSubreferenceName($('subreferenceSearch').value);
  return state.subreferences.filter(item=>!query||normalizedSubreferenceName(item.nombre).includes(query));
 }
 function historyFilteredRows(){
  const periods=state.historyPeriods, references=state.historyReferences;
  const historical=state.history.rows.filter(row=>!periods.length||periods.includes(row.periodo));
  const current=periods.includes('ACTUAL')
   ? state.history.current.map(row=>({...row,periodo:'ACTUAL',referente_original:row.referente,referente_normalizado:row.referente_normalizado}))
   : [];
  return [...historical,...current].filter(row=>!references.length||references.includes(row.referente_normalizado));
 }
 function renderHistoryControls(){
  const periods=state.history.periodos.map(item=>item.periodo);
  $('historyPeriod').innerHTML='<option value="__clear__">Quitar selección</option>'+periods.map(period=>`<option value="${esc(period)}">${esc(period)}</option>`).join('')+'<option value="ACTUAL">ACTUAL EN SISTEMA</option>';
  state.historyPeriods=[...$('historyPeriod').options].filter(option=>option.selected).map(option=>option.value);
  const references=[...new Map(state.history.rows.filter(row=>row.referente_normalizado).map(row=>[row.referente_normalizado,row.referente_original])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'es'));
  $('historyReference').innerHTML='<option value="__clear__">Quitar selección</option>'+references.map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join('');
  state.historyReferences=[];
  $('historyTimeline').innerHTML='<span class="history-period-legend"><i style="background:#b28a4a"></i>2021-2024</span><span class="history-period-legend"><i style="background:#2f6f95"></i>2024-2025</span><span class="history-period-legend"><i style="background:#8f173d"></i>ACTUAL</span>';
 }
 function historyList(){
  const rows=historyFilteredRows();
  $('visibleMunicipios').textContent=rows.length;
  $('listHeading').textContent='REGISTROS HISTÓRICOS';
  $('mapMunicipalityList').innerHTML=rows.length?rows.slice(0,125).map((row,index)=>`<div class="map-municipality-item"><span class="party-list-number">${index+1}.</span><span class="municipality-copy"><strong>${esc(row.municipio_nombre)}</strong><small>${esc(row.periodo)} · ${esc(row.referente_original||'SIN REFERENTE')}</small></span></div>`).join(''):empty();
 }
 function historyMap(){
  const rows=historyFilteredRows();
  const counts=new Map();
  rows.forEach(row=>{if(!counts.has(row.municipio_id))counts.set(row.municipio_id,[]);counts.get(row.municipio_id).push(row.periodo)});
  const max=Math.max(1,...[...counts.values()].map(periods=>periods.length));
  window.setCapasMapa(state.municipalities.map(municipality=>{
   const periods=counts.get(municipality.municipio_id)||[];
   const period=periods.includes('ACTUAL')?'ACTUAL':periods.includes('2024-2025')?'2024-2025':'2021-2024';
   return {...municipality,history_total:periods.length,history_periods:periods,history_color:period==='ACTUAL'?'#8f173d':period==='2024-2025'?'#2f6f95':'#b28a4a',history_rank:periods.length};
  }));
  window.switchMapLayer('historial');
 }
 function updateHistoryKpis(){
  const panel=$('historyKpis');
  if(!panel)return;
  const rows=historyFilteredRows(), periods=state.historyPeriods;
  const municipalities=new Set(rows.map(row=>row.municipio_id).filter(Boolean));
  const currentByMunicipality=new Map(state.history.current.map(row=>[row.municipio_id,row.referente_normalizado]));
  const historicalByMunicipality=new Map();
  state.history.rows.filter(row=>!periods.length||periods.includes(row.periodo)).forEach(row=>historicalByMunicipality.set(row.municipio_id,row.referente_normalizado));
  let changes=0;
  historicalByMunicipality.forEach((value,id)=>{if(currentByMunicipality.has(id)&&currentByMunicipality.get(id)!==value)changes+=1});
  $('historyKpiPeriods').textContent=periods.length||'TODOS';
  $('historyKpiMunicipalities').textContent=municipalities.size;
  const changesKpi=$('historyKpiChanges');
  if(changesKpi)changesKpi.textContent=changes;
  const periodColors={'2021-2024':'#b28a4a','2024-2025':'#2f6f95','ACTUAL':'#8f173d'};
  const counts=periods.map(period=>({period,count:new Set(rows.filter(row=>row.periodo===period).map(row=>row.municipio_id)).size}));
  const max=Math.max(1,...counts.map(item=>item.count));
  $('historyBars').innerHTML=counts.map(item=>`<div class="history-bar-row"><span>${esc(item.period)}</span><span class="history-bar-track"><i style="width:${Math.round(item.count/max*100)}%;background:${periodColors[item.period]||'#65717f'}"></i></span><b>${item.count}</b></div>`).join('');
  const referenceColors=['#8f173d','#2f6f95','#b28a4a','#5b3a8e','#2f7d5a','#a65f38'];
  const selectedRefs=state.historyReferences;
  $('historyReferenceCounters').innerHTML=selectedRefs.map((key,index)=>{
   const item=rows.filter(row=>row.referente_normalizado===key);
   const name=item[0]?.referente_original||key;
   const municipalities=new Set(item.map(row=>row.municipio_id).filter(Boolean)).size;
   const refPeriods=[...new Set(item.map(row=>row.periodo).filter(Boolean))];
   const historicalItem=item.filter(row=>row.periodo!=='ACTUAL');
   const historicalMunicipalities=new Set(historicalItem.map(row=>row.municipio_id).filter(Boolean));
   const changes=[...historicalMunicipalities].filter(id=>currentByMunicipality.has(id)&&currentByMunicipality.get(id)!==key).length;
   const refCounts=refPeriods.map(period=>({period,count:new Set(item.filter(row=>row.periodo===period).map(row=>row.municipio_id)).size}));
   const refMax=Math.max(1,...refCounts.map(entry=>entry.count));
   return `<article class="history-reference-counter" style="--reference-counter-color:${referenceColors[index%referenceColors.length]}">
    <div class="history-reference-kpi-head"><span class="history-reference-dot"></span><strong>${esc(name)}</strong></div>
    <div class="history-reference-metrics"><div><small>PERIODOS</small><strong>${refPeriods.length}</strong></div><div><small>MUNICIPIOS</small><strong>${municipalities}</strong></div><button type="button" class="history-reference-metric history-changes-trigger" data-reference="${esc(key)}"><small>CAMBIOS VS ACTUAL</small><strong>${changes}</strong></button></div>
    <div class="history-reference-bars">${refCounts.map(entry=>`<div class="history-bar-row"><span>${esc(entry.period)}</span><span class="history-bar-track"><i style="width:${Math.round(entry.count/refMax*100)}%;background:${periodColors[entry.period]||'var(--reference-counter-color)'}"></i></span><b>${entry.count}</b></div>`).join('')}</div>
   </article>`;
  }).join('');
  const hasSelection=state.historyPeriods.length>0||state.historyReferences.length>0;
  panel.classList.toggle('hidden',state.mode!=='historial'||!hasSelection);
  $('historyReferenceCounters').classList.add('hidden');
  $('openHistoryReferenceCards').classList.toggle('hidden',state.mode!=='historial'||state.historyReferences.length===0);
  const modalGrid=document.querySelector('.history-modal-card-grid');
  if(modalGrid)modalGrid.innerHTML=$('historyReferenceCounters').innerHTML;
 }
 function openHistoryReferenceCards(){
  const cards=$('historyReferenceCounters').innerHTML;
  if(!cards){Swal.fire({icon:'info',title:'Sin indicadores',text:'Selecciona al menos un referente para visualizar sus indicadores.',confirmButtonColor:'#8f173d'});return;}
  Swal.fire({title:'Indicadores por referente',html:`<div class="history-modal-card-grid">${cards}</div>`,width:760,position:'top-end',backdrop:false,allowOutsideClick:false,confirmButtonText:'Cerrar',confirmButtonColor:'#8f173d',customClass:{popup:'history-indicators-modal'},didOpen:()=>$('historyFilters').classList.add('history-filters-focus'),didClose:()=>$('historyFilters').classList.remove('history-filters-focus')});
 }
 function showHistoryChanges(referenceKey){
  const periods=state.historyPeriods;
  const currentByMunicipality=new Map(state.history.current.map(row=>[row.municipio_id,row.referente_normalizado]));
  const historical=state.history.rows.filter(row=>(!periods.length||periods.includes(row.periodo))&&row.referente_normalizado===referenceKey);
  const byMunicipality=new Map();
  historical.forEach(row=>{if(!byMunicipality.has(row.municipio_id))byMunicipality.set(row.municipio_id,row)});
  const changes=[...byMunicipality.values()].filter(row=>!currentByMunicipality.has(row.municipio_id)||currentByMunicipality.get(row.municipio_id)!==referenceKey);
  const name=historical[0]?.referente_original||referenceKey;
  const content=changes.length?`<div class="history-change-list">${changes.map(row=>{
   const current=state.history.current.find(item=>item.municipio_id===row.municipio_id);
   return `<div class="history-change-item"><strong>${esc(row.municipio_nombre)}</strong><small>Histórico: ${esc(row.periodo)} · Actual: ${esc(current?.referente_original||current?.referente||'SIN REFERENTE')}</small></div>`;
  }).join('')}</div>`:'<p class="history-empty-message">No se encontraron municipios con cambios para este referente.</p>';
  Swal.fire({title:`Cambios vs actual · ${esc(name)}`,html:content,width:560,confirmButtonText:'Cerrar',confirmButtonColor:'#8f173d',didClose:()=>{
   if(state.mode==='historial'&&state.historyReferences.length)openHistoryReferenceCards();
  }});
 }
 function totals(type) {
  let total;
  let available;
  let pending;

  if (type === 'aspirantes') {
   total = state.aspirantSummary.total_aspirantes || 0;
   available = state.aspirantSummary.municipios_con_aspirantes || 0;
   pending = state.aspirantSummary.municipios_sin_aspirantes || 0;
   $('coverageAvailable').textContent = 'Municipios con aspirantes';
   $('coveragePending').textContent = 'Municipios sin aspirantes';
  } else if (type === 'referentes') {
   const rows = selectedReferenceRows().length?selectedReferenceRows():referenceRows();
   const ids = new Set(rows.flatMap(referenceMunicipalityIds));
   total = rows.length;
   available = ids.size;
   pending = Math.max(0, state.municipalities.length - available);
   $('coverageAvailable').textContent = `Municipios con ${referenceScopeLabel().toLowerCase()}`;
   $('coveragePending').textContent = `${pending} municipios sin vínculo`;
  } else if (type === 'partidos') {
   const summary = state.partySummary;
   total = summary.total_partidos || 0;
   available = summary.municipios_con_partido || 0;
   pending = summary.municipios_sin_partido || 0;
   $('coverageAvailable').textContent = 'Con partido gobernante';
   $('coveragePending').textContent = 'Sin partido capturado';
  } else if (type === 'historial') {
   const rows=historyFilteredRows();
   total=rows.length;
   available=new Set(rows.map(row=>row.municipio_id).filter(Boolean)).size;
   pending=Math.max(0,state.municipalities.length-available);
   $('coverageAvailable').textContent='Municipios con registro histórico';
   $('coveragePending').textContent='Sin registro en el periodo';
  } else {
   total = state.municipalities.length;
   available = state.municipalities.filter(row => row.tiene_informacion).length;
   pending = total - available;
   $('coverageAvailable').textContent = `Cobertura ${total ? Math.round(available / total * 100) : 0}%`;
   $('coveragePending').textContent = `Pendiente ${total ? Math.round(pending / total * 100) : 0}%`;
  }

  flip('totalMunicipios', total);
  flip('totalConInformacion', available);
  flip('totalPendientes', pending);
  progress(available, state.municipalities.length || 1);
 }
 function municipalityList(){const rows=municipalityRows();$('visibleMunicipios').textContent=rows.length;$('mapMunicipalityList').innerHTML=rows.length?rows.map(r=>`<button class="map-municipality-item${state.selectedMunicipality?.municipio_id===r.municipio_id?' active':''}" data-municipio-id="${esc(r.municipio_id)}"><span class="municipality-code">${esc(r.clave)}</span><span class="municipality-copy"><strong>${esc(r.nombre)}</strong><small>${r.tiene_informacion?`ACTUALIZADA · REV. ${r.revision}`:'SIN CAPTURA'}</small></span><span class="municipality-state ${r.tiene_informacion?'available':'pending'}"><i class="bi ${r.tiene_informacion?'bi-file-earmark-check-fill':'bi-file-earmark'}"></i></span></button>`).join(''):empty()}
 function referenceList(){
  const rows=referenceRows();
  renderReferenceSubLayers();
  $('visibleMunicipios').textContent=rows.length;
  $('listHeading').textContent=state.referenceView==='capas'?'SUBCAPAS DISPONIBLES':'REFERENTES';
  $('mapMunicipalityList').innerHTML=rows.length
   ? rows.map(reference=>state.referenceView==='capas'?`
    <label class="reference-layer-option">
     <input type="checkbox" data-reference-layer value="${esc(reference.key)}" ${state.selectedReferenceKeys.includes(reference.key)?'checked':''}>
   <span class="reference-color-swatch" style="--reference-color:${esc(reference.color)}"></span>
     <span class="municipality-copy"><strong>${esc(reference.nombre)}</strong><small>${referenceMunicipalityIds(reference).length} MUNICIPIOS · ${referenceCount(reference)} ${referenceScopeLabel()}</small></span>
     <span class="municipality-state available">${referenceMunicipalityIds(reference).length}</span>
    </label>
   `:`
    <button
     class="map-municipality-item reference-item${state.selectedReference?.key===reference.key?' active':''}"
     data-reference-key="${esc(reference.key)}"
    >
     <span class="reference-avatar">
      ${reference.foto_url?`<img src="${esc(reference.foto_url)}" alt="">`:'<i class="bi bi-person-fill"></i>'}
     </span>
     <span class="municipality-copy">
      <strong>${esc(reference.nombre)}</strong>
      <small>${referenceMunicipalityIds(reference).length} MUNICIPIOS · ${referenceCount(reference)} ${referenceScopeLabel()}</small>
      <span class="reference-aspirant-count reference-aspirant-trigger" data-reference-aspirants-key="${esc(reference.key)}" role="button" tabindex="0" title="Ver municipios con aspirantes de este referente"><i class="bi bi-people-fill"></i> ${referenceAspirantCount(reference)} ASPIRANTES 2027</span>
     </span>
     <span class="municipality-state ${reference.requiere_revision?'review':'available'}">
      <i class="bi ${reference.requiere_revision?'bi-exclamation-diamond-fill':'bi-diagram-3-fill'}"></i>
     </span>
    </button>
   `).join('')
   : empty();
 }
 function partyList() {
  const rows = partyRows();
  $('visibleMunicipios').textContent = rows.length;

  $('mapMunicipalityList').innerHTML = rows.length
   ? rows.map((p, index) => `
    <button
     class="map-municipality-item party-text-option${state.selectedParty?.key === p.key ? ' active' : ''}"
     data-party-key="${esc(p.key)}"
     title="${esc(p.nombre)} · ${p.total_municipios} municipios"
     aria-label="${esc(p.nombre)}, ${p.total_municipios} municipios gobernados"
    >
     <span class="party-list-number">${index + 1}.</span>
     <span class="municipality-copy">
      <strong>${esc(p.nombre)}</strong>
      <small>${p.total_municipios} MUNICIPIOS GOBERNADOS</small>
     </span>
    </button>
   `).join('')
   : empty();
 }
 function aspirantList() {
  const rows = aspirantRows();
  $('visibleMunicipios').textContent = rows.length;

  $('mapMunicipalityList').innerHTML = rows.length
   ? rows.map((municipality, index) => `
    <button
     class="map-municipality-item aspirant-municipality-option${state.selectedAspirantMunicipality?.municipio_id === municipality.municipio_id ? ' active' : ''}"
     data-aspirant-municipality-id="${esc(municipality.municipio_id)}"
    >
     <span class="party-list-number">${index + 1}.</span>
     <span class="municipality-copy">
      <strong>${esc(municipality.nombre)}</strong>
      <small>${municipality.total_aspirantes} ASPIRANTES CAPTURADOS</small>
     </span>
     <span class="municipality-state available"><i class="bi bi-people-fill"></i></span>
    </button>
   `).join('')
   : empty();
 }
 function subreferenceList(){
  const rows=filteredSubreferences();
  $('visibleMunicipios').textContent=rows.length;
  $('listHeading').textContent='SUBREFERENTES';
  $('mapMunicipalityList').innerHTML=rows.length
   ? rows.map((item,index)=>`
    <button type="button"
     class="map-municipality-item subreference-option${state.selectedSubreferenceKey===item.key?' active':''}"
     data-subreference-key="${esc(item.key)}"
     aria-pressed="${state.selectedSubreferenceKey===item.key}"
     title="${esc(item.nombre)} · ${item.total_municipios} municipios · ${item.total_aspirantes} aspirantes">
     <span class="subreference-color-swatch" style="--subreference-color:${esc(item.color)}"></span>
     <span class="municipality-copy">
      <strong>${index+1}. ${esc(item.nombre)}</strong>
      <small>${item.total_municipios} MUNICIPIOS · ${item.total_aspirantes} ASPIRANTES</small>
     </span>
     <span class="municipality-state available"><i class="bi bi-geo-alt-fill"></i></span>
    </button>
   `).join('')
   : empty();
 }
 function aspirantSubreferenceMap(){
  const selected=state.subreferences.find(item=>item.key===state.selectedSubreferenceKey)||null;
  const municipalityCounts=new Map();
  if(selected){
   const selectedIds=new Set(selected.municipios.map(String));
   state.aspirantMunicipalities.forEach(municipality=>{
    if(!selectedIds.has(String(municipality.municipio_id)))return;
    const count=(municipality.aspirantes||[]).filter(aspirant=>
     normalizedSubreferenceName(aspirant.subreferente)===selected.key
    ).length;
    if(count)municipalityCounts.set(String(municipality.municipio_id),count);
   });
  }
  window.setCapasMapa(state.municipalities.map(municipality=>{
   const count=municipalityCounts.get(String(municipality.municipio_id))||0;
   return {
    ...municipality,
    total:count,
    subreferente_activo:Boolean(selected&&count),
    subreferente_nombre:selected?.nombre||'',
    subreferente_color:selected?.color||''
   };
  }));
  window.switchMapLayer('subreferente');
 }
 function renderAspirantTabs(){
  const general=state.aspirantView==='general';
  $('aspirantGeneralTab').classList.toggle('active',general);
  $('aspirantGeneralTab').setAttribute('aria-selected',String(general));
  $('aspirantSubreferenceTab').classList.toggle('active',!general);
  $('aspirantSubreferenceTab').setAttribute('aria-selected',String(!general));
  $('aspirantGeneralPanel').classList.toggle('hidden',!general);
  $('aspirantSubreferencePanel').classList.toggle('hidden',general);
 }
 function selectSubreference(key){
  state.selectedSubreferenceKey=state.selectedSubreferenceKey===key?null:key;
  state.selectedAspirantMunicipality=null;
  $('aspirantMunicipality').value='';
  const selected=state.subreferences.find(item=>item.key===state.selectedSubreferenceKey)||null;
  subreferenceList();
  aspirantSubreferenceMap();
  $('openSubreferenceAspirantReport').classList.toggle('hidden', !selected);
  if (selected) {
   $('openSubreferenceAspirantReport').querySelector('strong').textContent = `REPORTE DE ${selected.nombre.toLocaleUpperCase('es-MX')}`;
   $('openSubreferenceAspirantReport').querySelector('small').textContent = `${selected.total_aspirantes} aspirantes · ${selected.total_municipios} municipios`;
  }
  $('mapStageTitle').textContent=selected?.nombre||'Distribución municipal por subreferente';
  $('mapStageDescription').textContent=selected
   ? `${selected.total_municipios} municipios · ${selected.total_aspirantes} aspirantes con este subreferente.`
   : 'Selecciona un subreferente para identificar sus municipios.';
  $('mapGuidance').innerHTML=selected
   ? `<strong>${esc(selected.nombre)}</strong> ${selected.total_municipios} municipios resaltados en el mapa.`
   : '<strong>Subreferentes</strong> Elige un nombre para colorear los municipios vinculados.';
  $('openReferenceReport').classList.add('hidden');
 }
 function switchAspirantView(view){
  state.aspirantView=view==='subreferentes'?'subreferentes':'general';
  $('openSubreferenceAspirantReport').classList.add('hidden');
  renderAspirantTabs();
  if(state.aspirantView==='subreferentes'){
   state.selectedSubreferenceKey=null;
   state.selectedAspirantMunicipality=null;
   $('aspirantMunicipality').value='';
   $('subreferenceSearch').value='';
   $('reportInstruction').textContent='Selecciona un subreferente para colorear los municipios donde tiene aspirantes.';
   subreferenceList();
   aspirantSubreferenceMap();
   $('listHeading').textContent='SUBREFERENTES';
   $('mapStageTitle').textContent='Distribución municipal por subreferente';
   $('mapStageDescription').textContent='Selecciona un subreferente para identificar sus municipios.';
   $('mapGuidance').innerHTML='<strong>Subreferentes</strong> Elige un nombre para colorear los municipios vinculados.';
   $('openReferenceReport').classList.add('hidden');
   return;
  }
  state.selectedSubreferenceKey=null;
  $('reportInstruction').textContent='Selecciona un municipio para el reporte individual o genera el reporte general.';
  aspirantList();
  aspirantMap();
  $('listHeading').textContent='MUNICIPIOS CON ASPIRANTES';
  $('mapStageTitle').textContent=state.selectedAspirantMunicipality?.nombre||'Distribución municipal de aspirantes 2027';
  $('mapStageDescription').textContent=state.selectedAspirantMunicipality
   ? `${state.selectedAspirantMunicipality.total_aspirantes} aspirantes capturados.`
   : 'La intensidad del mapa representa el número de aspirantes capturados.';
  $('mapGuidance').innerHTML='<strong>Aspirantes 2027</strong> Selecciona un municipio para generar su reporte.';
  $('openReferenceReport').classList.toggle('hidden',!state.selectedAspirantMunicipality);
 }
 function municipalityMap(){window.setCapasMapa(municipalityRows(false));window.switchMapLayer('fichas')}
 function referenceMap(){
  const selected=selectedReferenceRows();
  const references=selected.length?selected:(state.selectedReference?[state.selectedReference]:[]);
  const referencesByMunicipality=new Map();
  references.forEach(reference=>referenceMunicipalityIds(reference).forEach(id=>{
   if(!referencesByMunicipality.has(id))referencesByMunicipality.set(id,[]);
   referencesByMunicipality.get(id).push({key:reference.key,nombre:reference.nombre,color:reference.color});
  }));
  window.setCapasMapa(state.municipalities.map(row=>{
   const active=referencesByMunicipality.get(row.municipio_id)||[];
   return {...row,referente_activo:active.length>0,referente_nombre:active[0]?.nombre||'',referente_color:active[0]?.color||'',referentes_activos:active};
  }));
  window.switchMapLayer('referente');
 }
 function selectReferenceAspirants(key){
  const reference=state.references.find(item=>item.key===key);
  if(!reference)return;
  state.referenceAspirantKey=key;
  state.selectedReference=reference;
  const records=reference.aspirantes||[];
  const counts=new Map();
  records.forEach(record=>{const id=String(record.municipio_id);counts.set(id,(counts.get(id)||0)+1)});
  window.setCapasMapa(state.municipalities.map(row=>{const id=String(row.municipio_id);const activo=counts.has(id);return {...row,total:counts.get(id)||0,referente_activo:activo,referente_nombre:reference.nombre,referente_color:reference.color,referentes_activos:activo?[{key:reference.key,nombre:reference.nombre,color:reference.color}]:[]}}));
  window.switchMapLayer('referente_aspirantes');
  $('mapStageTitle').textContent=`Aspirantes 2027 · ${reference.nombre}`;
  $('mapStageDescription').textContent=`${records.length} aspirantes en ${counts.size} municipios vinculados.`;
  renderReferenceSubLayers();
  updateMapReferencePhoto();
 }
 function aspirantRoleLabel(item){
  const cargo=item?.cargo_tipo==='DIPUTACION_FEDERAL'?'DIPUTACIÓN FEDERAL':item?.cargo_tipo==='DIPUTACION_LOCAL'?'DIPUTACIÓN LOCAL':'';
  return [cargo,item?.distrito].filter(Boolean).join(' · ');
 }
 function initials(value){
  return String(value||'').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'?';
 }
 function refreshReferenceActorStatuses(records,popup,attempt=0){
  if(!popup?.isConnected)return;
  const ids=[...new Set(records.map(item=>item.persona_id).filter(Boolean).map(String))];
  if(!ids.length)return;
  const batches=[];
  for(let index=0;index<ids.length;index+=200)batches.push(ids.slice(index,index+200));
  Promise.all(batches.map(batch=>api.get(`/api/integracion-actores/estados?ids=${encodeURIComponent(batch.join(','))}`)))
   .then(results=>{
    if(!popup.isConnected)return;
    const statuses=new Map(results.flat().map(status=>[String(status.persona_local_id),status]));
    popup.querySelectorAll('.reference-aspirant-actor-link').forEach(button=>{
     const status=statuses.get(button.dataset.actorPersonId);
     const canOpen=status&&['DISPONIBLE','ENLAZADA','REVISAR'].includes(status.estado);
     button.hidden=!canOpen;
     button.classList.toggle('review',status?.estado==='REVISAR');
     if(!canOpen)return;
     button.title=status.estado==='REVISAR'?'Revisar posibles expedientes en Actores':'Abrir expediente en Actores';
     button.setAttribute('aria-label',button.title);
     button.onclick=event=>{
      event.preventDefault();
      event.stopPropagation();
      const person=records.find(item=>String(item.persona_id)===button.dataset.actorPersonId);
      if(person)window.captureActors.open({
       persona_id:person.persona_id,
       nombre_completo:person.nombre
      },status);
     };
    });
    const waiting=ids.some(id=>!statuses.has(id)||statuses.get(id)?.estado==='PENDIENTE');
    if(waiting&&attempt<3){
     const delays=[2500,6000,12000];
     setTimeout(()=>refreshReferenceActorStatuses(records,popup,attempt+1),delays[attempt]);
    }
   })
   .catch(error=>console.warn('No se pudieron consultar los expedientes de aspirantes:',error.message));
 }
 function enhanceReferenceActorButtons(records,popup){
  popup.querySelectorAll('.reference-aspirant-row').forEach((row,index)=>{
   const person=records[index];
   if(!person?.persona_id||row.querySelector('.reference-aspirant-actor-link'))return;
   const button=document.createElement('button');
   button.type='button';
   button.className='reference-aspirant-actor-link';
   button.dataset.actorPersonId=String(person.persona_id);
   button.hidden=true;
   button.title='Consultar expediente en Actores';
   button.setAttribute('aria-label',button.title);
   button.innerHTML='<i class="bi bi-person-vcard-fill" aria-hidden="true"></i>';
   const party=row.querySelector('.reference-aspirant-party-logos,.reference-aspirant-party');
   if(party)party.before(button);else row.append(button);
  });
  refreshReferenceActorStatuses(records,popup);
 }
 function referenceAspirantRow(item){
  const party=item.partido||'SIN PARTIDO';
  const logos=partyLogoUrls(party);
  const logo=logos.length
   ? `<span class="reference-aspirant-party-logos" title="${esc(party)}">${logos.map(url=>`<img src="${url}" alt="${esc(party)}">`).join('')}</span>`
   : `<span class="reference-aspirant-party reference-aspirant-party-fallback">${esc(party)}</span>`;
  const avatar=item.foto_url
   ? `<img src="${esc(item.foto_url)}" alt="${esc(item.nombre||'Aspirante')}">`
   : esc(initials(item.nombre));
  const meta=aspirantRoleLabel(item);
  const actorButton=item.persona_id
   ? `<button type="button" class="reference-aspirant-actor-link" data-actor-person-id="${esc(item.persona_id)}" hidden title="Consultar expediente en Actores" aria-label="Consultar expediente en Actores"><i class="bi bi-person-vcard-fill" aria-hidden="true"></i></button>`
   : '';
  return `<div class="reference-aspirant-row"><span class="reference-aspirant-avatar">${avatar}</span><span class="reference-aspirant-copy"><strong>${esc(item.nombre||'SIN NOMBRE')}</strong>${meta?`<small>${esc(meta)}</small>`:''}</span>${actorButton}${logo}</div>`;
 }
 function showReferenceAspirantsModal(row,reference){
  const records=(reference?.aspirantes||[]).filter(item=>String(item.municipio_id)===String(row.municipio_id));
  const list=records.length?`<div class="reference-aspirant-list">${records.map(referenceAspirantRow).join('')}</div>`:'<div class="reference-aspirant-empty">Este municipio no tiene aspirantes vinculados con este referente.</div>';
  const html=`<div class="reference-aspirant-shell"><header class="reference-aspirant-header"><div><h2>${esc(row.nombre)}</h2></div><span class="reference-aspirant-code">${esc(row.clave||row.municipio_id)}</span></header><div class="reference-aspirant-body"><div class="reference-aspirant-context"><span><small>REFERENTE ACTIVO</small><strong>${esc(reference?.nombre||'SIN REFERENTE')}</strong></span><b>${records.length}</b></div>${list}</div><footer class="reference-aspirant-footer"><span>${esc(row.ultima_actualizacion||'ÚLTIMA ACTUALIZACIÓN: —')}</span><div><button type="button" class="reference-aspirant-close">CERRAR</button><button type="button" class="reference-aspirant-full"><i class="bi bi-box-arrow-up-right"></i> VER FICHA COMPLETA</button></div></footer></div>`;
  Swal.fire({html,width:448,showConfirmButton:false,showCloseButton:false,backdrop:'rgba(15,23,42,.62)',allowOutsideClick:true,customClass:{popup:'reference-aspirant-modal',container:'reference-aspirant-modal-container'},didOpen:popup=>{
   popup.querySelector('.reference-aspirant-close')?.addEventListener('click',()=>Swal.close());
   popup.querySelector('.reference-aspirant-full')?.addEventListener('click',()=>{Swal.close();openMunicipality(row)});
   enhanceReferenceActorButtons(records,popup);
  }});
 }
 function showSubreferenceAspirantsModal(row,subreference,municipality){
  const records=(municipality?.aspirantes||[]).filter(item=>
   normalizedSubreferenceName(item.subreferente)===subreference.key
  );
  const list=records.length
   ? `<div class="reference-aspirant-list">${records.map(referenceAspirantRow).join('')}</div>`
   : '<div class="reference-aspirant-empty">Este municipio no tiene aspirantes con el subreferente seleccionado.</div>';
  const html=`
   <div class="reference-aspirant-shell">
    <header class="reference-aspirant-header">
     <div><small>ASPIRANTES 2027</small><h2>${esc(row.nombre)}</h2></div>
     <span class="reference-aspirant-code">${esc(row.clave||row.municipio_id)}</span>
    </header>
    <div class="reference-aspirant-body">
     <div class="reference-aspirant-context">
      <span><small>SUBREFERENTE ACTIVO</small><strong>${esc(subreference.nombre)}</strong></span>
      <b>${records.length}</b>
     </div>
     ${list}
    </div>
    <footer class="reference-aspirant-footer">
     <span>${esc(row.ultima_actualizacion||'ÚLTIMA ACTUALIZACIÓN: —')}</span>
     <div><button type="button" class="reference-aspirant-close">CERRAR</button></div>
    </footer>
   </div>`;
  Swal.fire({
   html,
   width:448,
   showConfirmButton:false,
   showCloseButton:false,
   backdrop:'rgba(15,23,42,.62)',
   allowOutsideClick:true,
   customClass:{
    popup:'reference-aspirant-modal',
    container:'reference-aspirant-modal-container'
   },
   didOpen:popup=>{
    popup.querySelector('.reference-aspirant-close')?.addEventListener('click',()=>Swal.close());
    enhanceReferenceActorButtons(records,popup);
   }
  });
 }
 function partyMap(){
  const byId=new Map();
  const aspirantsByMunicipality=new Map(
   state.aspirantMunicipalities.map(municipality=>[
    municipality.municipio_id,
    Number(municipality.total_aspirantes||0)
   ])
  );
  state.parties.forEach(party=>party.municipios.forEach(municipality=>{
   byId.set(municipality.municipio_id,{
    nombre:party.nombre,
    logos:party.logos||[]
   });
  }));

  const rows=state.municipalities.map(municipality=>{
   const party=byId.get(municipality.municipio_id);
   const visible=state.selectedParty
    ? (party?.nombre===state.selectedParty.nombre?party:null)
    : party;

   return {
    ...municipality,
    partido_nombre:party?.nombre||'',
    partido_dominante:visible?.nombre||'',
    partido_logos:visible?.logos||[],
    total_aspirantes:aspirantsByMunicipality.get(municipality.municipio_id)||0
   };
  });

  window.setCapasMapa(rows);
  window.switchMapLayer('partido');
 }
 function aspirantMap() {
  const totalsByMunicipality = new Map(
   state.aspirantMunicipalities.map(item => [item.municipio_id, item.total_aspirantes])
  );
  const selectedId = state.selectedAspirantMunicipality?.municipio_id;
  const rows = state.municipalities.map(municipality => ({
   ...municipality,
   total: selectedId
    ? (municipality.municipio_id === selectedId ? totalsByMunicipality.get(municipality.municipio_id) || 0 : 0)
    : totalsByMunicipality.get(municipality.municipio_id) || 0
  }));

  window.setCapasMapa(rows);
  window.switchMapLayer('aspirantes');
 }
 function updateUrl() {
  const url = new URL(location.href);
  url.searchParams.set('reporte', state.mode);

  state.selectedReference
   ? url.searchParams.set('referente', state.selectedReference.key)
   : url.searchParams.delete('referente');
  state.selectedParty
   ? url.searchParams.set('partido', state.selectedParty.key)
   : url.searchParams.delete('partido');
  state.mode === 'aspirantes' && state.selectedAspirantMunicipality
   ? url.searchParams.set('municipio', state.selectedAspirantMunicipality.municipio_id)
   : url.searchParams.delete('municipio');

  if (state.mode === 'aspirantes') {
   url.searchParams.set('campos', state.aspirantScope);
  } else {
   url.searchParams.delete('campos');
  }

  history.replaceState(null, '', url);
 }
 function closeMenu(){$('reportMenu').classList.add('hidden');$('reportSelector').classList.remove('is-open');$('reportSelector').setAttribute('aria-expanded','false')}
 function mode(value, updateHistory = true) {
  const nextMode = ['fichas', 'referentes', 'partidos', 'aspirantes', 'historial'].includes(value)
   ? value
   : 'fichas';
  const modeChanged = state.mode !== nextMode;
  if (modeChanged) {
   state.selectedReference = null;
   state.selectedReferenceKeys = [];
   state.referenceAspirantKey = null;
   state.selectedParty = null;
   state.selectedAspirantMunicipality = null;
   state.selectedSubreferenceKey = null;
   state.aspirantView = 'general';
   state.selectedMunicipality = null;
   $('referenceSearch').value = '';
   $('referenceStatusFilter').value = 'all';
   $('partySearch').value = '';
   $('aspirantSearch').value = '';
   $('subreferenceSearch').value = '';
   $('aspirantMunicipality').value = '';
  }
  state.mode = nextMode;

  const references = state.mode === 'referentes';
  const parties = state.mode === 'partidos';
  const aspirants = state.mode === 'aspirantes';
  const history = state.mode === 'historial';
  const selectedSubreference = state.subreferences.find(
   item => item.key === state.selectedSubreferenceKey
  );
  $('openSubreferenceAspirantReport').classList.toggle(
   'hidden',
   !(aspirants && state.aspirantView === 'subreferentes' && selectedSubreference)
  );

  if (!history) {
   if (typeof Swal!=='undefined'&&Swal.isVisible())Swal.close();
   state.historyPeriods=[];
   state.historyReferences=[];
   $('historyPeriod').value='';
   $('historyReference').value='';
   $('openHistoryReferenceCards').classList.add('hidden');
  }

  $('municipalityFilters').classList.toggle('hidden', references || parties || aspirants || history);
  $('referenceFilters').classList.toggle('hidden', !references);
  $('referenceViewSelector').classList.toggle('hidden', !references);
  $('partyFilters').classList.toggle('hidden', !parties);
  $('aspirantFilters').classList.toggle('hidden', !aspirants);
  $('historyFilters').classList.toggle('hidden', !history);
  $('historyKpis').classList.toggle('hidden', !history);
  $('municipalityListPanel').classList.toggle('hidden', history);
  updateMapReferencePhoto();

  $('reportSelectorTitle').textContent = references
   ? 'Referentes'
   : parties
    ? 'Partido político'
    : aspirants
     ? 'Aspirantes 2027'
     : history ? 'Historial' : 'Ficha municipal';

  $('reportSelectorIcon').className = `bi ${
   references
    ? 'bi-diagram-3-fill'
    : parties
     ? 'bi-pie-chart-fill'
     : aspirants
      ? 'bi-people-fill'
      : history ? 'bi-clock-history' : 'bi-file-earmark-person-fill'
  }`;

  $('reportInstruction').textContent = references
   ? 'Selecciona un referente para conocer su distribución territorial.'
   : parties
    ? 'Selecciona un partido para identificar los municipios que gobierna.'
    : aspirants
     ? 'Selecciona un municipio para el reporte individual o genera el reporte general.'
     : 'Selecciona un polígono o municipio para consultar su ficha capturada.';

  $('listHeading').textContent = references
   ? 'REFERENTES'
   : parties
    ? 'PARTIDOS POLÍTICOS'
    : aspirants
     ? 'MUNICIPIOS CON ASPIRANTES'
     : history ? 'HISTORIAL' : 'MUNICIPIOS';
  if(aspirants)$('listHeading').textContent=state.aspirantView==='subreferentes'?'SUBREFERENTES':'MUNICIPIOS CON ASPIRANTES';
  renderAspirantTabs();

  $('totalLabel').textContent = references
   ? 'REFERENTES IDENTIFICADOS'
   : parties
    ? 'PARTIDOS IDENTIFICADOS'
    : aspirants
     ? 'ASPIRANTES CAPTURADOS'
     : 'UNIVERSO CARTOGRÁFICO';

  $('totalCaption').textContent = aspirants ? 'Registros en todos los municipios' : history ? 'Excel histórico normalizado' : 'Cobertura del reporte';
  $('availableLabel').textContent = aspirants ? 'CON ASPIRANTES' : references ? 'CON REFERENTE' : parties ? 'CON PARTIDO' : 'CON INFORMACIÓN';
  $('pendingLabel').textContent = aspirants ? 'SIN ASPIRANTES' : references ? 'SIN REFERENTE' : parties ? 'SIN PARTIDO' : 'SIN CAPTURA';
  $('totalIcon').className = `bi ${aspirants ? 'bi-people-fill' : history ? 'bi-clock-history' : references ? 'bi-diagram-3-fill' : parties ? 'bi-pie-chart-fill' : 'bi-geo-alt-fill'}`;

  $('mapStageTitle').textContent = aspirants
   ? state.selectedAspirantMunicipality?.nombre || 'Distribución municipal de aspirantes 2027'
   : references
    ? state.selectedReference?.nombre || 'Distribución territorial por referente'
    : parties
     ? state.selectedParty?.nombre || 'Gobiernos municipales por partido'
     : 'Consulta territorial de fichas';

  $('mapStageDescription').textContent = aspirants
   ? state.selectedAspirantMunicipality
    ? `${state.selectedAspirantMunicipality.total_aspirantes} aspirantes capturados.`
    : 'La intensidad del mapa representa el número de aspirantes capturados.'
   : references
    ? 'Selecciona un referente para visualizar su cobertura.'
    : parties
     ? 'Cada color representa el partido registrado en Presidencia Municipal.'
     : 'Los municipios en guinda cuentan con información capturada.';

  $('mapGuidance').innerHTML = aspirants
   ? '<strong>Aspirantes 2027</strong> Selecciona un municipio para generar su reporte.'
   : references
    ? '<strong>Reporte por referente</strong> Selecciona un nombre en el panel lateral.'
    : parties
     ? '<strong>Partido gobernante</strong> Selecciona un partido para aislar sus municipios.'
     : '<strong>Consulta directa</strong> Haz clic sobre cualquier municipio.';

  const hasIndividualReport = references && state.selectedReference
   || parties && state.selectedParty
   || aspirants && state.selectedAspirantMunicipality;
  $('openReferenceReport').classList.toggle('hidden', !hasIndividualReport);
  $('openReferenceReport').innerHTML = aspirants
   ? '<i class="bi bi-file-earmark-pdf-fill"></i> REPORTE INDIVIDUAL'
   : '<i class="bi bi-file-earmark-pdf-fill"></i> VER REPORTE';

  totals(state.mode);

  if (references) {
   referenceList();
   renderReferenceSubLayers();
   referenceMap();
  } else if (parties) {
   partyList();
   partyMap();
  } else if (aspirants) {
   if(state.aspirantView==='subreferentes'){
    subreferenceList();
    aspirantSubreferenceMap();
    const selected=state.subreferences.find(item=>item.key===state.selectedSubreferenceKey);
    $('mapStageTitle').textContent=selected?.nombre||'Distribución municipal por subreferente';
    $('mapStageDescription').textContent=selected
     ? `${selected.total_municipios} municipios · ${selected.total_aspirantes} aspirantes con este subreferente.`
     : 'Selecciona un subreferente para identificar sus municipios.';
    $('mapGuidance').innerHTML=selected
     ? `<strong>${esc(selected.nombre)}</strong> ${selected.total_municipios} municipios resaltados en el mapa.`
     : '<strong>Subreferentes</strong> Elige un nombre para colorear los municipios vinculados.';
   }else{
    aspirantList();
    aspirantMap();
   }
  } else if (history) {
   historyList();
   historyMap();
   updateHistoryKpis();
  } else {
   municipalityList();
   municipalityMap();
  }

  closeMenu();
  if (updateHistory) updateUrl();
 }
 function closeReport(){$('municipalReportBackdrop').classList.add('hidden');$('municipalReportFrame').src='about:blank';$('municipalReportFrame').classList.remove('ready');$('reportPreviewLoading').classList.remove('hidden');document.body.classList.remove('report-open')}
 function shell(){$('municipalReportFrame').classList.remove('ready');$('reportPreviewLoading').classList.remove('hidden');$('municipalReportBackdrop').classList.remove('hidden');document.body.classList.add('report-open')}
 async function openMunicipality(r){state.selectedMunicipality=r;if(state.mode==='fichas')municipalityList();window.resaltarMunicipioById(r.id_municipio);if(!r.tiene_informacion)return Swal.fire({icon:'info',title:r.nombre,text:'Este municipio todavía no cuenta con una ficha capturada.',confirmButtonColor:'#8f173d'});document.querySelector('.municipal-report-modal').classList.remove('reference-report-view');$('reportModalIcon').className='bi bi-building-fill';$('reportModalKicker').textContent='FICHA MUNICIPAL · CONSULTA CARTOGRÁFICA';$('municipalReportTitle').textContent=r.nombre;$('municipalReportMeta').textContent=`CLAVE ${r.clave} · ${r.estatus||'EN CAPTURA'}`;$('reportSummaryBar').classList.remove('hidden');$('reportUpdated').textContent=date(r.ultima_actualizacion);$('reportRevision').textContent=String(r.revision||0);$('reportAspirants').textContent='—';$('reportTerritory').textContent='—';$('downloadMunicipalPdf').href=`/api/pdf/${encodeURIComponent(r.municipio_id)}`;shell();try{const f=await api.get(`/api/reportes/mapa/${encodeURIComponent(r.municipio_id)}/ficha`);$('reportUpdated').textContent=date(f.ultima_actualizacion);$('reportRevision').textContent=String(f.revision||0);$('reportAspirants').textContent=String(f.aspirantes?.length||0);$('reportTerritory').textContent=String(f.territorio?.length||0);$('municipalReportFrame').src=`/api/pdf/preview/${encodeURIComponent(r.municipio_id)}`}catch(e){closeReport();Swal.fire({icon:'error',title:'NO SE PUDO ABRIR LA FICHA',text:e.message,confirmButtonColor:'#8f173d'})}}
 async function selectReference(reference){
  try{
   state.referenceAspirantKey=null;
   state.selectedReference=await api.get(`/api/reportes/mapa/referentes/detalle?key=${encodeURIComponent(reference.key)}`);
   state.selectedReferenceKeys=[reference.key];
   referenceList();
   totals('referentes');
   referenceMap();
   $('mapStageTitle').textContent=state.selectedReference.nombre;
   $('mapStageDescription').textContent=`${referenceMunicipalityIds(state.selectedReference).length} municipios · ${referenceCount(state.selectedReference)} ${referenceScopeLabel().toLowerCase()} · ${referenceAspirantCount(state.selectedReference)} aspirantes 2027${state.selectedReference.requiere_revision?' · Hay variantes por revisar.':''}`;
   $('openReferenceReport').classList.remove('hidden');
   updateUrl();
  }catch(error){
   Swal.fire({icon:'error',title:'NO SE PUDO CARGAR EL REFERENTE',text:error.message,confirmButtonColor:'#8f173d'});
  }
 }
 function changeReferenceScope(){
  const selectedKey=state.selectedReference?.key||state.selectedReferenceKeys[0]||null;
  state.referenceScope=$('referenceScope').value;
  state.referenceAspirantKey=null;
  state.selectedReference=selectedKey
   ? state.references.find(reference=>reference.key===selectedKey)||state.selectedReference
   : null;
  if(selectedKey&&!state.selectedReferenceKeys.includes(selectedKey))state.selectedReferenceKeys=[selectedKey];
  totals('referentes');
  referenceList();
  referenceMap();
  $('mapStageTitle').textContent=state.selectedReference?.nombre||`Referentes por ${referenceScopeLabel().toLowerCase()}`;
  $('mapStageDescription').textContent=state.selectedReference
   ? `${referenceMunicipalityIds(state.selectedReference).length} municipios · ${referenceCount(state.selectedReference)} ${referenceScopeLabel().toLowerCase()} · ${referenceAspirantCount(state.selectedReference)} aspirantes 2027`
   : `Selecciona un referente vinculado con ${referenceScopeLabel().toLowerCase()}.`;
  $('openReferenceReport').classList.toggle('hidden',!state.selectedReference);
  updateUrl();
 }
 function selectParty(p){state.selectedParty=p;partyList();partyMap();$('mapStageTitle').textContent=p.nombre;$('mapStageDescription').textContent=`${p.total_municipios} municipios gobernados según Presidencia Municipal.`;$('openReferenceReport').classList.remove('hidden');updateUrl()}
 function selectAspirantMunicipality(municipality) {
  state.selectedAspirantMunicipality = municipality;
  $('aspirantMunicipality').value = municipality?.municipio_id || '';
  aspirantList();
  aspirantMap();

  const mapMunicipality = municipality
   ? state.municipalities.find(row => row.municipio_id === municipality.municipio_id)
   : null;

  if (mapMunicipality) {
   window.resaltarMunicipioById(mapMunicipality.id_municipio);
  } else {
   window.resetMunicipiosHighlight();
  }

  $('mapStageTitle').textContent = municipality?.nombre || 'Distribución municipal de aspirantes 2027';
  $('mapStageDescription').textContent = municipality
   ? `${municipality.total_aspirantes} aspirantes capturados.`
   : 'La intensidad del mapa representa el número de aspirantes capturados.';
  $('openReferenceReport').classList.toggle('hidden', !municipality);
  updateUrl();
 }

 function aspirantQuery(general = false) {
  const parameters = new URLSearchParams({ scope: state.aspirantScope });

  if (!general && state.selectedAspirantMunicipality) {
   parameters.set('municipioId', state.selectedAspirantMunicipality.municipio_id);
  }

  return parameters.toString();
 }

 function openAspirantReport(general = false) {
  if (!general && !state.selectedAspirantMunicipality) return;

  const query = aspirantQuery(general);
  const base = general
   ? '/api/reportes/mapa/aspirantes/general'
   : '/api/reportes/mapa/aspirantes';
  const count = general
   ? state.aspirantSummary.total_aspirantes || 0
   : state.selectedAspirantMunicipality.total_aspirantes;

  document.querySelector('.municipal-report-modal').classList.add('reference-report-view');
  $('reportModalIcon').className = 'bi bi-people-fill';
  $('reportModalKicker').textContent = 'ASPIRANTES 2027 · REPORTE CARTOGRÁFICO';
  $('municipalReportTitle').textContent = general
   ? 'Reporte general de aspirantes'
   : state.selectedAspirantMunicipality.nombre;
  $('municipalReportMeta').textContent = `${count} ASPIRANTES · ${general ? 'TODOS LOS MUNICIPIOS' : 'REPORTE INDIVIDUAL'}`;
  $('reportSummaryBar').classList.add('hidden');
  $('downloadMunicipalPdf').href = `${base}/pdf?${query}`;
  shell();
  $('municipalReportFrame').src = `${base}/vista-previa?${query}`;
 }
 function openSubreferenceAspirantReport() {
  const selected = state.subreferences.find(item => item.key === state.selectedSubreferenceKey);
  if (!selected) return;

  const query = new URLSearchParams({ subreferente: selected.nombre }).toString();
  const base = '/api/reportes/mapa/aspirantes/subreferente';
  document.querySelector('.municipal-report-modal').classList.add('reference-report-view');
  $('reportModalIcon').className = 'bi bi-person-lines-fill';
  $('reportModalKicker').textContent = 'ASPIRANTES 2027 · REPORTE POR SUBREFERENTE';
  $('municipalReportTitle').textContent = selected.nombre;
  $('municipalReportMeta').textContent = `${selected.total_aspirantes} ASPIRANTES · ${selected.total_municipios} MUNICIPIOS`;
  $('reportSummaryBar').classList.add('hidden');
  $('downloadMunicipalPdf').href = `${base}/pdf?${query}`;
  shell();
  $('municipalReportFrame').src = `${base}/vista-previa?${query}`;
 }
 function openReference() {
  if (state.mode === 'aspirantes') {
   openAspirantReport(false);
   return;
  }

  if (state.mode === 'partidos') {
   if (!state.selectedParty) return;

   const key = encodeURIComponent(state.selectedParty.key);
   document.querySelector('.municipal-report-modal').classList.add('reference-report-view');
   $('reportModalIcon').className = 'bi bi-pie-chart-fill';
   $('reportModalKicker').textContent = 'PRESIDENCIAS MUNICIPALES · PARTIDO GOBERNANTE';
   $('municipalReportTitle').textContent = state.selectedParty.nombre;
   $('municipalReportMeta').textContent = `${state.selectedParty.total_municipios} MUNICIPIOS`;
   $('reportSummaryBar').classList.add('hidden');
   $('downloadMunicipalPdf').href = `/api/reportes/mapa/partidos/pdf?key=${key}`;
   shell();
   $('municipalReportFrame').src = `/api/reportes/mapa/partidos/vista-previa?key=${key}`;
   return;
  }

  if (!state.selectedReference) return;

  const key = encodeURIComponent(state.selectedReference.key);
  document.querySelector('.municipal-report-modal').classList.add('reference-report-view');
  $('reportModalIcon').className = 'bi bi-diagram-3-fill';
  $('reportModalKicker').textContent = 'PRESIDENCIAS Y DIPUTACIONES · DISTRIBUCIÓN TERRITORIAL';
  $('municipalReportTitle').textContent = state.selectedReference.nombre;
  $('municipalReportMeta').textContent = `${state.selectedReference.total_municipios} MUNICIPIOS VINCULADOS`;
  $('reportSummaryBar').classList.add('hidden');
  $('downloadMunicipalPdf').href = `/api/reportes/mapa/referentes/pdf?key=${key}`;
  shell();
  $('municipalReportFrame').src = `/api/reportes/mapa/referentes/vista-previa?key=${key}`;
 }
 function openPartyGeneral(){document.querySelector('.municipal-report-modal').classList.add('reference-report-view');$('reportModalIcon').className='bi bi-map-fill';$('reportModalKicker').textContent='PANORAMA ESTATAL · PARTIDOS POLÍTICOS';$('municipalReportTitle').textContent='Reporte general de partidos';$('municipalReportMeta').textContent=`${state.partySummary.municipios_con_partido||0} MUNICIPIOS CON PARTIDO · DIRECTORIO MUNICIPAL`;$('reportSummaryBar').classList.add('hidden');$('downloadMunicipalPdf').href='/api/reportes/mapa/partidos/general/pdf';shell();$('municipalReportFrame').src='/api/reportes/mapa/partidos/general/vista-previa'}
 async function load() {
  try {
   window.initMap();
   const [municipalities, references, parties, aspirants, history] = await Promise.all([
    api.get('/api/reportes/mapa'),
    api.get('/api/reportes/mapa/referentes'),
    api.get('/api/reportes/mapa/partidos'),
    api.get('/api/reportes/mapa/aspirantes'),
    api.get('/api/reportes/mapa/historial')
   ]);

   state.municipalities = municipalities;
   state.parties = parties.partidos;
   state.references = assignReferenceColors(references.referentes);
   state.referenceSummary = references.resumen;
   state.partySummary = parties.resumen;
   state.aspirantMunicipalities = aspirants.municipios;
   state.aspirantSummary = aspirants.resumen;
   buildSubreferences();
   state.history = history;
   renderHistoryControls();

   $('aspirantMunicipality').innerHTML = [
    '<option value="">SELECCIONA UN MUNICIPIO</option>',
    ...state.aspirantMunicipalities.map(municipality => (
     `<option value="${esc(municipality.municipio_id)}">${esc(municipality.nombre)} · ${municipality.total_aspirantes}</option>`
    ))
   ].join('');

   window.drawMunicipios(municipalities);
   $('mapLoading').classList.add('hidden');
   window.setOnMunicipioSelected(id => {
    const row = state.municipalities.find(item => Number(item.id_municipio) === Number(id));
    if (!row) return;

    if (state.mode === 'aspirantes') {
     if (state.aspirantView === 'subreferentes') {
      const selectedSubreference = state.subreferences.find(
       item => item.key === state.selectedSubreferenceKey
      );
      if (!selectedSubreference) {
       Swal.fire({
        icon: 'info',
        title: 'SELECCIONA UN SUBREFERENTE',
        text: 'Elige un nombre en la pestaña Por subreferente para consultar sus aspirantes.',
        confirmButtonColor: '#8f173d'
       });
       return;
      }
      const municipality = state.aspirantMunicipalities.find(item =>
       String(item.municipio_id) === String(row.municipio_id)
      );
      const matchingRecords = (municipality?.aspirantes || []).filter(item =>
       normalizedSubreferenceName(item.subreferente) === selectedSubreference.key
      );
      if (!matchingRecords.length) {
       Swal.fire({
        icon: 'info',
        title: row.nombre,
        text: 'Este municipio no tiene aspirantes con el subreferente seleccionado.',
        confirmButtonColor: '#8f173d'
       });
       return;
      }
      window.resaltarMunicipioById(row.id_municipio);
      showSubreferenceAspirantsModal(row, selectedSubreference, municipality);
      return;
     }
     const municipality = state.aspirantMunicipalities.find(
      item => item.municipio_id === row.municipio_id
     );

     if (municipality) {
      selectAspirantMunicipality(municipality);
     } else {
      Swal.fire({
       icon: 'info',
       title: row.nombre,
       text: 'Este municipio no tiene aspirantes capturados.',
       confirmButtonColor: '#8f173d'
      });
     }
     return;
    }

    if (state.mode === 'referentes' && state.referenceAspirantKey) {
     const reference=state.references.find(item=>item.key===state.referenceAspirantKey);
     const records=(reference?.aspirantes||[]).filter(item=>String(item.municipio_id)===String(row.municipio_id));
      const initials=value=>String(value||'').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'?';
       const list=records.length?`<div class="reference-aspirant-list">${records.map(item=>{const party=item.partido||'SIN PARTIDO';const logos=partyLogoUrls(party);const logo=logos.length?`<span class="reference-aspirant-party-logos" title="${esc(party)}">${logos.map(url=>`<img src="${url}" alt="${esc(party)}">`).join('')}</span>`:`<span class="reference-aspirant-party reference-aspirant-party-fallback">${esc(party)}</span>`;const avatar=item.foto_url?`<img src="${esc(item.foto_url)}" alt="${esc(item.nombre||'Aspirante')}">`:esc(initials(item.nombre));const meta=aspirantRoleLabel(item);return `<div class="reference-aspirant-row"><span class="reference-aspirant-avatar">${avatar}</span><span class="reference-aspirant-copy"><strong>${esc(item.nombre||'SIN NOMBRE')}</strong>${meta?`<small>${esc(meta)}</small>`:''}</span>${logo}</div>`}).join('')}</div>`:'<div class="reference-aspirant-empty">Este municipio no tiene aspirantes vinculados con este referente.</div>';
     const html=`<div class="reference-aspirant-shell"><header class="reference-aspirant-header"><div><h2>${esc(row.nombre)}</h2></div><span class="reference-aspirant-code">${esc(row.clave||row.municipio_id)}</span></header><div class="reference-aspirant-body"><div class="reference-aspirant-context"><span><small>REFERENTE ACTIVO</small><strong>${esc(reference?.nombre||'SIN REFERENTE')}</strong></span><b>${records.length}</b></div>${list}</div><footer class="reference-aspirant-footer"><span>${esc(row.ultima_actualizacion||'ÚLTIMA ACTUALIZACIÓN: —')}</span><div><button type="button" class="reference-aspirant-close">CERRAR</button><button type="button" class="reference-aspirant-full"><i class="bi bi-box-arrow-up-right"></i> VER FICHA COMPLETA</button></div></footer></div>`;
     Swal.fire({html,width:448,showConfirmButton:false,showCloseButton:false,backdrop:'rgba(15,23,42,.62)',allowOutsideClick:true,customClass:{popup:'reference-aspirant-modal',container:'reference-aspirant-modal-container'},didOpen:popup=>{
      popup.querySelector('.reference-aspirant-close')?.addEventListener('click',()=>Swal.close());
      popup.querySelector('.reference-aspirant-full')?.addEventListener('click',()=>{Swal.close();openMunicipality(row)});
       enhanceReferenceActorButtons(records,popup);
     }});
     return;
    }

    if (state.mode === 'historial') {
     const rows=historyFilteredRows().filter(item=>item.municipio_id===row.municipio_id);
     Swal.fire({icon:rows.length?'info':'question',title:row.nombre,html:rows.length?rows.map(item=>`<div><strong>${esc(item.periodo)}</strong> · ${esc(item.referente_original||'SIN REFERENTE')}<br><small>${esc(item.presidente_nombre||'')}</small></div>`).join(''):'No hay registro histórico para los filtros seleccionados.',confirmButtonColor:'#8f173d'});
     return;
    }

    openMunicipality(row);
   });

   const query = new URLSearchParams(location.search);
   const requested = query.get('reporte');
   state.aspirantScope = ['referente', 'subreferente', 'ambos'].includes(query.get('campos'))
    ? query.get('campos')
    : 'ambos';
   $('aspirantScope').value = state.aspirantScope;
   mode(requested, false);

   if (requested === 'referentes' && query.get('referente')) {
    const reference = state.references.find(item => item.key === query.get('referente'));
    if (reference) await selectReference(reference);
   }

   if (requested === 'partidos' && query.get('partido')) {
    const party = state.parties.find(item => item.key === query.get('partido'));
    if (party) selectParty(party);
   }

   if (requested === 'aspirantes' && query.get('municipio')) {
    const municipality = state.aspirantMunicipalities.find(
     item => item.municipio_id === query.get('municipio')
    );
    if (municipality) selectAspirantMunicipality(municipality);
   }
  } catch (error) {
   $('mapLoading').innerHTML = `
    <i class="bi bi-exclamation-triangle-fill"></i>
    <strong>No se pudo cargar el mapa</strong>
    <small>${esc(error.message)}</small>
   `;
  }
 }
 $('reportSelector').addEventListener('click', () => {
  const open = $('reportMenu').classList.contains('hidden');
  $('reportMenu').classList.toggle('hidden', !open);
  $('reportSelector').classList.toggle('is-open', open);
  $('reportSelector').setAttribute('aria-expanded', String(open));
 });

 $('reportMenu').addEventListener('click', event => {
  const button = event.target.closest('[data-report-mode]');
  if (button) mode(button.dataset.reportMode);
 });

 document.addEventListener('click', event => {
  if (!event.target.closest('.report-selector-wrap')) closeMenu();
 });

 $('municipioSearchMap').addEventListener('input', municipalityList);
 $('mapStatusFilter').addEventListener('change', () => {
  municipalityList();
  municipalityMap();
 });
 $('referenceScope').addEventListener('change', changeReferenceScope);
 $('referenceViewSelector').addEventListener('click',event=>{
  if(event.target.closest('#toggleReferenceLabels')){
   state.referenceLabelsVisible=!state.referenceLabelsVisible;
   window.setReferenceLabelsVisible(state.referenceLabelsVisible);
   renderReferenceSubLayers();
   return;
  }
  const button=event.target.closest('[data-reference-view]');
  if(!button)return;
  state.referenceView=button.dataset.referenceView;
  referenceList();
 });
 $('referenceSearch').addEventListener('input', referenceList);
 $('referenceStatusFilter').addEventListener('change', () => {
  totals('referentes');
  referenceList();
 });
 $('mapMunicipalityList').addEventListener('change',event=>{
  if(!event.target.matches('[data-reference-layer]'))return;
  state.referenceAspirantKey=null;
  state.selectedReferenceKeys=[...$('mapMunicipalityList').querySelectorAll('[data-reference-layer]:checked')].map(input=>input.value);
  state.selectedReference=state.selectedReferenceKeys.length===1
   ? state.references.find(reference=>reference.key===state.selectedReferenceKeys[0])||null
   : null;
  $('selectedReferenceCount').textContent=`${state.selectedReferenceKeys.length} seleccionados`;
  referenceMap();
  totals('referentes');
  const selected=selectedReferenceRows();
  const linked=new Set(selected.flatMap(referenceMunicipalityIds)).size;
  $('mapStageTitle').textContent=selected.length===1?selected[0].nombre:`${selected.length} referentes seleccionados`;
  $('mapStageDescription').textContent=selected.length
   ? `${linked} municipios vinculados - los colores distinguen cada referente${selected.length>1?' - el popup muestra coincidencias':''}.`
   : `Selecciona referentes vinculados con ${referenceScopeLabel().toLowerCase()}.`;
  $('mapGuidance').innerHTML=selected.length>1
   ? '<strong>Subcapas comparadas</strong> Cada color identifica al primer referente seleccionado en cada municipio; el popup muestra todos los referentes vinculados.'
   : '<strong>Reporte por referente</strong> Selecciona un nombre o activa varias subcapas.';
  $('openReferenceReport').classList.toggle('hidden',selected.length!==1);
  referenceList();
  updateUrl();
 });
 $('partySearch').addEventListener('input', partyList);
 $('aspirantSearch').addEventListener('input', aspirantList);
 $('subreferenceSearch').addEventListener('input',subreferenceList);
 $('aspirantGeneralTab').addEventListener('click',()=>switchAspirantView('general'));
 $('aspirantSubreferenceTab').addEventListener('click',()=>switchAspirantView('subreferentes'));
 $('clearSubreferenceSelection').addEventListener('click',()=>selectSubreference(null));
 $('aspirantScope').addEventListener('change', () => {
  state.aspirantScope = $('aspirantScope').value;
  updateUrl();
 });
 $('aspirantMunicipality').addEventListener('change', () => {
  const municipality = state.aspirantMunicipalities.find(
   item => item.municipio_id === $('aspirantMunicipality').value
  );
  selectAspirantMunicipality(municipality || null);
 });
 $('historyPeriod').addEventListener('change', () => {
  const select=$('historyPeriod');
  if([...select.selectedOptions].some(option=>option.value==='__clear__')){
   [...select.options].forEach(option=>{option.selected=false});
   state.historyPeriods=[];
  }else state.historyPeriods=[...select.selectedOptions].map(option=>option.value);
  historyList(); historyMap(); totals('historial'); updateHistoryKpis();
 });
 $('historyReference').addEventListener('change', () => {
  const select=$('historyReference');
  if([...select.selectedOptions].some(option=>option.value==='__clear__')){
   [...select.options].forEach(option=>{option.selected=false});
   state.historyReferences=[];
  }else state.historyReferences=[...select.selectedOptions].map(option=>option.value);
  historyList(); historyMap(); totals('historial'); updateHistoryKpis();
 });
 document.addEventListener('click', event => {
  const removeReference=event.target.closest('[data-remove-reference]');
  if(removeReference){
   event.preventDefault();
   const input=document.querySelector(`[data-reference-layer][value="${CSS.escape(removeReference.dataset.removeReference)}"]`);
   if(input){input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));}
   return;
  }
  const trigger=event.target.closest('.history-changes-trigger');
  if(trigger)showHistoryChanges(trigger.dataset.reference);
 });
 $('openHistoryReferenceCards').addEventListener('click', openHistoryReferenceCards);
 $('mapReferencePhoto').addEventListener('click', event=>{
  const item=event.target.closest('[data-reference-ranking-municipio]');
  if(!item)return;
  const municipality=state.municipalities.find(row=>String(row.municipio_id)===String(item.dataset.referenceRankingMunicipio));
  const reference=state.references.find(row=>row.key===state.referenceAspirantKey);
  if(municipality&&reference){window.resaltarMunicipioById(municipality.id_municipio);showReferenceAspirantsModal(municipality,reference);}
 });

 $('mapMunicipalityList').addEventListener('click', event => {
  if(event.target.closest('.reference-layer-option'))return;
  const aspirantReferenceTrigger=event.target.closest('[data-reference-aspirants-key]');
  if(aspirantReferenceTrigger){
   event.preventDefault();
   event.stopPropagation();
   selectReferenceAspirants(aspirantReferenceTrigger.dataset.referenceAspirantsKey);
   return;
  }
  const municipalityButton = event.target.closest('[data-municipio-id]');
  const referenceButton = event.target.closest('[data-reference-key]');
  const partyButton = event.target.closest('[data-party-key]');
  const aspirantButton = event.target.closest('[data-aspirant-municipality-id]');
  const subreferenceButton=event.target.closest('[data-subreference-key]');

  if (municipalityButton) {
   const municipality = state.municipalities.find(
    item => item.municipio_id === municipalityButton.dataset.municipioId
   );
   if (municipality) openMunicipality(municipality);
  } else if (referenceButton) {
   const reference = state.references.find(item => item.key === referenceButton.dataset.referenceKey);
   if (reference) selectReference(reference);
  } else if (partyButton) {
   const party = state.parties.find(item => item.key === partyButton.dataset.partyKey);
   if (party) selectParty(party);
  } else if (aspirantButton) {
   const municipality = state.aspirantMunicipalities.find(
    item => item.municipio_id === aspirantButton.dataset.aspirantMunicipalityId
   );
   if (municipality) selectAspirantMunicipality(municipality);
  } else if(subreferenceButton){
   selectSubreference(subreferenceButton.dataset.subreferenceKey);
  }
 });

 $('resetMap').addEventListener('click', () => {
  if (state.mode === 'referentes') {
   state.selectedReference = null;
   state.selectedReferenceKeys = [];
   $('referenceSearch').value = '';
   $('referenceStatusFilter').value = 'all';
  } else if (state.mode === 'partidos') {
   state.selectedParty = null;
   $('partySearch').value = '';
  } else if (state.mode === 'aspirantes') {
   state.selectedAspirantMunicipality = null;
   state.selectedSubreferenceKey = null;
   $('aspirantMunicipality').value = '';
   $('aspirantSearch').value = '';
   $('subreferenceSearch').value = '';
   state.aspirantView==='subreferentes'
    ? subreferenceList()
    : aspirantList();
  } else {
   $('municipioSearchMap').value = '';
   $('mapStatusFilter').value = 'all';
   state.selectedMunicipality = null;
  }

  window.resetMapCoverageView();
  mode(state.mode);
 });

 $('openReferenceReport').addEventListener('click', openReference);
 $('openPartyGeneralReport').addEventListener('click', openPartyGeneral);
 $('openAspirantGeneralReport').addEventListener('click', () => openAspirantReport(true));
 $('openSubreferenceAspirantReport').addEventListener('click', openSubreferenceAspirantReport);
 $('closeMunicipalReport').addEventListener('click', closeReport);
 $('municipalReportBackdrop').addEventListener('click', event => {
  if (event.target === $('municipalReportBackdrop')) closeReport();
 });
 $('municipalReportFrame').addEventListener('load', () => {
  if ($('municipalReportFrame').src === 'about:blank') return;
  $('reportPreviewLoading').classList.add('hidden');
  $('municipalReportFrame').classList.add('ready');
 });
 document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
   closeMenu();
   if (!$('municipalReportBackdrop').classList.contains('hidden')) closeReport();
  }
 });

 load();
})();
