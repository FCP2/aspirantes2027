'use strict';

(() => {
  async function requestCaptureAccess() {
    if (!window.Swal) return;

    const result = await Swal.fire({
      icon: 'info',
      title: 'Acceso a captura',
      text: 'Ingresa el token de edición que te proporcionaron.',
      input: 'password',
      inputPlaceholder: 'Token de edición',
      inputAttributes: {
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false'
      },
      showCancelButton: true,
      confirmButtonText: 'ENTRAR A CAPTURA',
      cancelButtonText: 'CANCELAR',
      confirmButtonColor: '#8f173d',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      inputValidator: value => value?.trim() ? undefined : 'Escribe el token de edición.',
      preConfirm: async value => {
        try {
          const response = await fetch('/api/access/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: value.trim() })
          });
          const body = await response.json();

          if (!response.ok || body.role !== 'editor') {
            throw new Error(body.message || 'No se pudo autorizar la captura.');
          }

          return true;
        } catch (error) {
          Swal.showValidationMessage(error.message);
          return false;
        }
      }
    });

    if (result.isConfirmed) window.location.assign('/captura');
  }

  document.querySelectorAll('[data-capture-access]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      requestCaptureAccess();
    });
  });

  const url = new URL(window.location.href);
  if (url.searchParams.get('captura') === 'token') {
    url.searchParams.delete('captura');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    requestCaptureAccess();
  }
})();
