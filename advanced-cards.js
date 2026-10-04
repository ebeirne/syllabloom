(function(root) {
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clozePattern = /\{\{c([1-9]\d*)::([^{}]+?)\}\}/g;
  function clozeHtml(text, reveal = false) {
    return escape(text).replace(clozePattern, (_, number, content) => {
      const [answer, hint] = content.split('::');
      return `<span class="cloze-blank">${reveal ? answer : '[' + (hint || '…') + ']'}</span>`;
    });
  }
  function validCloze(text) { return typeof text === 'string' && /\{\{c1::[^{}]+\}\}/.test(text) && !/\{\{c(?:[2-9]|1\d)\d*::/.test(text) && text.length <= 3000; }
  function validOcclusion(card) {
    const o = card?.occlusion;
    return Boolean(o && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(o.image || '') && o.image.length <= 400050 &&
      Array.isArray(o.masks) && o.masks.length > 0 && o.masks.length <= 12 && o.masks.some(m => m.id === o.target) &&
      o.masks.every(m => ['x','y','w','h'].every(k => typeof m[k] === 'number' && Number.isFinite(m[k]) && m[k] >= 0 && m[k] <= 100) && m.w >= .5 && m.h >= .5 && m.x+m.w <= 100.01 && m.y+m.h <= 100.01));
  }
  function imageHtml(card, reveal = false) {
    if (!validOcclusion(card)) return '<p>This diagram needs an edit.</p>';
    const o = card.occlusion;
    return `<div class="occlusion-image"><img src="${escape(o.image)}" alt="Study diagram with covered regions">${o.masks.filter(m => !reveal || m.id !== o.target).map(m => `<span class="occlusion-mask ${m.id === o.target ? 'is-target' : ''}" style="left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%"></span>`).join('')}</div>`;
  }
  function render(card, reveal = false) {
    if (card.noteType === 'ImageOcclusion') return imageHtml(card, reveal) + (reveal ? `<p>${escape(card.back)}</p>` : '<p>Identify the region covered in pink.</p>');
    if (card.noteType === 'Cloze' && validCloze(card.clozeText)) return clozeHtml(card.clozeText, reveal);
    return escape(reveal ? card.back : card.front);
  }
  function createEditor(onSave) {
    const dialog = document.createElement('dialog');
    dialog.className = 'occlusion-editor';
    dialog.innerHTML = `<form method="dialog"><button class="button" aria-label="Close diagram editor">Close</button></form><h2>Create image occlusion cards</h2><p>Upload a diagram, drag over a label or region, and enter its answer. Pink is the region to recall; the other regions stay covered.</p><label>Diagram title<input id="occlusionTitle" maxlength="100" placeholder="e.g. Cranial nerves"></label><label class="button primary">Choose diagram<input id="occlusionUpload" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="occlusion-editor-stage" hidden><img alt="Diagram to cover"><div class="occlusion-editor-overlay"></div></div><ol class="occlusion-mask-list"></ol><p role="status" class="occlusion-editor-status">PNG, JPEG or WebP. Up to 12 regions per diagram.</p><button type="button" class="button primary occlusion-save" disabled>Create cards</button>`;
    document.body.append(dialog);
    const stage = dialog.querySelector('.occlusion-editor-stage'), image = stage.querySelector('img'), overlay = stage.querySelector('div');
    const list = dialog.querySelector('ol'), status = dialog.querySelector('[role=status]'), save = dialog.querySelector('.occlusion-save');
    let masks = [], start = null, draft = null, imageData = '', filename = '', owner = '';
    function redraw() {
      overlay.innerHTML = masks.map(m => `<span class="occlusion-mask is-target" style="left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%"></span>`).join('');
      list.innerHTML = masks.map((m,i) => `<li><label>Region ${i+1} answer<input data-mask-label="${m.id}" maxlength="120" value="${escape(m.label)}"></label><button type="button" data-remove-mask="${m.id}">Remove</button></li>`).join('');
      save.disabled = !masks.length || masks.some(m => !m.label.trim());
    }
    dialog.querySelector('#occlusionUpload').addEventListener('change', async event => {
      try {
        const file = event.target.files[0]; if (!file) return;
        if (file.size > 20*1024*1024) throw Error('Use a diagram smaller than 20 MB.');
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas'), scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
        canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale);
        const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
        let quality = .9; imageData = canvas.toDataURL('image/jpeg',quality);
        while (imageData.length > 250000 && quality > .3) { quality -= .1; imageData = canvas.toDataURL('image/jpeg',quality); }
        if (imageData.length > 250000) throw Error('Crop this image to one diagram before uploading.');
        image.src = imageData; filename = file.name; masks = []; stage.hidden = false; redraw();
        status.textContent = 'Drag a rectangle over a label or region, then enter its answer.';
      } catch(error) { status.textContent = error.message; imageData = ''; save.disabled = true; }
    });
    const point = event => { const r=overlay.getBoundingClientRect(); return {x:Math.max(0,Math.min(100,(event.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(event.clientY-r.top)/r.height*100))}; };
    overlay.addEventListener('pointerdown', event => { if(masks.length >= 12) {status.textContent='Use up to 12 regions per diagram.';return;} start=point(event); overlay.setPointerCapture(event.pointerId); draft=document.createElement('span'); draft.className='occlusion-mask is-target'; overlay.append(draft); });
    overlay.addEventListener('pointermove', event => { if(!start) return; const p=point(event); Object.assign(draft.style,{left:Math.min(start.x,p.x)+'%',top:Math.min(start.y,p.y)+'%',width:Math.abs(start.x-p.x)+'%',height:Math.abs(start.y-p.y)+'%'}); });
    overlay.addEventListener('pointerup', event => { if(!start)return; const p=point(event), m={id:crypto.randomUUID(),x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(start.x-p.x),h:Math.abs(start.y-p.y),label:''};start=null;if(m.w>=.5 && m.h>=.5)masks.push(m);redraw();list.querySelector('li:last-child input')?.focus(); });
    overlay.addEventListener('pointercancel', () => {start=null;redraw();});
    list.addEventListener('input', event => {const m=masks.find(m=>m.id===event.target.dataset.maskLabel);if(m)m.label=event.target.value;save.disabled=!masks.length||masks.some(m=>!m.label.trim());});
    list.addEventListener('click', event => {const id=event.target.dataset.removeMask;if(id){masks=masks.filter(m=>m.id!==id);redraw();}});
    save.addEventListener('click', async () => {if(save.disabled)return;save.disabled=true;try{await onSave({title:dialog.querySelector('#occlusionTitle').value.trim()||filename,image:imageData,masks:structuredClone(masks),owner});dialog.close();}catch(error){status.textContent=error.message;save.disabled=false;}});
    return {open(accountOwner, initialImage, title){if(owner!==accountOwner){masks=[];imageData='';stage.hidden=true;redraw();}owner=accountOwner;if(initialImage){imageData=initialImage;image.src=initialImage;filename=title||'Study illustration';masks=[];stage.hidden=false;dialog.querySelector('#occlusionTitle').value=filename;redraw();}dialog.showModal();}};
  }
  const api={clozeHtml,validCloze,validOcclusion,imageHtml,render,createEditor};
  root.SyllabloomAdvancedCards=api;
  if(typeof module!=='undefined') module.exports=api;
})(typeof window==='undefined'?globalThis:window);
