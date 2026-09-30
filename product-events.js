(() => {
  let owner = '', queue = [], timer, flushing = false;
  const sessionId = crypto.randomUUID();
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const save = (key,value) => { try { localStorage.setItem(key,JSON.stringify(value)); } catch {} };
  const optedOut = () => read('syllabloom-usage-opt-out') === true;
  const referral = new URLSearchParams(location.search).get('ref');
  if (/^[a-z0-9_-]{1,40}$/.test(referral || '')) save('syllabloom-referral', { code:referral, at:Date.now() });
  function persist() { if(owner) save(`syllabloom-events:${owner}`, queue.slice(-50)); }
  async function flush() {
    if (flushing || !owner || !queue.length || optedOut()) return;
    flushing = true;
    const account = owner, batch = queue.slice(0,20);
    try {
      const token = await window.SyllabloomAuth?.getToken?.();
      if (!token || account !== owner || optedOut()) return;
      const response = await fetch('/api/product-events', {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({events:batch}),keepalive:true});
      if(response.ok && account === owner) {
        const sent = new Set(batch.map(event=>event.id));
        queue = queue.filter(event=>!sent.has(event.id)); persist();
      }
    } catch {} finally { flushing=false; }
  }
  function track(name,properties = {}) {
    if (!owner || optedOut()) return;
    const ref = read('syllabloom-referral');
    queue.push({at:Date.now(),id:crypto.randomUUID(),sessionId,name,properties:{...properties,...(ref && Date.now()-ref.at < 30*86400000 ? {referral:ref.code} : {})}});
    queue = queue.slice(-50); persist(); clearTimeout(timer); timer=setTimeout(flush,800);
  }
  const checkbox = document.querySelector('#usageMetricsEnabled');
  if(checkbox) {
    checkbox.checked = !optedOut();
    checkbox.addEventListener('change',()=>{
      save('syllabloom-usage-opt-out',!checkbox.checked);
      if(!checkbox.checked) { queue=[]; persist(); clearTimeout(timer); }
    });
  }
  window.addEventListener('syllabloom:auth-change',event=>{
    const next = event.detail?.signedIn ? event.detail.userId : '';
    if(next === owner) return;
    owner=next; queue=owner ? (read(`syllabloom-events:${owner}`) || []).filter(event=>event?.id && Date.now()-event.at<86400000).slice(-50) : [];
    if(optedOut()) { queue=[];persist(); } else track('session_started');
  });
  window.addEventListener('online',flush);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden') flush();});
  window.addEventListener('syllabloom:billing-change',event=>{
    document.querySelector('#productReportPanel').hidden=event.detail?.plan !== 'founder';
  });
  document.querySelector('#loadProductReport')?.addEventListener('click',async()=>{
    const output=document.querySelector('#productReportOutput'); output.textContent='Loading signed-in usage…';
    const account=owner;
    try {
      await flush();
      const token=await window.SyllabloomAuth?.getToken?.();
      if(!token || account!==owner) return;
      const response=await fetch('/api/product-events',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      const result=await response.json(); if(!response.ok) throw new Error(result.error);
      if(account!==owner) return;
      output.replaceChildren();
      for(const cohort of ['organic','research','founder']) {
        const heading=document.createElement('h3'); heading.textContent=`${cohort[0].toUpperCase()+cohort.slice(1)} users`;output.append(heading);
        const list=document.createElement('ul');
        for(const row of result.events.filter(row=>row.cohort===cohort)) {const li=document.createElement('li');li.textContent=`${row.event.replaceAll('_',' ')}: ${row.users} user${row.users===1?'':'s'}, ${row.count} event${row.count===1?'':'s'}`;list.append(li);}
        const ret=document.createElement('li');ret.textContent=`Studied on two or more UTC dates: ${result.returning[cohort] || 0} users`;list.append(ret);output.append(list);
      }
      for(const row of result.grossRevenue) {const p=document.createElement('p');p.textContent=`${row.cohort} gross receipts: ${(row.amountMinor/100).toFixed(2)} ${row.currency.toUpperCase()} (before fees and refunds)`;output.append(p);}
      for(const row of result.referrals) {const p=document.createElement('p');p.textContent=`Referral ${row.code}: ${row.studyingUsers} organic studying users`;output.append(p);}
    } catch(error) {output.textContent=error.message || 'Report unavailable. Try again.';}
  });
  window.SyllabloomEvents={track,flush};
})();
