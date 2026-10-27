'use strict';

window.captureActors = (() => {
  const $ = id => document.getElementById(id);
  let pdfUrl = '';
  let context = null;

  async function request(url, options = {}) {
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

  async function login() {
    return window.actorsTurnstile.login(request);
  }

  function selector(candidates, localName) {
    const wrapper = document.createElement('div'); wrapper.className = 'actor-candidate-dialog';
    const note = document.createElement('p'); note.textContent = `Selecciona el expediente que corresponde a ${localName}.`;
    const select = document.createElement('select'); select.className = 'swal2-select';
    candidates.forEach(candidate => select.appendChild(new Option(`${candidate.nombre_completo} · ${candidate.puntuacion}%`, String(candidate.id_persona))));
    wrapper.append(note, select);
    return { wrapper, select };
  }

  async function searchCandidate(person) {
    Swal.fire({ title: 'BUSCANDO EN ACTORES', text: person.nombre_completo, allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });
    const result = await request(`/api/integracion-actores/buscar?persona_local_id=${encodeURIComponent(person.persona_id)}&nombre=${encodeURIComponent(person.nombre_completo)}&ignorar_enlace=1`);
    Swal.close();
    if (result.estado === 'NO_ENCONTRADA') {
      await Swal.fire({ icon: 'info', title: 'PERSONA NO LOCALIZADA', text: 'No se encontró entre los registros visibles para tu usuario en el Sistema de Actores Políticos.' });
      return null;
    }
    const { wrapper, select } = selector(result.candidatos, person.nombre_completo);
    const choice = await Swal.fire({
      icon: result.estado === 'COINCIDENCIA' ? 'question' : 'warning', title: 'CONFIRMA LA PERSONA', html: wrapper,
      showCancelButton: true, confirmButtonText: 'USAR ESTE EXPEDIENTE', cancelButtonText: 'CANCELAR',
      preConfirm: () => result.candidatos.find(candidate => String(candidate.id_persona) === select.value) || false
    });
    return choice.isConfirmed ? choice.value : null;
  }

  async function confirmDetected(person, status) {
    if (status.estado === 'ENLAZADA') return { id_persona: status.persona_externa_id, nombre_completo: status.nombre_externo };
    if (status.estado === 'REVISAR') return searchCandidate(person);
    const content = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = status.nombre_externo;
    const detail = document.createElement('small'); detail.textContent = `Coincidencia del ${status.puntuacion}%`;
    content.append(name, document.createElement('br'), detail);
    const confirmation = await Swal.fire({
      icon: 'question', title: 'EXPEDIENTE ENCONTRADO', html: content,
      showCancelButton: true, confirmButtonText: 'ABRIR EXPEDIENTE', cancelButtonText: 'REVISAR OTRA PERSONA'
    });
    if (confirmation.isConfirmed) return { id_persona: status.persona_externa_id, nombre_completo: status.nombre_externo };
    return searchCandidate(person);
  }

  async function saveLink(person, candidate, alreadyLinked) {
    if (alreadyLinked) return;
    await request('/api/integracion-actores/enlaces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona_local_id: person.persona_id, nombre_local: person.nombre_completo, persona_externa_id: candidate.id_persona, nombre_externo: candidate.nombre_completo })
    });
  }

  function close() {
    $('captureActorBackdrop').classList.add('hidden');
    $('captureActorPdf').src = 'about:blank';
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = '';
  }

  async function showPdf(person, candidate) {
    context = { person, candidate };
    $('captureActorTitle').textContent = candidate.nombre_completo;
    $('captureActorMeta').textContent = `Ficha municipal: ${person.nombre_completo}`;
    $('captureActorBackdrop').classList.remove('hidden');
    $('captureActorLoading').classList.remove('hidden');
    $('captureActorPdf').classList.remove('ready');
    try {
      const response = await fetch(`/api/integracion-actores/pdf/${candidate.id_persona}`);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const error = new Error(data?.message || 'No se pudo abrir el expediente.'); error.status = response.status; throw error;
      }
      pdfUrl = URL.createObjectURL(await response.blob());
      $('captureActorPdf').src = pdfUrl; $('captureActorOpen').href = pdfUrl; $('captureActorPdf').classList.add('ready');
    } catch (error) {
      close();
      await Swal.fire({ icon: 'error', title: error.status === 403 ? 'ACCESO RESTRINGIDO' : 'NO SE PUDO ABRIR', text: error.message });
    } finally { $('captureActorLoading').classList.add('hidden'); }
  }

  async function open(person, status) {
    try {
      if (!(await login())) return;
      const candidate = await confirmDetected(person, status);
      if (!candidate) return;
      await saveLink(person, candidate, status.estado === 'ENLAZADA');
      await showPdf(person, candidate);
    } catch (error) {
      Swal.close();
      await Swal.fire({ icon: 'error', title: 'NO SE PUDO CONSULTAR', text: error.message });
    }
  }

  $('captureActorClose').addEventListener('click', close);
  $('captureActorBackdrop').addEventListener('click', event => { if (event.target === $('captureActorBackdrop')) close(); });
  $('captureActorRelink').addEventListener('click', async () => {
    const current = context; if (!current) return;
    close();
    try {
      await request(`/api/integracion-actores/enlaces/${encodeURIComponent(current.person.persona_id)}`, { method: 'DELETE' });
      const candidate = await searchCandidate(current.person);
      if (!candidate) return;
      await saveLink(current.person, candidate, false);
      await showPdf(current.person, candidate);
    } catch (error) { Swal.close(); await Swal.fire({ icon: 'error', title: 'NO SE PUDO CAMBIAR', text: error.message }); }
  });
  $('captureActorLogout').addEventListener('click', async () => {
    const confirmation = await Swal.fire({ icon: 'question', title: '¿CERRAR SESIÓN DE ACTORES?', text: 'La captura municipal seguirá abierta.', showCancelButton: true, confirmButtonText: 'CERRAR SESIÓN', cancelButtonText: 'CANCELAR' });
    if (!confirmation.isConfirmed) return;
    try { await request('/api/integracion-actores/session', { method: 'DELETE' }); close(); context = null; await Swal.fire({ icon: 'success', title: 'SESIÓN CERRADA', showConfirmButton: false, timer: 1300 }); }
    catch (error) { await Swal.fire({ icon: 'error', title: 'NO SE PUDO CERRAR', text: error.message }); }
  });

  return { open, close };
})();
