import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Autopilot} from '../src/autopilot.js';
import {catalogPage,resumeDiscovery,DISCOVERY_ROOTS} from '../src/discovery.js';
const base='https://salescoach.apple.com';
function harness(linksAt,stored={}){
 const visits=[],ran=[],messages=[];
 const p=new Autopilot({api:{storage:{local:{set:async data=>Object.assign(stored,structuredClone(data))}}},report:m=>messages.push(m),wait:async()=>{}});
 p.guard=async()=>{};p.navigate=async url=>{p.expectedURL=url;visits.push(new URL(url).pathname);};p.inventory=async()=>({title:'Synthetic badge'});
 p.script=async()=>[{result:{links:linksAt(new URL(p.expectedURL).pathname),lockedItems:[]}}];
 p.processQueue=async items=>{for(const item of items){ran.push(item.key);item.status='Registrerad klar';}};
 return {p,visits,ran,messages,stored};
}
const resource=id=>({url:base+'/home/content/view/'+id,title:'Resource '+id,kind:'resource'});
const catalog=id=>({url:base+'/home/collection/'+id,title:'Collection '+id,kind:'catalog'});
test('Full discovery includes achievements independently of For you links',()=>{
 assert.deepEqual(resumeDiscovery(null).pages.map(e=>e.url),DISCOVERY_ROOTS);
});
test('More than 30 badge catalogs and 100 resources are reached without cycling',async()=>{
 const {p,visits,ran,stored}=harness(path=>path==='/home/achievements'?Array.from({length:45},(_,i)=>catalog(i)):[resource(Number(path.split('/').at(-1))*3+1),resource(Number(path.split('/').at(-1))*3+2),resource(Number(path.split('/').at(-1))*3+3),{url:base+'/home/achievements',kind:'catalog',title:'Back'}]);
 const pages=[{url:base+'/home/achievements',depth:0}],q=[];
 await p.crawlCatalog(q,pages,async()=>{},false,true,{seen:[]});
 assert.equal(visits.filter(v=>v==='/home/achievements').length,1);assert.equal(new Set(ran).size,135);assert.equal(q.length,135);assert.deepEqual(stored.discoveryCursor.pages,[]);
});
test('Interrupted catalog and remaining siblings survive a fresh runner',async()=>{
 const linksAt=path=>path==='/home/achievements'?[catalog(1),catalog(2)]:[resource(path.endsWith('/1')?1:2)];
 const first=harness(linksAt);first.p.processQueue=async()=>{throw new Error('Stopped');};
 await assert.rejects(first.p.crawlCatalog([],[{url:base+'/home/achievements',depth:0}],async()=>{},false,true,{seen:[]}),/Stopped/);
 assert.equal(first.stored.discoveryCursor.pages[0].url,catalog(1).url);
 assert.ok(!first.stored.discoveryCursor.seen.includes('/home/collection/1'));
 const cursor=resumeDiscovery(first.stored.discoveryCursor);const second=harness(path=>path==='/home/for-you'?[]:linksAt(path));
 await second.p.crawlCatalog([],cursor.pages,async()=>{},false,true,cursor);
 assert.deepEqual(second.ran,['/home/content/view/1','/home/content/view/2']);assert.ok(!second.visits.includes('/home/achievements'));
});
test('Finished searches restart fresh and invalid saved destinations are excluded',()=>{
 assert.deepEqual(resumeDiscovery({version:1,pages:[],seen:['/home/achievements']}).seen,[]);
 const r=resumeDiscovery({version:1,pages:[{url:'https://evil.example/home/collection/1',depth:0},{url:base+'/home/profile',depth:0},{url:catalog(1).url,depth:99}],seen:[]});assert.deepEqual(r.pages.map(e=>e.url),DISCOVERY_ROOTS);
});
test('Nested collections beyond the old depth three are searched',async()=>{
 const {p,ran}=harness(path=>{const n=Number(path.split('/').at(-1));return n===5?[resource(7)]:[catalog(n+1)];});
 await p.crawlCatalog([],[{url:catalog(0).url,depth:0}],async()=>{},false,true);
 assert.deepEqual(ran,['/home/content/view/7']);
});
test('Labelled badge cards are discovered once; earned, disabled and unrelated controls are ignored',()=>{
 const d=new JSDOM('<div aria-label="Example unearned"><span aria-label="Example unearned">Example</span></div><div aria-label="Done earned">Done</div><div aria-label="Locked unearned" aria-disabled="true"></div><a href="/home/achievements/unearned/2" aria-label="Link unearned">Link</a><div aria-label="Search"></div>',{url:base+'/home/achievements'});
 global.document=d.window.document;global.location=d.window.location;d.window.HTMLElement.prototype.getClientRects=()=>[{}];let clicks=0;document.querySelector('div').onclick=()=>clicks++;
 assert.equal(catalogPage().links.filter(l=>l.kind==='badgeButton').length,1);catalogPage({open:'Example unearned'});assert.equal(clicks,1);assert.equal(catalogPage().links.length,2);
});
test('Duplicate pending catalogs do not leave a phantom saved backlog',async()=>{
 const {p,stored}=harness(()=>[]);
 await p.crawlCatalog([],[{url:catalog(1).url,depth:0},{url:catalog(1).url,depth:0}],async()=>{},false,true,{seen:[]});
 assert.deepEqual(stored.discoveryCursor.pages,[]);
});
test('A badge card that fails to navigate is logged and later catalogs still run',async()=>{
 const {p,ran,stored}=harness(()=>[resource(9)]);p.api.tabs={get:async()=>({url:base+'/home/achievements'})};
 await p.crawlCatalog([],[{url:base+'/home/achievements',button:'Example unearned',depth:0},{url:catalog(1).url,depth:0}],async()=>{},false,true,{seen:[]});
 assert.deepEqual(ran,['/home/content/view/9']);assert.equal(Object.values(stored.coachLedger.records)[0].status,'Behöver hjälp');assert.deepEqual(stored.discoveryCursor.pages,[]);
});
