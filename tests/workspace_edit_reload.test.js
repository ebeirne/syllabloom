const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const code=source.slice(source.indexOf('  function hasUnsyncedWorkspace('),source.indexOf('  async function initializeCloudWorkspace('));
const context={};vm.createContext(context);vm.runInContext(code,context);
test('a pending edit survives reload when the cloud revision is unchanged, even within five seconds',()=>{
 assert.equal(context.hasUnsyncedWorkspace(1,'14',14),true);
 assert.equal(context.hasUnsyncedWorkspace(0,'14',14),false);
 assert.equal(context.hasUnsyncedWorkspace(1,'14',15),false);
});
