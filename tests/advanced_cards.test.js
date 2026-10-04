const test=require('node:test'),assert=require('node:assert/strict'),a=require('../advanced-cards.js');
test('cloze front hides terms and escapes HTML; reveal shows the term',()=>{
 const text='The {{c1::osteoblast}} builds <script>bone</script>.';
 assert(!a.clozeHtml(text).includes('osteoblast'));assert(a.clozeHtml(text,true).includes('osteoblast'));
 assert(a.clozeHtml(text).includes('&lt;script&gt;'));assert(!a.validCloze('{{c2::bad}}'));
});
test('diagram bounds are enforced and only the active region is revealed',()=>{
 const card={occlusion:{image:'data:image/jpeg;base64,/9j/',target:'a',masks:[{id:'a',x:0,y:0,w:20,h:20},{id:'b',x:50,y:50,w:20,h:20}]}};
 assert(a.validOcclusion(card));assert.equal((a.imageHtml(card,true).match(/<span/g)||[]).length,1);
 card.occlusion.masks[0].x=99;assert(!a.validOcclusion(card));
});
