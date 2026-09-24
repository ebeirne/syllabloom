(() => {
  const dialog = document.querySelector('#authDialog');
  const mount = document.querySelector('#clerkAuthMount');
  const fallback = document.querySelector('#authNotConfigured');
  const authButtons = [...document.querySelectorAll('[data-auth-open]')];
  let clerk = null;
  let clerkLoaded = false;
  let signInMounted = false;
  let configured = false;
  let authResolved = false;
  let closing = false;
  let lastSignedInState = null;

  window.SyllabloomAuth = {
    get configured() { return configured; },
    get resolved() { return authResolved; },
    get signedIn() { return Boolean(clerk?.isSignedIn); },
    getToken: async () => clerk?.session?.getToken?.() || null,
    open: openDialog,
    openClerkProfile,
    signOutCurrentSession,
    refresh: () => clerk ? updateAuthState() : false
  };

  function sharedAppearance() {
    return {
      variables: {
        colorPrimary: '#2f6b42',
        colorText: '#2c2e2a',
        colorTextOnPrimary: '#ffffff',
        colorBackground: '#fffdf6',
        colorInputBackground: '#fffdf6',
        colorInputText: '#2c2e2a',
        colorNeutral: '#666963',
        colorRing: '#2f6b42',
        borderRadius: '18px',
        spacingUnit: '16px',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
      },
      elements: {
        rootBox: { width: '100%' },
        cardBox: { width: '100%', boxShadow: 'none' },
        card: { width: '100%', background: '#fffdf6', boxShadow: '7px 7px 0 #2c2e2a', border: '2px solid #2c2e2a', borderRadius: '34px' },
        modalContent: { borderRadius: '34px' },
        modalCloseButton: { width: '42px', height: '42px', background: '#f5e211', border: '1.5px solid #2c2e2a', borderRadius: '50%', color: '#2c2e2a' },
        navbar: { background: '#f6b9d2', borderRight: '1.5px solid #2c2e2a' },
        navbarButton: { color: '#2c2e2a', fontWeight: '750' },
        navbarButtonActive: { background: '#f5e211', border: '1.5px solid #2c2e2a', borderRadius: '999px', color: '#2c2e2a' },
        avatarBox: { overflow: 'hidden', border: '2px solid #2c2e2a', borderRadius: '50%', boxShadow: '3px 3px 0 #f5e211' },
        userPreviewAvatarBox: { overflow: 'hidden', border: '2px solid #2c2e2a', borderRadius: '50%', boxShadow: '3px 3px 0 #f5e211' },
        profileSection: { borderBottom: '1px solid rgba(44,46,42,.18)' },
        profileSectionPrimaryButton: { color: '#2f6b42', fontWeight: '800' },
        formButtonPrimary: {
          background: '#f5e211',
          border: '1.5px solid #2c2e2a',
          borderRadius: '999px',
          boxShadow: '3px 3px 0 #2c2e2a',
          color: '#2c2e2a',
          fontWeight: '850'
        }
      }
    };
  }

  async function closeDialog() {
    if (!dialog.open || closing) return;
    closing = true;
    if (window.SyllabloomMotion?.closeAuth) {
      await window.SyllabloomMotion.closeAuth(dialog);
    }
    if (dialog.open) dialog.close();
    closing = false;
  }

  function resetSignInMount() {
    if (!signInMounted) return false;
    try {
      clerk?.unmountSignIn?.(mount);
    } catch (error) {
      console.info('Could not reset the previous sign-in view.', error);
    }
    signInMounted = false;
    return true;
  }

  function mountSignInIfReady() {
    if (!clerk || !clerkLoaded) return false;
    if (signInMounted && mount.childElementCount > 0) return false;
    if (signInMounted) resetSignInMount();
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
          spacing: '12px',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
        },
        elements: {
          rootBox: { width: '100%' },
          cardBox: { width: '100%', boxShadow: 'none', borderRadius: '0', overflow: 'visible' },
          card: { width: '100%', padding: '0', boxShadow: 'none', border: '0' },
          header: { display: 'none' },
          main: { gap: '12px' },
          form: { gap: '10px' },
          formFieldLabel: {
            color: '#171816',
            fontSize: '12px',
            fontWeight: '800',
            lineHeight: '1.35',
            marginBottom: '4px'
          },
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
          dividerRow: { gap: '12px', margin: '0' },
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
    return true;
  }

  function openDialog() {
    if (clerk?.isSignedIn) {
      window.dispatchEvent(new CustomEvent('syllabloom:open-profile'));
      return;
    }
    const opening = !dialog.open;
    if (opening) dialog.showModal();
    mountSignInIfReady();

    if (opening) {
      const compactViewport = window.matchMedia('(max-width: 760px) and (max-height: 560px)').matches;
      if (compactViewport) {
        // Clerk can focus the email field as it mounts. On a short mobile
        // viewport that focus may scroll the native dialog past its heading.
        mount.querySelector(':focus')?.blur();
        dialog.scrollTop = 0;
      }
      requestAnimationFrame(() => {
        if (compactViewport) dialog.scrollTop = 0;
        window.SyllabloomMotion?.openAuth?.(dialog);
      });
    }
  }

  function openClerkProfile() {
    if (!clerk?.isSignedIn) {
      openDialog();
      return;
    }
    clerk.openUserProfile({ appearance: sharedAppearance() });
  }

  async function signOutCurrentSession() {
    const sessionId = clerk?.session?.id;
    if (!clerk?.isSignedIn || !sessionId) {
      throw new Error('The current account session is not available.');
    }
    resetSignInMount();
    await clerk.signOut({ sessionId });
    // Keep Clerk's next sign-in from reusing a stale in-memory instance after
    // switching accounts. The app persists account data separately, so a
    // fresh document is safe here and avoids requiring users to reload by hand.
    const landingUrl = new URL(window.location.href);
    landingUrl.hash = '#landing';
    window.history.replaceState(null, '', landingUrl);
    window.location.reload();
    return true;
  }

  function updateAuthState() {
    if (!clerk) return false;
    authResolved = true;
    const signedIn = Boolean(clerk?.isSignedIn && clerk.user);
    if (lastSignedInState !== null && lastSignedInState !== signedIn && signInMounted) {
      // Clerk can clear its mounted SignIn view after authentication. Unmount
      // it on either session transition so a later account switch gets a fresh
      // form instead of a stale, empty mount point.
      resetSignInMount();
    }
    lastSignedInState = signedIn;
    const email = clerk?.user?.primaryEmailAddress?.emailAddress || '';
    authButtons.forEach(button => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = signedIn ? 'Account' : button.dataset.defaultLabel || button.textContent;
      button.dataset.defaultLabel ||= 'Sign in';
    });
    window.dispatchEvent(new CustomEvent('syllabloom:auth-change', {
      detail: {
        signedIn,
        email,
        userId: clerk?.user?.id || '',
        displayName: clerk?.user?.fullName || clerk?.user?.firstName || '',
        imageUrl: clerk?.user?.imageUrl || '',
        plan: 'free'
      }
    }));
    if (signedIn && dialog.open) closeDialog();
    return signedIn;
  }

  function markAuthUnavailable(reason = 'not-configured') {
    authResolved = true;
    const title = fallback.querySelector('#authUnavailableTitle');
    const description = fallback.querySelector('#authUnavailableDescription');
    const copy = reason === 'test-key-in-production'
      ? [
          'Beta sign-in is paused on this deployment.',
          'This site is connected to Clerk test mode. Switch to the production Clerk key before inviting students.'
        ]
      : reason === 'config-error'
        ? [
            'Could not check beta sign-in.',
            'Check your connection and try again. No account or email was submitted.'
          ]
        : reason === 'load-failed'
          ? [
              'Beta sign-in could not load.',
              'Refresh the page or try again later. No account or email was submitted.'
            ]
          : [
              'Beta sign-in is not connected on this build.',
              'Connect the production Clerk configuration before inviting students. This preview will not pretend an account was created.'
            ];
    if (title) title.textContent = copy[0];
    if (description) description.textContent = copy[1];
    fallback.hidden = false;
    mount.hidden = true;
    authButtons.forEach(button => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = button.dataset.defaultLabel || 'Sign in';
    });
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
      if (!response.ok) {
        markAuthUnavailable('config-error');
        window.dispatchEvent(new CustomEvent('syllabloom:auth-ready', { detail: { configured: false } }));
        return;
      }
      const config = await response.json();
      const publishableKey = String(config.publishableKey || '');
      if (!publishableKey.startsWith('pk_')) {
        markAuthUnavailable(config.reason || 'not-configured');
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
      clerkLoaded = true;
      fallback.hidden = true;
      mount.hidden = false;
      updateAuthState();
      clerk.addListener(updateAuthState);
      // The user can open the dialog while the Clerk bundles are loading.
      // In that case openDialog() cannot mount the component yet, so finish
      // mounting now that Clerk is ready instead of leaving its loader stuck.
      if (dialog.open && !clerk.isSignedIn) mountSignInIfReady();
      window.dispatchEvent(new CustomEvent('syllabloom:auth-ready', { detail: { configured: true } }));
    } catch (error) {
      console.info('Email sign-in is not configured on this build.', error);
      markAuthUnavailable('load-failed');
      window.dispatchEvent(new CustomEvent('syllabloom:auth-ready', { detail: { configured: false } }));
    }
  }

  authButtons.forEach(button => {
    button.dataset.defaultLabel = button.textContent.trim();
    button.textContent = 'Checking account';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
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
