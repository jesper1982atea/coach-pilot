import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewAnswer} from '../src/answer-review.js';
import {Autopilot,validateAnswer} from '../src/autopilot.js';
const context='KÄLLOR MED ID\n[K1] MDM kan distribuera appar till enheter.\n[K2] MDM kan konfigurera inställningar centralt.';
const state={prompt:'Vilka två fördelar med MDM nämns?',multi:true,requiredCount:2,options:[{id:1,text:'Distribuera appar'},{id:2,text:'Ladda batterier'},{id:3,text:'Konfigurera inställningar'}]};
async function run(replies){const calls=[];const answer=await reviewAnswer({state,context,question:state.prompt,native:async p=>{calls.push(p);return {ok:true,text:JSON.stringify(replies[calls.length-1])};},guard:async()=>{},report:()=>{},validate:validateAnswer});return {answer,calls};}
const yes=id=>({answers:[1],sourceIds:[id],uncertain:false}),no={answers:[2],sourceIds:[1],uncertain:false},final={answers:[1,3],sourceIds:[1,2],uncertain:false};
test('Every option gets its own assessment before an independent whole-answer review',async()=>{const {answer,calls}=await run([yes(1),no,yes(2),final]);assert.deepEqual(answer.ids,[1,3]);assert.equal(calls.length,4);assert.match(calls[1].question,/Ladda batterier/);assert.doesNotMatch(calls[1].question,/Konfigurera inställningar/);assert.deepEqual(answer.assessments.filter(a=>a.selected).map(a=>a.evidence),['MDM kan distribuera appar till enheter.','MDM kan konfigurera inställningar centralt.']);});
test('A valid citation for one option cannot replace missing evidence for another',async()=>{await assert.rejects(run([yes(1),no,{answers:[1],uncertain:false},final]),/citat/);});
test('General whole-answer approval cannot override uncertainty about an option',async()=>{await assert.rejects(run([yes(1),{answers:[2],sourceIds:[1],uncertain:true},yes(2),final]),/säkert/);});
test('Disagreement between individual and whole-answer assessments blocks the answer',async()=>{await assert.rejects(run([yes(1),no,yes(2),{...final,answers:[1,2]}]),/oense/);});
test('Production controller uses the review pipeline and honors a stop during review',async()=>{let n=0;const p=new Autopilot({api:{},report:()=>{},native:async()=>{n++;if(n===2)p.stop();return {ok:true,text:JSON.stringify(n===1?yes(1):no)};}});p.guard=async()=>{if(p.stopped)throw new Error('Stoppad');};await assert.rejects(p.reviewAnswer(state,context,state.prompt),/Stoppad/);assert.equal(n,2);});
