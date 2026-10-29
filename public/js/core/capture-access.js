'use strict';

(() => {
  const overlay = document.getElementById('captureAccessOverlay');
  const form = document.getElementById('captureAccessForm');
  const input = document.getElementById('captureAccessToken');
  const errorMessage = document.getElementById('captureAccessError');
  const submitButton = document.getElementById('captureAccessSubmit');
  const submitLabel = submitButton?.querySelector('.capture-access-submit-label');

  if (!overlay || !form || !input || !errorMessage || !submitButton || !submitLabel) {
    return;
  }

  let isSubmitting = false;
  let previousFocus = null;
  const expectedRole = overlay.dataset.accessRole || 'editor';
  const accessTarget = overlay.dataset.accessTarget || '/captura';
  const autoOpen = overlay.dataset.accessAutoOpen === 'true';
  const dismissible = overlay.dataset.accessDismissible !== 'false';

  function roleCanAccess(role) {
    if (role === 'editor') return true;
    return expectedRole === 'report' && role === 'report';
  }

  function setError(message = '') {
    errorMessage.textContent = message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function setLoading(active) {
    isSubmitting = active;
    submitButton.disabled = active;
    submitButton.classList.toggle('is-loading', active);
    submitLabel.textContent = active ? 'Validando acceso' : 'Validar y entrar';
  }

  function closeCaptureAccess() {
    if (isSubmitting) return;

    overlay.hidden = true;
    document.body.classList.remove('capture-access-open');
    input.value = '';
    setError();
    previousFocus?.focus?.();
  }

  function requestCaptureAccess(trigger = null) {
    previousFocus = trigger || document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('capture-access-open');
    input.value = '';
    setError();
    setLoading(false);
    window.requestAnimationFrame(() => input.focus());
  }

  document.querySelectorAll('[data-capture-access]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      requestCaptureAccess(link);
    });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (isSubmitting) return;

    const token = input.value.trim();
    if (!token) {
      setError('Escribe el token de acceso para continuar.');
      input.focus();
      return;
    }

    setError();
    setLoading(true);

    try {
      const response = await fetch('/api/access/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json')
        ? await response.json()
        : {};

      if (!response.ok || !roleCanAccess(body.role)) {
        throw new Error(body.message || 'El token no es válido o ya no está vigente.');
      }

      submitLabel.textContent = 'Acceso autorizado';
      window.location.assign(accessTarget);
    } catch (error) {
      setError(error.message || 'No fue posible validar el acceso. Intenta nuevamente.');
      setLoading(false);
      input.select();
      input.focus();
    }
  });

  input.addEventListener('input', () => {
    if (errorMessage.textContent) setError();
  });

  overlay.addEventListener('click', event => {
    if (dismissible && event.target === overlay) closeCaptureAccess();
  });

  document.addEventListener('keydown', event => {
    if (dismissible && event.key === 'Escape' && !overlay.hidden) closeCaptureAccess();
  });

  const url = new URL(window.location.href);
  if (url.searchParams.get('captura') === 'token') {
    url.searchParams.delete('captura');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    requestCaptureAccess();
  } else if (autoOpen) {
    requestCaptureAccess();
  }
})();
