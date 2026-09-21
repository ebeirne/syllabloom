(() => {
  const dialog = document.querySelector('#authDialog');
  const mount = document.querySelector('#clerkAuthMount');
  const fallback = document.querySelector('#authNotConfigured');
  const authButtons = [...document.querySelectorAll('[data-auth-open]')];
  let clerk = null;
  let signInMounted = false;
  let configured = false;
  let closing = false;

  window.SyllabloomAuth = {
    get configured() { return configured; },
    get signedIn() { return Boolean(clerk?.isSignedIn); },
    open: openDialog
  };

  async function closeDialog() {
    if (!dialog.open || closing) return;
    closing = true;
    if (window.SyllabloomMotion?.closeAuth) {
      await window.SyllabloomMotion.closeAuth(dialog);
    }
    if (dialog.open) dialog.close();
    closing = false;
  }

  function openDialog() {
    if (clerk?.isSignedIn) {
      clerk.openUserProfile();
      return;
    }
    if (clerk && !signInMounted) {
      clerk.mountSignIn(mount, {
        routing: 'virtual',
        appearance: {
          options: {
            socialButtonsPlacement: 'bottom',
            socialButtonsVariant: 'blockButton'
          },
          variables: {
            colorPrimary: '#171816',
            colorText: '#171816',
            colorTextOnPrimary: '#171816',
            colorBackground: '#fffdf6',
            colorInputBackground: '#fffdf6',
            colorInputText: '#171816',
            colorNeutral: '#575a52',
            colorRing: '#3677c7',
            borderRadius: '18px',
            spacingUnit: '16px',
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
          },
          elements: {
            rootBox: { width: '100%' },
            cardBox: { width: '100%', boxShadow: 'none' },
            card: { width: '100%', padding: '0', boxShadow: 'none', border: '0' },
            header: { display: 'none' },
            main: { gap: '18px' },
            form: { gap: '12px' },
            formFieldLabel: { color: '#171816', fontSize: '12px', fontWeight: '800' },
            formFieldInput: {
              minHeight: '50px',
              background: '#fffdf6',
              border: '1.5px solid #171816',
              borderRadius: '15px',
              boxShadow: '2px 2px 0 #a8e3dc',
              color: '#171816',
              fontSize: '15px'
            },
            formButtonPrimary: {
              minHeight: '50px',
              background: '#f6df19',
              border: '1.5px solid #171816',
              borderRadius: '14px',
              boxShadow: '3px 3px 0 #171816',
              color: '#171816',
              fontSize: '14px',
              fontWeight: '850'
            },
            socialButtonsBlockButton: {
              minHeight: '48px',
              background: '#fffdf6',
              border: '1.5px solid #171816',
              borderRadius: '14px',
              boxShadow: '3px 3px 0 #f2a5c2',
              color: '#171816',
              fontWeight: '760'
            },
            dividerRow: { gap: '12px', margin: '2px 0' },
            dividerLine: { background: '#cbc2ae' },
            dividerText: { color: '#575a52', fontSize: '11px', fontWeight: '750' },
            footer: { background: 'transparent' },
            footerActionLink: { color: '#11633e', fontWeight: '850' },
            identityPreview: {
              background: '#a8e3dc',
              border: '1.5px solid #171816',
              borderRadius: '15px'
            },
            otpCodeFieldInput: {
              border: '1.5px solid #171816',
              borderRadius: '12px',
              boxShadow: '2px 2px 0 #a8e3dc'
            },
            formResendCodeLink: { color: '#11633e', fontWeight: '850' },
            backLink: { color: '#11633e', fontWeight: '850' },
            alert: {
              background: '#f8cfdd',
              border: '1.5px solid #171816',
              borderRadius: '14px',
              color: '#171816'
            }
          }
        }
      });
      signInMounted = true;
    }
    if (!dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => window.SyllabloomMotion?.openAuth?.(dialog));
    }
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
    if (signedIn && dialog.open) closeDialog();
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
  document.querySelectorAll('[data-close-auth]').forEach(button => button.addEventListener('click', closeDialog));
  dialog.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeDialog();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });
  window.addEventListener('syllabloom:auth-request', openDialog);

  configureClerk();
})();
