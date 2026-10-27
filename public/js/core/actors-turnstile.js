'use strict';

window.actorsTurnstile = (() => {
  const API_WAIT_MS = 12000;

  function siteKey() {
    return document.querySelector('meta[name="actors-turnstile-site-key"]')?.content.trim() || '';
  }

  function waitForApi() {
    if (window.turnstile?.render) return Promise.resolve(window.turnstile);
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        if (window.turnstile?.render) {
          window.clearInterval(timer);
          resolve(window.turnstile);
        } else if (Date.now() - startedAt >= API_WAIT_MS) {
          window.clearInterval(timer);
          reject(new Error('No se pudo cargar la verificación de seguridad. Revisa la conexión e inténtalo nuevamente.'));
        }
      }, 100);
    });
  }

  async function login(request) {
    const session = await request('/api/integracion-actores/session');
    if (session.authenticated) return true;

    const publicKey = siteKey();
    if (!publicKey || publicKey === 'PEGA_AQUI_TU_SITEKEY') {
      await Swal.fire({
        icon: 'warning',
        title: 'FALTA CONFIGURAR TURNSTILE',
        text: 'Agrega ACTORES_TURNSTILE_SITE_KEY en el archivo .env y reinicia el servidor.'
      });
      return false;
    }

    const form = document.createElement('div');
    form.className = 'actor-login-form';
    const note = document.createElement('p');
    note.textContent = session.expired
      ? 'Tu sesión anterior expiró. Vuelve a ingresar.'
      : 'Usa tus credenciales del Sistema de Actores Políticos.';
    const email = document.createElement('input');
    email.type = 'email'; email.autocomplete = 'username'; email.placeholder = 'Correo electrónico'; email.className = 'swal2-input';
    const password = document.createElement('input');
    password.type = 'password'; password.autocomplete = 'current-password'; password.placeholder = 'Contraseña'; password.className = 'swal2-input';
    const challenge = document.createElement('div');
    challenge.className = 'actor-turnstile-slot';
    const challengeStatus = document.createElement('small');
    challengeStatus.className = 'actor-turnstile-status';
    challengeStatus.textContent = 'Cargando verificación de seguridad…';
    form.append(note, email, password, challenge, challengeStatus);

    let challengeToken = '';
    let widgetId = null;
    let closed = false;

    function resetChallenge() {
      challengeToken = '';
      if (widgetId !== null && window.turnstile?.reset) window.turnstile.reset(widgetId);
    }

    const result = await Swal.fire({
      icon: 'info', title: 'ACCESO A ACTORES', html: form, showCancelButton: true,
      confirmButtonText: 'INICIAR SESIÓN', cancelButtonText: 'CANCELAR', focusConfirm: false,
      didOpen: () => {
        waitForApi().then(api => {
          if (closed) return;
          widgetId = api.render(challenge, {
            sitekey: publicKey,
            theme: 'light',
            size: 'flexible',
            action: 'login',
            callback: token => {
              challengeToken = token;
              challengeStatus.textContent = 'Verificación completada.';
              challengeStatus.classList.remove('error');
            },
            'expired-callback': () => {
              challengeToken = '';
              challengeStatus.textContent = 'La verificación expiró; complétala nuevamente.';
              challengeStatus.classList.add('error');
            },
            'error-callback': () => {
              challengeToken = '';
              challengeStatus.textContent = 'No se pudo completar la verificación.';
              challengeStatus.classList.add('error');
              return true;
            }
          });
          challengeStatus.textContent = 'Completa la verificación para continuar.';
        }).catch(error => {
          challengeStatus.textContent = error.message;
          challengeStatus.classList.add('error');
          Swal.showValidationMessage(error.message);
        });
      },
      preConfirm: async () => {
        const userEmail = email.value.trim();
        if (!userEmail || !password.value) {
          Swal.showValidationMessage('Captura correo y contraseña.');
          return false;
        }
        if (!challengeToken) {
          Swal.showValidationMessage('Completa la verificación de seguridad.');
          return false;
        }
        try {
          return await request('/api/integracion-actores/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail, password: password.value, turnstileToken: challengeToken })
          });
        } catch (error) {
          resetChallenge();
          challengeStatus.textContent = 'Verifica nuevamente antes de reintentar.';
          challengeStatus.classList.add('error');
          Swal.showValidationMessage(error.message);
          return false;
        }
      },
      willClose: () => {
        closed = true;
        if (widgetId !== null && window.turnstile?.remove) window.turnstile.remove(widgetId);
      }
    });
    return result.isConfirmed;
  }

  return { login };
})();
