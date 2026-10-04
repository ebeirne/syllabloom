const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('opening a lecture without generated cards preserves the saved class card library',()=>{
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const code=source.slice(source.indexOf('  function renderLectureInsights('),source.indexOf('  function drawLectureProgress('));
 const saved=[{id:'diagram-card',front:'Recall diagram label',back:'Language design',noteType:'ImageOcclusion'}];
 let result;
 const context={Set,escapeHtml:x=>x,labelCase:x=>x,clock:x=>x,
  sourceCardsFromLibrary:()=>saved,syncLectureCards:cards=>result=cards,updateSourceGate:()=>{},
  window:{SyllabloomCardSet:{contentKey:card=>card.front}},
  document:{querySelector:()=>({})}};
 vm.createContext(context);vm.runInContext(code,context);
 context.renderLectureInsights({cards:[]});assert.equal(result.length,1);assert.equal(result[0].id,'diagram-card');
 context.renderLectureInsights({cards:[saved[0]]});assert.equal(result.length,1);
});
