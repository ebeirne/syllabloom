const test=require('node:test');
const assert=require('node:assert/strict');
const flow=require('../source-experience.js');
const cards=require('../card-set.js');
test('coverage counts only exact cited sections and retains blank pages',()=>{
 const result=flow.coverage({studySections:[{label:'Page 1',text:'one'},{label:'Page 2',text:''},{label:'Page 10',text:'ten'}]},[{sourceLocation:'Page 10'}]);
 assert.deepEqual(result.map(row=>row.count),[0,0,1]);assert.equal(result[1].readable,false);
});
test('five-card session favors unseen cards and excludes previous session',()=>{
 const pool=Array.from({length:12},(_,i)=>({id:String(i)}));
 assert.deepEqual(flow.chooseSession(pool,[{cardId:'lecture-0'}],['1','2']).map(card=>card.id),['3','4','5','6','7']);
 assert.equal(flow.chooseSession(pool.slice(0,2)).length,2);
});
test('targeted drafts keep originals, identity, deletions and avoid duplicates',()=>{
 const original={id:'s',fingerprint:'original',draftCards:[{front:'One?',back:'One'}],deletedCardKeys:[cards.contentKey({front:'Deleted?',back:'Deleted'})]};
 const result=flow.mergeAdditional(original,{fingerprint:'selected',draftCards:[{front:'One?',back:'One'},{front:'Two?',back:'Two'},{front:'Deleted?',back:'Deleted'}]},cards);
 assert.equal(result.fingerprint,'original');assert.equal(result.draftCards.length,2);
 assert.throws(()=>flow.mergeAdditional(null,{},cards),/removed/);
});
const fs=require('node:fs');
const vm=require('node:vm');
test('short study uses saved edits and emits completion only once',()=>{
 const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const code=app.slice(app.indexOf('  let shortStudy = null;'),app.indexOf('  function recordStudyRating('));
 const original={id:'raw',front:'Old question?',back:'Original answer',section:'Bone'};
 const edited={id:'saved',sourceKey:'stable',front:'Edited question?',back:'Edited answer',section:'Bone',reviewStatus:'approved'};
 const events=[];
 const context={Set,window:{SyllabloomCardSet:cards,SyllabloomSourceStudy:{isUsableCard:()=>true},SyllabloomSourceExperience:flow,SyllabloomEvents:{track:(...args)=>events.push(args)}},state:{sources:[{id:'source',draftCards:[original]}],lectureCards:[edited],reviewHistory:[]},lectureCardKey:()=> 'stable',navigate(){},renderStudy(){},document:{querySelector:()=>({focus(){}})}};
 vm.createContext(context);vm.runInContext(code,context);context.startShortStudy('source');
 assert.equal(context.studyCards()[0].directCard.front,'Edited question?');
 vm.runInContext("shortStudy.rated.add('lecture-saved')",context);
 assert.equal(context.finishShortStudy(),true);assert.equal(context.finishShortStudy(),false);
 assert.equal(events.filter(event=>event[0]==='study_completed').length,1);
});
test('anonymous file selection survives sign-in but never crosses signed-in accounts',async()=>{
 const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const code=app.slice(app.indexOf('  function restoreImportQueue('),app.indexOf('  let sourceBatchRunning'));
 const context={importOwner:'',sourceQueueItems:[{id:'anonymous-file'}],importStore:{load:async()=>[{id:'saved-file'}]},persistImportQueue:async()=>{},renderSourceQueue(){},showToast(){}};
 vm.createContext(context);vm.runInContext(code,context);context.restoreImportQueue('alice');await context.importRestore;
 assert.deepEqual(Array.from(context.sourceQueueItems,item=>item.id),['saved-file','anonymous-file']);
 context.restoreImportQueue('bob');await context.importRestore;
 assert.deepEqual(Array.from(context.sourceQueueItems,item=>item.id),['saved-file']);
});
