'use strict';

const state = { data: null, rows: [], actorContext: null, actorPdfUrl: '' };
const $ = id => document.getElementById(id);
const labels = {
  COINCIDE: 'COINCIDE',
  VARIACION_DE_NOMBRE: 'VARIACIÓN DE NOMBRE',
  CONTRADICCION_PARTIDISTA: 'CONTRADICCIÓN PARTIDISTA',
  ALERTA_EN_FUENTE: 'ALERTA EN LA FUENTE',
  NUEVO_EN_FUENTE: 'NUEVO EN LA FUENTE',
  SOLO_EN_FICHA: 'SOLO EN LA FICHA',
  REQUIERE_REVISION: 'REQUIERE REVISIÓN'
};
const statusIcons = {
  COINCIDE: 'bi-check-circle-fill',
  VARIACION_DE_NOMBRE: 'bi-person-bounding-box',
  CONTRADICCION_PARTIDISTA: 'bi-arrow-left-right',
  ALERTA_EN_FUENTE: 'bi-exclamation-triangle-fill',
  NUEVO_EN_FUENTE: 'bi-person-plus-fill',
  SOLO_EN_FICHA: 'bi-database-fill-check',
  REQUIERE_REVISION: 'bi-question-diamond-fill'
};
const humanLabels = {
  COINCIDE: 'Coincide',
  VARIACION_DE_NOMBRE: 'Variación de nombre',
  CONTRADICCION_PARTIDISTA: 'Contradicción partidista',
  ALERTA_EN_FUENTE: 'Alerta en la fuente',
  NUEVO_EN_FUENTE: 'Nuevo en la fuente',
  SOLO_EN_FICHA: 'Solo en la ficha',
  REQUIERE_REVISION: 'Requiere revisión'
};

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const error = new Error(data?.message || 'No se pudo completar la solicitud.');
    error.status = response.status;
    error.code = data?.code || '';
    throw error;
  }
  return data;
}

async function actorLogin() {
  return window.actorsTurnstile.login(jsonRequest);
}

function candidateSelector(candidates, localName) {
  const wrapper = el('div', 'actor-candidate-dialog');
  wrapper.appendChild(el('p', '', `Selecciona el expediente que corresponde a ${localName}.`));
  const select = document.createElement('select'); select.className = 'swal2-select';
  candidates.forEach(candidate => select.appendChild(new Option(
    `${candidate.nombre_completo} · ${candidate.puntuacion}%`, String(candidate.id_persona)
  )));
  wrapper.appendChild(select);
  return { wrapper, select };
}

async function chooseActorCandidate(result, localName) {
  if (result.estado === 'NO_ENCONTRADA') {
    await Swal.fire({ icon: 'info', title: 'PERSONA NO LOCALIZADA', text: 'No se encontró entre los registros visibles para tu usuario en el Sistema de Actores Políticos.' });
    return null;
  }
  if (result.estado === 'ENLAZADA') return result.candidatos[0];
  if (result.estado === 'COINCIDENCIA') {
    const candidate = result.candidatos[0];
    const matchSummary = document.createElement('div');
    matchSummary.append(el('strong', '', candidate.nombre_completo), document.createElement('br'), el('small', '', `Similitud del nombre: ${candidate.puntuacion}%`));
    const confirmation = await Swal.fire({
      icon: 'question', title: 'COINCIDENCIA ENCONTRADA',
      html: matchSummary,
      showCancelButton: true, confirmButtonText: 'ABRIR EXPEDIENTE', cancelButtonText: 'REVISAR OPCIONES'
    });
    if (confirmation.isConfirmed) return candidate;
  }
  const { wrapper, select } = candidateSelector(result.candidatos, localName);
  const selection = await Swal.fire({
    icon: 'warning', title: 'CONFIRMA LA PERSONA', html: wrapper, showCancelButton: true,
    confirmButtonText: 'USAR ESTE EXPEDIENTE', cancelButtonText: 'CANCELAR',
    preConfirm: () => result.candidatos.find(candidate => String(candidate.id_persona) === select.value) || false
  });
  return selection.isConfirmed ? selection.value : null;
}

