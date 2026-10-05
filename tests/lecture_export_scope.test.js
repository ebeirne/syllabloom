const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('lecture export includes shared cards but excludes other lectures and skipped cards', () => {
  const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const code = app.slice(app.indexOf('  function collectApprovedCards('), app.indexOf('  async function exportApprovedCards('));
  const card = (sourceId, back, extra = {}) => ({ sourceId, front:'Prompt', back, reviewStatus:'approved', ...extra });
  const context = { state:{ includeSampleMaterial:false, anki:{tags:''}, lectureCards:[
    card('a','own'), card('b','shared',{duplicateSourceRefs:[{sourceId:'a'}]}),
    card('b','other'), card('a','skipped',{reviewStatus:'skipped'}), card('a','invalid')
  ]}, isUsableLectureCard:c=>c.back!=='invalid' };
  vm.createContext(context); vm.runInContext(code,context);
  assert.equal(context.collectApprovedCards('a').map(c=>c.back).join(','),'own,shared');
  assert.equal(context.collectApprovedCards().length,3);
  assert.equal(context.collectApprovedCards('missing').length,0);
});
