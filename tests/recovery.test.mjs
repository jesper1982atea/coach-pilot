import test from 'node:test';
import assert from 'node:assert/strict';
import {Autopilot,isTransientFrameError} from '../src/autopilot.js';

test('Transient Sales Coach frame removal is recognized and retried',async()=>{
 let calls=0;
 const api={scripting:{executeScript:async()=>{if(++calls<3)throw new Error('Frame with ID 0 was removed.');return [{result:true}];}},tabs:{get:async()=>({active:true,url:'https://salescoach.apple.com/home/for-you'})}};
 const messages=[];const p=new Autopilot({api,report:m=>messages.push(m),wait:async()=>{}});p.tabId=1;p.expectedURL='https://salescoach.apple.com/home/for-you';
 assert.equal(isTransientFrameError(new Error('Frame with ID 0 was removed.')),true);
 assert.deepEqual(await p.script({target:{tabId:1,frameIds:[0]}}),[{result:true}]);
 assert.equal(calls,3);assert.equal(messages.length,2);
});

test('Completion verification polls the parent until Sales Coach registers it',async()=>{
 let checks=0;const p=new Autopilot({api:{},report:()=>{},wait:async()=>{}});p.navigate=async()=>{};p.inventory=async()=>({earned:false,items:[{url:'https://salescoach.apple.com/home/content/view/42',completed:++checks===3}]});
 const verified=await p.verifyCompletion({title:'Moment',key:'/home/content/view/42',parents:['https://salescoach.apple.com/home/collection/1']},{attempts:3,delays:[0,0]});
 assert.equal(verified,true);assert.equal(checks,3);
});

test('A blocked video is marked as requiring one click while the queue continues',async()=>{
 const p=new Autopilot({api:{},report:()=>{},onPage:()=>{}});p.guard=async()=>{};p.navigate=async()=>{};p.inventory=async()=>({items:[]});p.frames=async()=>[{frameId:0,result:{lesson:'kursmaterial '.repeat(20),video:{ended:false}}}];p.resource=async()=>{const e=new Error('Tryck Play.');e.code='USER_GESTURE_REQUIRED';throw e;};
 const item={url:'https://salescoach.apple.com/home/content/view/7',key:'/home/content/view/7',title:'Video',parents:[]};await p.processQueue([item],async()=>{});
 assert.equal(item.status,'Behöver ett klick');assert.match(item.reason,/Play/);
});