async function saveActorLink(local, candidate) {
  await jsonRequest('/api/integracion-actores/enlaces', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      persona_local_id: local.persona_id,
      nombre_local: local.nombre,
      persona_externa_id: candidate.id_persona,
      nombre_externo: candidate.nombre_completo
    })
  });
}

function closeActorViewer() {
  $('actorBackdrop').classList.add('hidden');
  $('actorPdfFrame').src = 'about:blank';
  if (state.actorPdfUrl) URL.revokeObjectURL(state.actorPdfUrl);
  state.actorPdfUrl = '';
}

async function openActorViewer(local, candidate) {
  state.actorContext = { local, candidate };
  $('actorViewerTitle').textContent = candidate.nombre_completo;
  $('actorViewerMeta').textContent = `Vinculado con la ficha: ${local.nombre}`;
  $('actorBackdrop').classList.remove('hidden');
  $('actorLoading').classList.remove('hidden');
  $('actorPdfFrame').classList.remove('ready');
  try {
    const response = await fetch(`/api/integracion-actores/pdf/${candidate.id_persona}`);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const error = new Error(data?.message || 'No se pudo abrir el expediente.'); error.status = response.status; throw error;
    }
    if (state.actorPdfUrl) URL.revokeObjectURL(state.actorPdfUrl);
    state.actorPdfUrl = URL.createObjectURL(await response.blob());
    $('actorPdfFrame').src = state.actorPdfUrl;
    $('actorOpenPdf').href = state.actorPdfUrl;
    $('actorPdfFrame').classList.add('ready');
  } catch (error) {
    closeActorViewer();
    await Swal.fire({ icon: 'error', title: error.status === 403 ? 'ACCESO RESTRINGIDO' : 'NO SE PUDO ABRIR', text: error.message });
  } finally { $('actorLoading').classList.add('hidden'); }
}

async function consultActor(local, ignoreLink = false) {
  if (!local?.persona_id || !local?.nombre) return;
  try {
    if (!(await actorLogin())) return;
    Swal.fire({ title: 'BUSCANDO EN ACTORES', text: local.nombre, allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });
    let result;
    try {
      result = await jsonRequest(`/api/integracion-actores/buscar?persona_local_id=${encodeURIComponent(local.persona_id)}&nombre=${encodeURIComponent(local.nombre)}${ignoreLink ? '&ignorar_enlace=1' : ''}`);
    } catch (error) {
      if (error.status !== 401) throw error;
      Swal.close();
      if (!(await actorLogin())) return;
      result = await jsonRequest(`/api/integracion-actores/buscar?persona_local_id=${encodeURIComponent(local.persona_id)}&nombre=${encodeURIComponent(local.nombre)}${ignoreLink ? '&ignorar_enlace=1' : ''}`);
    }
    Swal.close();
    const candidate = await chooseActorCandidate(result, local.nombre);
    if (!candidate) return;
    if (result.estado !== 'ENLAZADA') await saveActorLink(local, candidate);
    await openActorViewer(local, candidate);
  } catch (error) {
    Swal.close();
    await Swal.fire({ icon: 'error', title: 'NO SE PUDO CONSULTAR', text: error.message });
  }
}

function statusChip(status) {
  const badge = el('span', `comparison-badge status-${status}`);
  badge.setAttribute('aria-label', labels[status] || status);
  const icon = el('span', 'comparison-badge-icon');
  icon.innerHTML = `<i class="bi ${statusIcons[status] || 'bi-info-circle-fill'}" aria-hidden="true"></i>`;
  badge.append(icon, el('span', 'comparison-badge-label', labels[status] || status));
  return badge;
}

function observationChip(type) {
  const badge = el('span', 'observation-badge');
  const icon = el('i', 'bi bi-eye-fill');
  icon.setAttribute('aria-hidden', 'true');
  badge.append(icon, el('span', '', `OBSERVACIÓN · ${type}`));
  return badge;
}

