import test from 'node:test';import assert from 'node:assert/strict';import {Autopilot} from '../src/autopilot.js';
test('First resource finishes before visiting another catalog; failed resource is not retried',async()=>{
 const base='https://salescoach.apple.com',root=base+'/home/collection/1',child=base+'/home/collection/2';const order=[],queue=[];
 const links=[{kind:'resource',url:base+'/home/content/view/10',title:'First'},{kind:'resource',url:base+'/home/content/view/11',title:'Second'},{kind:'catalog',url:child,title:'Child'}];
 const p=new Autopilot({api:{scripting:{executeScript:async()=>[{result:{links:p.expectedURL===root?links:[]}}]}},report:()=>{}});p.guard=async()=>{};p.navigate=async url=>{p.expectedURL=url;order.push(url)};p.inventory=async()=>({});
 p.processQueue=async items=>{assert.equal(items.length,1);order.push('finish '+items[0].title);items[0].status='Behöver hjälp';};
 await p.crawlCatalog(queue,[{url:root,depth:0}],async()=>{},true,true);
 assert.ok(order.indexOf('finish First')<order.indexOf('finish Second'));assert.ok(order.indexOf('finish Second')<order.indexOf(child));
 await p.crawlCatalog(queue,[{url:root,depth:0}],async()=>{},true,true);assert.equal(order.filter(x=>x==='finish First').length,1);
});
