const test=require('node:test'),assert=require('node:assert/strict');
const flow=require('../flow-review');
const cards=[
 {id:'a',sourceId:'bone',reviewStatus:'approved',clozeText:'Bone grows through {{c1::ossification}}'},
 {id:'b',sourceId:'lecture',reviewStatus:'waiting',front:'Diagram region',back:'growth plate',duplicateSourceRefs:[{sourceId:'bone'}]},
 {id:'c',sourceId:'bone',reviewStatus:'skipped',front:'Another concept'}
];
test('material filtering includes shared cards, without duplicates',()=>{
 assert.deepEqual(flow.select(cards,'bone').map(c=>c.id),['a','b','c']);
});
test('status and search combine across cloze and image answers',()=>{
 assert.deepEqual(flow.select(cards,'bone','approved','ossification').map(c=>c.id),['a']);
 assert.deepEqual(flow.select(cards,'','check','growth').map(c=>c.id),['b']);
 assert.equal(flow.select(cards,'','approved','not present').length,0);
});
test('keep or skip selects an adjacent card before a status filter removes the old card',()=>{
 assert.equal(flow.nextId(cards,'a'),'b');
 assert.equal(flow.nextId(cards,'c'),'b');
 assert.equal(flow.nextId([cards[0]],'a'),null);
 assert.equal(cards[0].reviewStatus,'approved');
});