function comparisonBadges(item) {
  const group = el('div', 'comparison-stack');
  group.appendChild(statusChip(item.estado));
  [...new Set(item.externo?.tipos_explicacion || [])].forEach(type => group.appendChild(observationChip(type)));
  return group;
}

function populateFilters(data) {
  const selectedSource = $('sourceSelect').value;
  $('sourceSelect').replaceChildren();
  for (const source of data.fuentes) {
    const option = new Option(source.archivo, source.archivo, false, source.archivo === data.fuente.archivo);
    $('sourceSelect').appendChild(option);
  }
  if (selectedSource && data.fuentes.some(source => source.archivo === selectedSource)) $('sourceSelect').value = selectedSource;

  const municipalities = [...new Set(data.resultados.map(row => row.municipio))].sort((a, b) => a.localeCompare(b, 'es'));
  $('municipioFilter').replaceChildren(new Option('TODOS LOS MUNICIPIOS', ''));
  municipalities.forEach(name => $('municipioFilter').appendChild(new Option(name.toLocaleUpperCase('es-MX'), name)));
  $('statusFilter').replaceChildren(new Option('TODOS LOS RESULTADOS', ''));
  Object.keys(labels).filter(status => data.totales[status]).forEach(status => {
    $('statusFilter').appendChild(new Option(labels[status], status));
  });
}

function renderMetrics(data) {
  const totals = data.totales;
  const matches = (totals.COINCIDE || 0);
  const differences = (totals.VARIACION_DE_NOMBRE || 0) + (totals.CONTRADICCION_PARTIDISTA || 0)
    + (totals.ALERTA_EN_FUENTE || 0) + (totals.REQUIERE_REVISION || 0);
  $('metricMunicipios').textContent = data.fuente.municipios.length;
  $('metricCoinciden').textContent = matches;
  $('metricDiferencias').textContent = differences;
  $('metricNuevos').textContent = totals.NUEVO_EN_FUENTE || 0;
  $('metricFuentes').textContent = data.fuente.total_fuentes;
  $('sourceTitle').textContent = data.fuente.titulo;
  $('sourceMeta').textContent = `${data.fuente.archivo} · ${formatBytes(data.fuente.bytes)} · SHA-256 ${data.fuente.hash.slice(0, 12)}…`;
  $('resultCount').textContent = data.resultados.length;
}

function renderSummary(data) {
  const container = $('statusSummary');
  container.replaceChildren();
  const totalResults = Math.max(1, data.resultados.length);
  Object.entries(labels).forEach(([status, label]) => {
    const total = data.totales[status] || 0;
    if (!total) return;
    const percentage = (total / totalResults) * 100;
    const button = el('button', `distribution-item dist-${status}`);
    button.type = 'button';
    button.dataset.status = status;
    button.setAttribute('aria-label', `Filtrar por ${humanLabels[status] || label}: ${total} resultados`);
    const icon = el('span', 'distribution-icon');
    icon.innerHTML = `<i class="bi ${statusIcons[status] || 'bi-info-circle-fill'}" aria-hidden="true"></i>`;
    const copy = el('span', 'distribution-copy');
    copy.append(el('strong', '', humanLabels[status] || label), el('small', '', `${percentage.toFixed(1)}% del análisis`));
    const amount = el('span', 'distribution-amount', total);
    const track = el('span', 'distribution-track');
    const fill = el('span');
    fill.style.width = `${Math.max(3, percentage)}%`;
    track.appendChild(fill);
    button.append(icon, copy, amount, track);
    button.addEventListener('click', () => { $('statusFilter').value = status; renderRows(); });
    container.appendChild(button);
  });
}

