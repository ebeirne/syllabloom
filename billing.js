(() => {
  let current = null;
  let sequence = 0;
  let authRevision = 0;
  let busy = false;
  const text = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
  async function request(body) {
    const token = await window.SyllabloomAuth?.getToken();
    if (!token) throw new Error('Sign in to check your plan.');
    const response = await fetch('/api/billing-access', {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load billing.');
    return result;
  }
  function render() {
    window.dispatchEvent(new CustomEvent('syllabloom:billing-change', {detail:current}));
    const plan = current?.plan;
    const label = plan === 'founder' ? 'Founder access' : plan === 'early' ? 'Early member' : plan === 'student' ? 'Student' : plan === 'beta' ? 'Beta access' : 'Choose a plan';
    for (const id of ['billingTierBadge', 'profileTierBadge', 'profileTierName']) text(id, label);
    text('billingCurrentPrice', current?.lifetime || plan === 'beta' ? '$0' : plan === 'student' ? (current.cadence === 'yearly' ? '$108' : '$12') : '—');
    text('billingCurrentCadence', current?.lifetime ? 'free for life' : plan === 'student' ? (current.cadence === 'yearly' ? 'billed annually' : 'billed monthly') : '');
    text('billingCurrentDescription', current?.lifetime ? 'Your study tools are included for life. No subscription or payment details needed.' : 'Class material → editable cards, source checks, study practice, and Anki export. One active class.');
    text('billingConnectionStatus', current?.lifetime ? 'Free lifetime access confirmed' : current?.access ? 'Access active' : 'Sign in to check free access or choose a plan');
    text('billingFinePrint', current?.cancelAtPeriodEnd ? 'Your subscription will end after the current paid period. Manage it below.' : 'Monthly: $12 billed each month. Yearly: $108 billed once a year ($9/month equivalent). Subscriptions renew until canceled. Manage or cancel through secure billing.');
    document.querySelectorAll('[data-subscribe]').forEach(button => {
      button.disabled = busy || Boolean(current?.access);
      if (current?.lifetime) button.title = 'Your account already has free lifetime access.';
      else button.removeAttribute('title');
    });
    const manage = document.querySelector('#manageSubscription');
    if (manage) { manage.hidden = !current?.canManage && plan !== 'student'; manage.disabled = busy; }
  }
  async function refresh() {
    const run = ++sequence;
    current = null;
    render();
    if (!window.SyllabloomAuth?.signedIn) return;
    try {
      const result = await request();
      if (run !== sequence) return;
      current = result;
      render();
      if (new URLSearchParams(location.search).get('checkout') === 'success' && !result.access) {
        text('billingConnectionStatus', 'Payment is being verified. Refresh access in a moment.');
      }
    } catch (error) {
      if (run === sequence) text('billingConnectionStatus', error.message);
    }
  }
  async function action(body) {
    if (busy) return;
    if (!window.SyllabloomAuth?.signedIn) { window.SyllabloomAuth?.open(); return; }
    const revision = authRevision;
    busy = true; render();
    try {
      const result = await request(body);
      if (revision !== authRevision) return;
      if (result.alreadyIncluded) { await refresh(); return; }
      if (result.url) {
        const url = new URL(result.url);
        if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) throw new Error('Invalid checkout destination.');
        if (body.action === 'checkout') { window.SyllabloomEvents?.track('checkout_started', {cadence:body.cadence}); await Promise.race([window.SyllabloomEvents?.flush(), new Promise(resolve=>setTimeout(resolve,1000))]); }
        location.assign(url.href);
      } else throw new Error('Checkout is not enabled yet.');
    } catch (error) { if (revision === authRevision) text('billingConnectionStatus', error.message); }
    finally {
      busy = false;
      document.querySelectorAll('[data-subscribe]').forEach(b => { b.disabled = Boolean(current?.access); });
      const manage = document.querySelector('#manageSubscription');
      if (manage) manage.disabled = false;
    }
  }
  document.querySelectorAll('[data-subscribe]').forEach(button => button.addEventListener('click', () => action({action:'checkout', cadence:button.dataset.subscribe})));
  document.querySelector('#manageSubscription')?.addEventListener('click', () => action({action:'portal'}));
  document.querySelector('#refreshBilling')?.addEventListener('click', refresh);
  window.addEventListener('syllabloom:auth-change', () => { authRevision++; refresh(); });
  window.addEventListener('hashchange', () => { if (location.hash === '#billing') refresh(); });
  document.querySelector('#checkBillingConfiguration')?.addEventListener('click', async event => {
    const button=event.currentTarget;button.disabled=true;const revision=authRevision;
    text('billingConfigurationResult','Checking configured prices in Stripe...');
    try { const result=await request({action:'verify-config'}); if(revision!==authRevision) return;
      text('billingConfigurationResult',result.pricesVerified?.monthly && result.pricesVerified?.yearly
        ? `Stripe ${result.mode} prices verified: $12 monthly and $108 yearly. Webhook secret ${result.webhookConfigured ? 'configured' : 'missing'}; portal ${result.portalConfigured ? 'configured' : 'missing'}. This does not test a charge, cancellation or refund.`
        : 'Payment configuration needs review. At least one configured price did not match the advertised plan.');
    } catch(error) { if(revision===authRevision) text('billingConfigurationResult',error.message); }
    finally {button.disabled=false;}
  });
  window.SyllabloomBilling = { refresh, render, async ensureAccess() { const revision=authRevision; const result=await request(); if(revision!==authRevision) throw new Error('Account changed. Try again.'); current=result; render(); return result; }, get current() { return current; } };
  refresh();
})();
