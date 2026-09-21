(() => {
  const dialog = document.querySelector('#authDialog');
  const mount = document.querySelector('#clerkAuthMount');
  const fallback = document.querySelector('#authNotConfigured');
  const authButtons = [...document.querySelectorAll('[data-auth-open]')];
  let clerk = null;
  let signInMounted = false;
  let configured = false;

  window.SyllabloomAuth = {
    get configured() { return configured; },
    get signedIn() { return Boolean(clerk?.isSignedIn); },
    open: openDialog
  };

  function openDialog() {
    if (clerk?.isSignedIn) {
      clerk.openUserProfile();
      return;
    }
    if (clerk && !signInMounted) {
      clerk.mountSignIn(mount, {
        routing: 'virtual',
        appearance: {
          variables: {
            colorPrimary: '#526d60',
            colorText: '#252a27',
            colorBackground: '#fbfaf6',
            colorInputBackground: '#f3f1ea',
            colorNeutral: '#66716b',
            borderRadius: '14px',
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
          },
          elements: {
            rootBox: { width: '100%' },
            cardBox: { width: '100%', boxShadow: 'none' },
            card: { width: '100%', padding: '0', boxShadow: 'none', border: '0' },
            header: { display: 'none' },
            footer: { background: 'transparent' }
          }
        }
      });
      signInMounted = true;
    }
    if (!dialog.open) dialog.showModal();
  }

  function updateAuthState() {
    const signedIn = Boolean(clerk?.isSignedIn && clerk.user);
    const email = clerk?.user?.primaryEmailAddress?.emailAddress || '';
    authButtons.forEach(button => {
      button.textContent = signedIn ? 'Account' : button.dataset.defaultLabel || button.textContent;
      button.dataset.defaultLabel ||= 'Sign in';
    });
    window.dispatchEvent(new CustomEvent('syllabloom:auth-change', {
      detail: {
        signedIn,
        email,
        userId: clerk?.user?.id || ''
      }
    }));
    if (signedIn && dialog.open) dialog.close();
  }

  function loadScript(source, attributes = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      script.crossOrigin = 'anonymous';
      Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error(`Could not load ${source}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function configureClerk() {
    try {
      const response = await fetch('/api/auth-config', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const config = await response.json();
      const publishableKey = String(config.publishableKey || '');
      if (!publishableKey.startsWith('pk_')) {
        window.dispatchEvent(new CustomEvent('syllabloom:auth-ready', { detail: { configured: false } }));
        return;
      }

      configured = true;
      const encodedDomain = publishableKey.split('_')[2];
      const frontendDomain = window.atob(encodedDomain).slice(0, -1);
      await loadScript(`https://${frontendDomain}/npm/@clerk/ui@1/dist/ui.browser.js`);
      await loadScript(`https://${frontendDomain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, {
        'data-clerk-publishable-key': publishableKey
      });
      if (!window.Clerk) throw new Error('Clerk did not initialize.');
      clerk = window.Clerk;
      await clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
      fallback.hidden = true;
      mount.hidden = false;
      updateAuthState();
      clerk.addListener(updateAuthState);
      window.dispatchEvent(new CustomEvent('syllabloom:auth-ready', { detail: { configured: true } }));
    } catch (error) {
      console.info('Email sign-in is not configured on this build.', error);
      window.dispatchEvent(new CustomEvent('syllabloom:auth-ready', { detail: { configured: false } }));
    }
  }

  authButtons.forEach(button => {
    button.dataset.defaultLabel = button.textContent.trim();
    button.addEventListener('click', openDialog);
  });
  document.querySelectorAll('[data-close-auth]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => {
    if (event.target === event.currentTarget) dialog.close();
  });
  window.addEventListener('syllabloom:auth-request', openDialog);

  configureClerk();
})();