function renderRows() {
  if (!state.data) return;
  const query = $('searchInput').value.trim().toLocaleLowerCase('es-MX');
  const municipality = $('municipioFilter').value;
  const status = $('statusFilter').value;
  document.querySelectorAll('.distribution-item').forEach(item => {
    const active = Boolean(status) && item.dataset.status === status;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  state.rows = state.data.resultados.filter(row => {
    const names = `${row.municipio} ${row.externo?.nombre || ''} ${row.local?.nombre || ''}`.toLocaleLowerCase('es-MX');
    return (!query || names.includes(query)) && (!municipality || row.municipio === municipality) && (!status || row.estado === status);
  });
  const body = $('resultsBody');
  body.replaceChildren();
  if (!state.rows.length) {
    const row = el('tr'); const cell = el('td', 'empty-state', 'No hay resultados con estos filtros.');
    cell.colSpan = 7; row.appendChild(cell); body.appendChild(row); return;
  }
  state.rows.forEach((item, index) => {
    const row = el('tr');
    row.appendChild(el('td', 'row-number', index + 1));
    row.appendChild(el('td', '', item.municipio));
    const person = el('td', 'person-cell');
    person.append(el('strong', '', item.externo?.nombre || item.local?.nombre || 'Sin nombre'));
    if (item.externo && item.local && item.externo.nombre !== item.local.nombre) person.append(el('span', '', `Ficha: ${item.local.nombre}`));
    row.appendChild(person);
    const comparison = el('td'); comparison.appendChild(comparisonBadges(item)); row.appendChild(comparison);
    const parties = el('td', 'party-pair');
    parties.append(el('span', '', `Fuente: ${item.externo?.partido || '—'}`), el('span', '', `Ficha: ${item.local?.partido || '—'}`));
    row.appendChild(parties);
    row.appendChild(el('td', 'confidence', item.local && item.externo ? `${item.puntuacion}%` : '—'));
    const action = el('td'); const actions = el('div', 'row-actions'); const button = el('button', 'detail-button');
    button.type = 'button'; button.title = 'Ver evidencia'; button.innerHTML = '<i class="bi bi-chevron-right"></i>';
    button.addEventListener('click', () => openDetail(item)); actions.appendChild(button);
    if (item.local) {
      const actorButton = el('button', 'actor-link-button'); actorButton.type = 'button'; actorButton.title = 'Consultar expediente en Actores';
      actorButton.innerHTML = '<i class="bi bi-person-vcard"></i>';
      actorButton.addEventListener('click', () => consultActor(item.local)); actions.prepend(actorButton);
    }
    action.appendChild(actions); row.appendChild(action);
    body.appendChild(row);
  });
}

function detailField(label, value) {
  const field = el('div', 'detail-field'); field.append(el('small', '', label), el('strong', '', value || '—')); return field;
}

function openMunicipalityList() {
  if (!state.data?.fuente) return;
  const municipalities = [...state.data.fuente.municipios]
    .sort((a, b) => a.municipio.localeCompare(b.municipio, 'es'));
  $('detailMunicipio').textContent = 'COBERTURA DE LA FUENTE';
  $('detailTitle').textContent = `${municipalities.length} municipios encontrados`;
  const content = $('detailContent'); content.replaceChildren();
  const intro = el('section', 'detail-section');
  intro.appendChild(el('p', '', 'Selecciona un municipio para cerrar este panel y filtrar inmediatamente los resultados de la comparación.'));
  content.appendChild(intro);
  const listSection = el('section', 'detail-section');
  listSection.appendChild(el('h3', '', 'MUNICIPIOS Y PERFILES EXTRAÍDOS'));
  const list = el('div', 'municipality-list');
  municipalities.forEach(item => {
    const button = el('button', 'municipality-item'); button.type = 'button';
    button.append(el('strong', '', item.municipio), el('span', '', `${item.perfiles.length} ${item.perfiles.length === 1 ? 'perfil' : 'perfiles'}`));
    button.addEventListener('click', () => {
      $('municipioFilter').value = item.municipio;
      renderRows();
      $('detailBackdrop').classList.add('hidden');
      document.querySelector('.results-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    list.appendChild(button);
  });
  listSection.appendChild(list); content.appendChild(listSection);
  $('detailBackdrop').classList.remove('hidden');
}

function openDetail(item) {
  $('detailMunicipio').textContent = item.municipio.toLocaleUpperCase('es-MX');
  $('detailTitle').textContent = item.externo?.nombre || item.local?.nombre || 'Detalle';
  const content = $('detailContent'); content.replaceChildren();
  const summary = el('section', 'detail-section');
  summary.appendChild(comparisonBadges(item));
  const grid = el('div', 'detail-grid'); grid.style.marginTop = '12px';
  grid.append(
    detailField('NOMBRE EN FUENTE', item.externo?.nombre), detailField('NOMBRE EN FICHA', item.local?.nombre),
    detailField('PARTIDO EN FUENTE', item.externo?.partido), detailField('PARTIDO EN FICHA', item.local?.partido),
    detailField('TIPO EN FICHA', item.local?.tipo_actor?.replaceAll('_', ' ')), detailField('SIMILITUD DEL NOMBRE', item.local && item.externo ? `${item.puntuacion}%` : '—')
  );
  summary.appendChild(grid); content.appendChild(summary);
  if (item.local) {
    const actorAccess = el('section', 'detail-section actor-access');
    const copy = el('div'); copy.append(el('h3', '', 'EXPEDIENTE EN ACTORES POLÍTICOS'), el('p', '', 'Consulta el expediente autorizado sin modificar la ficha municipal.'));
    const button = el('button', 'button actor-access-button'); button.type = 'button'; button.innerHTML = '<i class="bi bi-person-vcard"></i> CONSULTAR EXPEDIENTE';
    button.addEventListener('click', () => consultActor(item.local)); actorAccess.append(copy, button); content.appendChild(actorAccess);
  }
  if (item.externo?.perfil) {
    const section = el('section', 'detail-section narrative-section'); section.append(el('h3', '', 'INFORMACIÓN DE LA FUENTE'), el('p', '', item.externo.perfil)); content.appendChild(section);
  }
  if (item.externo?.alerta || item.externo?.explicacion) {
    const section = el('section', 'detail-section alert-box narrative-section'); section.appendChild(el('h3', '', 'ALERTA Y EXPLICACIÓN'));
    section.appendChild(el('p', '', [item.externo.alerta, item.externo.explicacion].filter(Boolean).join(' '))); content.appendChild(section);
  }
  if (item.externo?.asociaciones?.length) {
    const section = el('section', 'detail-section'); section.appendChild(el('h3', '', 'ASOCIACIÓN PARTIDISTA DE LA FUENTE'));
    section.appendChild(el('p', '', item.externo.asociaciones.map(value => `${value.partido} ${value.porcentaje}%`).join(' · '))); content.appendChild(section);
  }
  if (item.externo?.fuentes?.length) {
    const section = el('section', 'detail-section'); section.appendChild(el('h3', '', 'EVIDENCIAS'));
    const links = el('div', 'sources-list'); item.externo.fuentes.forEach(url => { const link = el('a', '', url); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.appendChild(link); });
    section.appendChild(links); content.appendChild(section);
  }
  const trace = el('section', 'detail-section'); trace.append(el('h3', '', 'TRAZABILIDAD DE LA FUENTE'), el('p', 'hash-text', `Archivo: ${state.data.fuente.archivo}\nSHA-256: ${state.data.fuente.hash}\nFecha del archivo: ${formatDate(state.data.fuente.modificado)}`)); content.appendChild(trace);
  $('detailBackdrop').classList.remove('hidden');
}

async function loadData(source = '') {
  $('resultsBody').innerHTML = '<tr><td colspan="7" class="loading-cell"><span class="spinner"></span> Analizando fuente…</td></tr>';
  try {
    const response = await fetch(`/api/revision-fuentes${source ? `?source=${encodeURIComponent(source)}` : ''}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No se pudo realizar el análisis.');
    if (!data.fuente) {
      state.data = null; $('sourceTitle').textContent = 'No hay fuentes cargadas';
      $('resultsBody').innerHTML = '<tr><td colspan="7" class="empty-state">Carga un archivo HTML para comenzar.</td></tr>'; return;
    }
    state.data = data; populateFilters(data); renderMetrics(data); renderSummary(data); renderRows();
  } catch (error) {
    $('resultsBody').innerHTML = `<tr><td colspan="7" class="empty-state"></td></tr>`;
    $('resultsBody').querySelector('td').textContent = error.message;
    Swal.fire({ icon: 'error', title: 'NO SE PUDO ANALIZAR', text: error.message });
  }
}

$('pickSource').addEventListener('click', () => $('sourceFile').click());
$('sourceFile').addEventListener('change', () => {
  const file = $('sourceFile').files[0]; $('uploadSource').disabled = !file;
  if (file) $('pickSource').textContent = file.name;
});
$('sourceUpload').addEventListener('submit', async event => {
  event.preventDefault(); const file = $('sourceFile').files[0]; if (!file) return;
  const form = new FormData(); form.append('file', file); $('uploadSource').disabled = true;
  Swal.fire({ title: 'ANALIZANDO FUENTE', text: 'Extrayendo perfiles y comparando información…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const response = await fetch('/api/revision-fuentes/fuentes', { method: 'POST', body: form }); const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'No se pudo cargar el archivo.');
    await loadData(result.archivo); Swal.fire({ icon: 'success', title: 'FUENTE ANALIZADA', text: 'El dashboard se actualizó sin modificar las fichas.' });
  } catch (error) { Swal.fire({ icon: 'error', title: 'NO SE PUDO ANALIZAR', text: error.message }); }
  finally { $('uploadSource').disabled = false; }
});
$('sourceSelect').addEventListener('change', () => loadData($('sourceSelect').value));
$('municipiosMetric').addEventListener('click', openMunicipalityList);
['searchInput', 'municipioFilter', 'statusFilter'].forEach(id => $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderRows));
$('closeDetail').addEventListener('click', () => $('detailBackdrop').classList.add('hidden'));
$('detailBackdrop').addEventListener('click', event => { if (event.target === $('detailBackdrop')) $('detailBackdrop').classList.add('hidden'); });
$('actorClose').addEventListener('click', closeActorViewer);
$('actorBackdrop').addEventListener('click', event => { if (event.target === $('actorBackdrop')) closeActorViewer(); });
$('actorLogout').addEventListener('click', async () => {
  const confirmation = await Swal.fire({
    icon: 'question', title: '¿CERRAR SESIÓN DE ACTORES?',
    text: 'La captura municipal seguirá abierta.',
    showCancelButton: true, confirmButtonText: 'CERRAR SESIÓN', cancelButtonText: 'CANCELAR'
  });
  if (!confirmation.isConfirmed) return;
  try {
    await jsonRequest('/api/integracion-actores/session', { method: 'DELETE' });
    closeActorViewer();
    state.actorContext = null;
    await Swal.fire({ icon: 'success', title: 'SESIÓN CERRADA', text: 'El acceso al Sistema de Actores se cerró correctamente.', showConfirmButton: false, timer: 1500 });
  } catch (error) {
    await Swal.fire({ icon: 'error', title: 'NO SE PUDO CERRAR', text: error.message });
  }
});
$('actorRelink').addEventListener('click', async () => {
  const context = state.actorContext; if (!context) return;
  closeActorViewer();
  try { await jsonRequest(`/api/integracion-actores/enlaces/${encodeURIComponent(context.local.persona_id)}`, { method: 'DELETE' }); }
  catch (error) { return Swal.fire({ icon: 'error', title: 'NO SE PUDO CAMBIAR', text: error.message }); }
  return consultActor(context.local, true);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!$('actorBackdrop').classList.contains('hidden')) closeActorViewer();
  else $('detailBackdrop').classList.add('hidden');
});

loadData();
