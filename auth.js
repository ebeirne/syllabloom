(() => {
  const dialog = document.querySelector('#authDialog');
  const mount = document.querySelector('#clerkAuthMount');
  const fallback = document.querySelector('#authNotConfigured');
  const authButtons = [...document.querySelectorAll('[data-auth-open]')];
  let clerk = null;
  let signInMounted = false;
  let configured = false;
  let authResolved = false;
  let closing = false;
  let billingMount = null;

  window.SyllabloomAuth = {
    get configured() { return configured; },
    get resolved() { return authResolved; },
    get signedIn() { return Boolean(clerk?.isSignedIn); },
    open: openDialog,
    openClerkProfile,
    mountBilling,
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

  function billingAppearance() {
    const base = sharedAppearance();
    return {
      variables: {
        ...base.variables,
        colorPrimary: '#2f6b42',
        colorTextOnPrimary: '#fffdf6',
        colorBackground: '#fffdf6',
        colorInputBackground: '#fffdf6',
        borderRadius: '22px'
      },
      elements: {
        rootBox: { width: '100%' },
        cardBox: { width: '100%', boxShadow: 'none' },
        badge: { background: '#f6b9d2', border: '1px solid #2c2e2a', borderRadius: '999px', color: '#2c2e2a', fontWeight: '800' },
        pricingTableCard: { background: '#fffdf6', border: '1.5px solid #2c2e2a', borderRadius: '28px', boxShadow: '4px 4px 0 #2c2e2a' },
        pricingTableCardHeader: { background: 'transparent', border: '0', boxShadow: 'none' },
        pricingTableCardTitle: { color: '#2c2e2a', fontWeight: '850' },
        pricingTableCardButton: { minHeight: '50px', background: '#f6b9d2', border: '1.5px solid #2c2e2a', borderRadius: '999px', boxShadow: '3px 3px 0 #2c2e2a', color: '#2c2e2a', fontWeight: '850' },
        formButtonPrimary: { minHeight: '50px', background: '#f6b9d2', border: '1.5px solid #2c2e2a', borderRadius: '999px', boxShadow: '3px 3px 0 #2c2e2a', color: '#2c2e2a', fontWeight: '850' }
      }
    };
  }

  function currentPlan() {
    try {
      return clerk?.session?.checkAuthorization?.({ plan: 'student' }) ? 'student' : 'free';
    } catch (_) {
      return 'free';
    }
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

  function openDialog() {
    if (clerk?.isSignedIn) {
      window.dispatchEvent(new CustomEvent('syllabloom:open-profile'));
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

  function openClerkProfile() {
    if (!clerk?.isSignedIn) {
      openDialog();
      return;
    }
    clerk.openUserProfile({ appearance: sharedAppearance() });
  }

  async function mountBilling(node) {
    if (!node || !clerk || !configured) return { ready: false, reason: 'auth-not-ready' };
    if (!clerk.isSignedIn) return { ready: false, reason: 'sign-in-required' };
    try {
      const plansResponse = await clerk.billing.getPlans({});
      const plans = Array.isArray(plansResponse?.data) ? plansResponse.data : Array.isArray(plansResponse) ? plansResponse : [];
      if (!plans.length) return { ready: false, reason: 'no-plans' };
      if (billingMount && billingMount !== node) clerk.unmountPricingTable(billingMount);
      if (billingMount !== node) {
        const appearance = billingAppearance();
        clerk.mountPricingTable(node, {
          for: 'user',
          highlightedPlan: 'student',
          newSubscriptionRedirectUrl: `${window.location.origin}/#profile`,
          appearance,
          checkoutProps: { appearance }
        });
        billingMount = node;
      }
      return { ready: true, planCount: plans.length };
    } catch (error) {
      console.info('Clerk Billing is not enabled for this instance yet.', error);
      return { ready: false, reason: 'billing-disabled' };
    }
  }

  function updateAuthState() {
    if (!clerk) return false;
    authResolved = true;
    const signedIn = Boolean(clerk?.isSignedIn && clerk.user);
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
        plan: signedIn ? currentPlan() : 'free'
      }
    }));
    if (signedIn && dialog.open) closeDialog();
    return signedIn;
  }

  function markAuthUnavailable() {
    authResolved = true;
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
      if (!response.ok) return;
      const config = await response.json();
      const publishableKey = String(config.publishableKey || '');
      if (!publishableKey.startsWith('pk_')) {
        markAuthUnavailable();
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
      markAuthUnavailable();
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
