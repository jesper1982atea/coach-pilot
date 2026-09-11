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

test('Interactive reading pauses long enough for Sales Coach to register opened sections',async()=>{
 const waits=[];let opened=false;const p=new Autopilot({api:{},report:()=>{},wait:async()=>{}});p.frames=async()=>[{frameId:0,result:opened?{lesson:'text',sections:[],next:[],options:[],complete:true}:{lesson:'text',sections:['Avsnitt'],next:[],options:[]}}];p.act=async()=>{opened=true;};p.sleep=async ms=>waits.push(ms);
 await p.resource();assert.ok(waits.includes(3000));
});
test('Resource activates safe interactive content until an XP signal appears',async()=>{let clicked=false;const reports=[];const p=new Autopilot({api:{},report:m=>reports.push(m),wait:async()=>{}});p.frames=async()=>[{frameId:2,result:clicked?{lesson:'',sections:[],interactions:[],next:[],options:[],xp:10,success:false,complete:true}:{lesson:'',sections:[],interactions:[{id:1,text:'Visa exempel'}],next:[],options:[],xp:0,success:false,complete:false}}];p.act=async(_frame,action)=>{assert.equal(action,'interact');clicked=true;};p.sleep=async()=>{};assert.equal(await p.resource(),'passed');assert.equal(clicked,true);assert.ok(reports.some(m=>/erfarenhetspoäng/.test(m)));});

test('Run this page includes course requirements from a specialist collection',async()=>{
 const collection='https://salescoach.apple.com/home/collection/245263',course='https://salescoach.apple.com/home/course/35019';let received=[];const p=new Autopilot({api:{tabs:{query:async()=>[{id:1,url:collection}]}},report:()=>{},onPage:()=>{}});p.inventory=async()=>({url:collection,earned:false,items:[{title:'iPhone—utöka möjligheterna',url:course,completed:false,locked:false}]});p.processQueue=async queue=>{received=queue;queue[0].status='Åtkomst saknas';queue[0].reason='Kräver eventinbjudan.';};p.navigate=async()=>{};
 await assert.rejects(p.start(),/eventinbjudan/);assert.equal(received[0].key,'/home/course/35019');
});
