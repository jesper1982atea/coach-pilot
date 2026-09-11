import {trackVideo} from './run-progress.js';
import {inputRequest} from './user-input.js';
import {matchKnownTest} from './known-tests.js';
import {KNOWN_TESTS} from './known-tests-data.js';
import {accessDialog,followVisibleLink} from './navigation.js';
import {catalogPage,classifyCourse,addCandidates,isVideoResource,prioritizeResources,ACADEMY_URL,academyChild} from './discovery.js';
import {extractPage,mergeFrames,relevantContext,isCoachURL,indexContext} from './extract.js';

// Self-contained content script. AI can choose answer numbers, never selectors or code.
export function courseFrame(command = {}) {
 const clean=s=>(s||'').replace(/\s+/g,' ').trim();
 const visible=e=>!!e&&!e.closest('[hidden],[aria-hidden="true"]')&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const label=e=>clean(e.getAttribute('aria-label')||e.innerText||e.textContent||e.value);
 const root=document.querySelector('main')||document.body;
 const selector='input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"]';
 const choices=[...root.querySelectorAll(selector)].filter(e=>visible(e)||[...(e.labels||[])].some(visible));
 const options=choices.map((e,i)=>({id:i+1,text:clean(e.getAttribute('aria-label')||[...(e.labels||[])].map(label).join(' ')||e.textContent),selected:e.checked===true||e.getAttribute('aria-checked')==='true',disabled:e.matches(':disabled')||!!e.closest('[aria-disabled="true"]')}));
 // Find independent question containers, including generic containers with “Välj N”.
 const prefixText=(container,first)=>{
  try{const range=document.createRange();range.setStart(container,0);const label=first.closest('label');range.setEndBefore(label&&container.contains(label)?label:first);return clean(range.cloneContents().textContent);}catch{return '';}
 };
 const questionRoot=e=>{
  const semantic=e.closest('fieldset,[role="radiogroup"],[role="group"]');
  if(semantic&&(semantic.querySelector('legend')||semantic.getAttribute('aria-label')))return semantic;
  let parent=e.parentElement;
  while(parent&&parent!==root){
   const members=[...parent.querySelectorAll(selector)].filter(c=>choices.includes(c));
   if(members.length>=2&&prefixText(parent,members[0]).length>8)return parent;
   parent=parent.parentElement;
  }
  return semantic||root;
 };
 const containers=[...new Set(choices.map(questionRoot))];
 const questions=containers.map(container=>{
  const members=choices.filter(e=>questionRoot(e)===container);
  const opts=members.map(e=>options[choices.indexOf(e)]);
  let prompt=clean(container.querySelector('legend')?.textContent||container.getAttribute('aria-label'));
  if(!prompt)prompt=prefixText(container,members[0]);
  if(!prompt)prompt=[...container.querySelectorAll('h1,h2,h3,h4,p,[role="heading"]')].filter(visible).map(label).join('\n');
  if(!prompt)prompt=label(container);
  for(const o of opts)if(o.text)prompt=prompt.replaceAll(o.text,'');
  prompt=clean(prompt).replace(/Du har valt \d+ av (\d+)\.?/gi,'Välj $1.').replace(/You have selected \d+ (?:of|out of) (\d+)\.?/gi,'Select $1.').slice(0,3500);
  const multi=members.some(e=>e.type==='checkbox'||e.getAttribute('role')==='checkbox');
  const count=prompt.match(/(?:välj|select|choose)\s+(ett|en|one|\d+)/i);
  const requiredCount=count ? (/^\d+$/.test(count[1])?Number(count[1]):1) : (multi?null:1);
  return {prompt,options:opts,multi,requiredCount};
 });
 const prompt=questions[0]?.prompt||'',multi=questions[0]?.multi||false;
 const groups=questions.length;
 const fingerprint=JSON.stringify(questions.map(q=>[q.prompt,q.options.map(o=>o.text),q.multi,q.requiredCount]));
 const buttons=[...root.querySelectorAll('button,[role="button"],input[type="submit"]')].filter(visible);
 const enabled=e=>!e.matches(':disabled')&&!e.closest('[aria-disabled="true"]');
 const submit=buttons.filter(e=>/^(skicka(?: in)?(?: svar(?:et|en)?)?|svara|kontrollera(?: svar(?:et|en)?)?|submit(?: answer)?|check(?: answer)?)$/i.test(label(e)));
 const next=buttons.filter(e=>/^(nästa(?: fråga|avsnitt|sida)?|fortsätt|gå vidare|next(?: question|section)?|continue|starta (?:kunskapskontroll|quiz|prov)|start (?:quiz|test)|börja)$/i.test(label(e)));
 const sections=buttons.filter(e=>e.getAttribute('aria-expanded')==='false'&&e.closest('h2,h3,h4,[role="heading"]')&&!/skicka|submit|prov|quiz|test/i.test(label(e)));
 const lesson=[...root.querySelectorAll('h1,h2,h3,h4,p,li,td,th,blockquote,a')].filter(e=>visible(e)&&(!choices.length||!containers.some(c=>c.contains(e)))).map(label).filter(Boolean).join('\n').slice(0,40000);
 const text=[...root.querySelectorAll('h1,h2,h3,h4,p,li,[role="alert"]')].filter(visible).map(label).filter(Boolean).join('\n').slice(0,40000);
 const feedback=[...root.querySelectorAll('[role="alert"],.feedback,[class*="feedback"],[class*="Feedback"]')].filter(visible).map(label).join(' ');
 const failed=/\b(incorrect|wrong answer|fel svar|inte rätt|inte korrekt)\b/i.test(feedback);
 const passed=/\b(correct|rätt svar|korrekt svar|bra jobbat)\b/i.test(feedback)&&!failed;
 const resultMatch=clean(root.innerText||root.textContent).match(/(\d{1,3})\s*%?\s*(?:Du fick|Du har|Grattis|Bra jobbat|You)/i);
 const score=options.length&&resultMatch&&(options.every(o=>o.disabled)||!submit.some(enabled))?Number(resultMatch[1]):null;
 const complete=score===100||/^(grattis[!.]?|du (?:har )?slutfört.*|du är klar[!.]?|congratulations[!.]?|course complete[!.]?)$/im.test(text);
 const video=[...root.querySelectorAll('video')].find(visible);
 const freeText=[...root.querySelectorAll('textarea,[contenteditable="true"],input[type="text"]')].some(visible);
 const state={url:location.href,text,lesson,prompt,options,multi,groups,questions,requiredCount:questions[0]?.requiredCount,fingerprint,submit:submit.length===1&&enabled(submit[0]),next:next.filter(enabled).map(label),sections:sections.filter(enabled).map(label),failed,passed,complete,score,freeText,video:video?{ended:video.ended,paused:video.paused,time:video.currentTime,duration:Number.isFinite(video.duration)?video.duration:null}:null};
 if(!command.action)return state;
 if(command.url!==location.href||command.fingerprint!==fingerprint)throw new Error('Sidan ändrades före åtgärden.');
 const click=e=>{if(!e||!enabled(e))throw new Error('Kontrollen är inte tillgänglig.');e.scrollIntoView({block:'center'});e.click();return {acted:true};};
 if(command.action==='select'){
  const e=choices[command.id-1];if(!e||options[command.id-1].text!==command.text)throw new Error('Svarsalternativet ändrades.');
  if(options[command.id-1].selected===command.selected)return {acted:false};return click(e);
 }
 if(command.action==='submit'){
  if(!state.submit||state.failed||state.freeText||questions.some(q=>{const n=q.options.filter(o=>o.selected).length;return !n||(q.requiredCount!=null&&n!==q.requiredCount);}))throw new Error('Inskickning stoppad: otydlig uppgift eller kontroll.');
  if(JSON.stringify(options.filter(o=>o.selected).map(o=>o.id))!==JSON.stringify(command.ids))throw new Error('De valda svaren stämmer inte med förslaget.');
  return click(submit[0]);
 }
 if(command.action==='next'){const candidates=next.filter(e=>enabled(e)&&label(e)===command.text);if(candidates.length!==1)throw new Error('Nästa steg är otydligt.');return click(candidates[0]);}
 if(command.action==='expand'){const candidates=sections.filter(e=>enabled(e)&&label(e)===command.text);if(candidates.length!==1)throw new Error('Läsavsnittet är otydligt.');return click(candidates[0]);}
 if(command.action==='pauseVideo'){if(video)video.pause();return {acted:!!video};}
 if(command.action==='play'){if(!video)throw new Error('Videon försvann.');video.playbackRate=1;return video.play().then(()=>({acted:true}));}
 throw new Error('Okänd åtgärd.');
}

export function validateAnswer(raw,state,context){
 let result;try{result=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('AI gav inget giltigt strukturerat svar. Inget skickades in.');}
 if(result.uncertain!==false||!Array.isArray(result.answers)||!result.answers.length)throw new Error('AI kunde inte avgöra svaret säkert.');
 const ids=result.answers;
 if(ids.some(n=>!Number.isInteger(n)||!state.options.some(o=>o.id===n&&!o.disabled))||new Set(ids).size!==ids.length||(!state.multi&&ids.length!==1)||(state.requiredCount!=null&&ids.length!==state.requiredCount))throw new Error('AI-svaret passar inte frågans alternativ.');
 if(Array.isArray(result.sourceIds)&&context.startsWith('KÄLLOR MED ID\n')){
  const passages=new Map(context.split('\n').slice(1).map(line=>{const match=line.match(/^\[K(\d+)\] (.+)$/);return match?[Number(match[1]),match[2]]:[null,null];}));
  if(!result.sourceIds.length||result.sourceIds.some(id=>!Number.isInteger(id)||!passages.has(id))||new Set(result.sourceIds).size!==result.sourceIds.length)throw new Error('AI-svaret anger en källreferens som inte finns.');
  return {ids:[...ids].sort((a,b)=>a-b),evidence:result.sourceIds.map(id=>passages.get(id)).join('\n'),reason:String(result.reason||'').slice(0,1000)};
 }
 const normalize=s=>s.replace(/\s+/g,' ').trim().toLocaleLowerCase('sv');
 if(typeof result.evidence!=='string'||result.evidence.trim().length<20||!normalize(context).includes(normalize(result.evidence)))throw new Error('AI-svaret saknar ett verifierbart citat ur kursunderlaget.');
 return {ids:[...ids].sort((a,b)=>a-b),evidence:result.evidence,reason:String(result.reason||'').slice(0,1000)};
}

export class Autopilot {
 constructor({api,native,report,onPage,onQueue,onStatus=()=>{},wait=ms=>new Promise(r=>setTimeout(r,ms))}){Object.assign(this,{api,native,report,onPage,onQueue,onStatus,wait});this.stopped=false;this.submitted=new Set();this.context='';}
 stop(){this.stopped=true;}
 async checkAccess(){
  const t=await this.api.tabs.get(this.tabId);if(this.stopped||!t.active||!isCoachURL(t.url))return;
  const r=await this.api.scripting.executeScript({target:{tabId:this.tabId,frameIds:[0]},func:accessDialog,args:[true]});
  if(r[0]?.result?.denied){this.expectedURL=t.url;const e=new Error(r[0].result.message+' Momentet läggs åt sidan.');e.code='ACCESS_DENIED';throw e;}
 }
 async guard(){if(this.stopped)throw new Error('Stoppad av dig.');const t=await this.api.tabs.get(this.tabId);if(!t.active||!isCoachURL(t.url))throw new Error('Pausad eftersom du bytte flik eller sida.');if(new URL(t.url).pathname!==new URL(this.expectedURL).pathname){await this.checkAccess();throw new Error('Pausad eftersom du bytte flik eller sida.');}this.expectedURL=t.url;}
 async sleep(ms){for(let n=0;n<ms;n+=250){if(this.stopped)throw new Error('Stoppad av dig.');await this.wait(Math.min(250,ms-n));}}
 async frames(){await this.guard();await this.checkAccess();const frames=(await this.api.scripting.executeScript({target:{tabId:this.tabId,allFrames:true},func:courseFrame})).filter(f=>f.result);this.onStatus({heartbeat:Date.now()});return frames;}
 async act(frame,action,extra={}){await this.guard();await this.api.scripting.executeScript({target:frame.documentId?{tabId:this.tabId,documentIds:[frame.documentId]}:{tabId:this.tabId,frameIds:[frame.frameId]},func:courseFrame,args:[{action,url:frame.result.url,fingerprint:frame.result.fingerprint,...extra}]});await this.sleep(800);}
 async inventory(){await this.guard();const r=await this.api.scripting.executeScript({target:{tabId:this.tabId,allFrames:true},func:extractPage});const p=mergeFrames(r);this.onPage(p);return p;}
 async navigate(url){
  await this.guard();if(!isCoachURL(url))throw new Error('Resursen ligger utanför Sales Coach.');await this.checkAccess();
  const previous=this.expectedURL,targetPath=new URL(url).pathname;
  if(new URL(previous).pathname===targetPath)return;
  let result=await this.api.scripting.executeScript({target:{tabId:this.tabId,frameIds:[0]},func:followVisibleLink,args:[url]});
  if(!result[0]?.result?.clicked&&targetPath==='/home/program/7047/368135'){
   if(new URL(previous).pathname!=='/home/for-you')await this.navigate('https://salescoach.apple.com/home/for-you');
   result=await this.api.scripting.executeScript({target:{tabId:this.tabId,frameIds:[0]},func:followVisibleLink,args:[url]});
   if(!result[0]?.result?.clicked){const e=new Error('Academy-kortet är inte tillgängligt under För dig. Ett aktivt programval kan behövas.');e.code='ACCESS_DENIED';throw e;}
  }else if(!result[0]?.result?.clicked){await this.api.tabs.update(this.tabId,{url});}
  for(let i=0;i<24;i++){
   await this.sleep(500);if(this.stopped)throw new Error('Stoppad av dig.');const t=await this.api.tabs.get(this.tabId);if(!t.active||!isCoachURL(t.url))throw new Error('Pausad eftersom du bytte flik eller sida.');await this.checkAccess();
   if(new URL(t.url).pathname===targetPath){this.expectedURL=t.url;const r=await this.api.scripting.executeScript({target:{tabId:this.tabId,allFrames:true},func:extractPage});if(r.some(f=>(f.result?.text||'').length>100)){await this.sleep(700);await this.checkAccess();await this.guard();return;}}
  }
  const t=await this.api.tabs.get(this.tabId);if(new URL(t.url).pathname!==targetPath)throw new Error('Navigationen nådde inte den valda sidan.');this.expectedURL=t.url;
 }
 async solve(frame){
  const s=frame.result;if(s.groups>1)return this.solveTest(frame);if(s.freeText||!s.prompt||s.options.length<2||s.options.length>12||s.options.some(o=>!o.text))throw new Error('Den här frågetypen behöver granskas manuellt.');
  const key=this.expectedURL+'|'+s.fingerprint;if(this.submitted.has(key))throw new Error('Samma fråga visas efter inskickning. Kontrollera återkopplingen.');
  const context=relevantContext(this.context,s.prompt,5500);if(context.trim().length<60)throw new Error('Kursunderlag saknas för att besvara frågan. Läs materialet först.');
  this.report('Läser frågan och ber Apple Intelligence om svar…');
  const question=s.prompt+'\n'+s.options.map(o=>o.id+'. '+o.text).join('\n')+'\n'+(s.multi?'Flera alternativ kan vara rätt.':'Exakt ett alternativ ska väljas.');
  if(question.length>2000)throw new Error('Frågan är för lång för den lokala bryggan.');
  const reply=await this.native({action:'choose',context,question});await this.guard();if(!reply.ok)throw new Error(reply.error||reply.message||'AI-anropet misslyckades.');
  const answer=validateAnswer(reply.text,s,context);this.report('AI föreslår '+answer.ids.join(', ')+': '+answer.reason);
  let fresh=(await this.frames()).find(f=>f.frameId===frame.frameId);if(!fresh||fresh.result.fingerprint!==s.fingerprint)throw new Error('Frågan ändrades medan AI arbetade.');
  for(const option of s.options){const selected=answer.ids.includes(option.id);if(fresh.result.options.find(o=>o.id===option.id)?.selected!==selected){await this.act(fresh,'select',{id:option.id,text:option.text,selected});fresh=(await this.frames()).find(f=>f.frameId===frame.frameId);if(!fresh||fresh.result.fingerprint!==s.fingerprint)throw new Error('Frågan ändrades när svar valdes.');}}
  this.submitted.add(key);await this.act(fresh,'submit',{ids:answer.ids});this.report('Svar inskickat. Kontrollerar återkopplingen.');
 }
 async prepareTest(){
  const testURL=this.expectedURL;
  let parent=(this.testParents||[]).find(p=>/^\/home\/collection\//.test(new URL(p,'https://salescoach.apple.com').pathname))||new URL(testURL).searchParams.getAll('backTo').find(p=>/^\/home\/collection\/[^/?]+$/.test(p));
  if(!parent){
   this.report('Hittar testets samling via Academy eftersom adressen saknar kursväg…');
   const found=[];await this.crawlCatalog(found,[{url:ACADEMY_URL,depth:0}],async()=>{},true);
   parent=found.find(i=>i.key===new URL(testURL).pathname)?.parents.find(p=>/^\/home\/collection\//.test(new URL(p).pathname));
  }
  if(!parent){await this.navigate(testURL);throw new Error('Testets samling hittades inte. Öppna testet från sin samling och prova igen.');}
  this.testParents=[new URL(parent,'https://salescoach.apple.com').href];this.context='';let sources=0;
  this.report('Läser tillgängligt kursunderlag i testets samling…');
  try{
   await this.navigate(new URL(parent,'https://salescoach.apple.com').href);
   const page=await this.inventory();
   for(const item of page.items.filter(i=>!i.locked&&new URL(i.url).pathname!==new URL(testURL).pathname).slice(0,30)){
    this.report('Läser kurskälla: '+item.title);await this.navigate(item.url);
    const expanded=new Set();
    for(let step=0;step<30;step++){
     const frames=await this.frames();
     if(frames.some(f=>f.result.options.length||f.result.freeText))break;
     for(const f of frames)if(!f.result.video){if(f.result.lesson?.length>60)sources++;this.context=(this.context+'\n'+f.result.lesson).split('\n').filter((v,i,a)=>v&&a.indexOf(v)===i).join('\n').slice(-100000);}
     const frame=frames.find(f=>!f.result.video&&f.result.sections.some(t=>!expanded.has(f.frameId+'|'+t)));
     if(!frame)break;
     const title=frame.result.sections.find(t=>!expanded.has(frame.frameId+'|'+t));expanded.add(frame.frameId+'|'+title);await this.act(frame,'expand',{text:title});
    }
   }
  }finally{if(!this.stopped){await this.guard();await this.navigate(testURL);}}
  this.report('Läst kursunderlag: '+this.context.length+' tecken från '+sources+' läsavsnitt.');
  if(this.context.trim().length<500)throw new Error('För lite kursunderlag kunde läsas i testets samling. Inga svar skickas.');
  for(let attempt=0;attempt<40;attempt++){const ready=await this.frames();if(ready.some(f=>f.result.groups>0))return;await this.sleep(500);}
  throw new Error('Testfrågorna laddades inte efter återgången från kursmaterialet.');
 }
 async solveTest(frame){
  const s=frame.result,questions=s.questions;
  if(s.freeText||!questions?.length||questions.length>20||questions.some(q=>!q.prompt||q.options.length<2||q.options.length>12||q.options.some(o=>!o.text)))throw new Error('Testets frågor behöver granskas manuellt.');
  const key=this.expectedURL+'|'+s.fingerprint;
  if(this.submitted.has(key))throw new Error('Samma fråga visas efter inskickning. Kontrollera återkopplingen.');
  const answers=[];const known=await matchKnownTest(s,this.expectedURL);
  if(known){answers.push({ids:known.ids});this.report('Använder kursgranskade svar: alla frågor och alternativ matchar svarstabellen.');}
  else for(const [index,q] of questions.entries()){
   const local={...q,options:q.options.map((o,i)=>({...o,id:i+1}))};
   const context=indexContext(relevantContext(this.context,q.prompt+' '+q.options.map(o=>o.text).join(' '),5000));
   if(context.trim().length<60)throw new Error('Kursunderlag saknas för kunskapstestet. Läs kursmaterialet först.');
   this.report('Kunskapstest: analyserar fråga '+(index+1)+' av '+questions.length+'…');
   const question=q.prompt+'\n'+local.options.map(o=>o.id+'. '+o.text).join('\n')+'\n'+(q.requiredCount?'Välj exakt '+q.requiredCount+' alternativ.':q.multi?'Flera alternativ kan vara rätt.':'Välj ett alternativ.');
   if(question.length>1900)throw new Error('Frågan är för lång för den lokala bryggan.');
   let answer,lastError;
   for(let attempt=0;attempt<2;attempt++){
    const reply=await this.native({action:'choose',context,optionCount:local.options.length,requiredCount:q.requiredCount,question:question+(attempt?'\nAnvänd endast de listade numren. Kopiera citatet exakt ur underlaget.':'')});await this.guard();
    if(!reply.ok)throw new Error(reply.error||'AI-anropet misslyckades.');
    try{answer=validateAnswer(reply.text,local,context);break;}catch(e){lastError=e;this.report('Fråga '+(index+1)+': '+e.message+' [antal='+q.requiredCount+', alternativ='+local.options.length+', AI='+String(reply.text).slice(0,500)+']'+(attempt?'':' Försöker en gång till med förtydligat format.'));}
   }
   if(!answer)throw lastError;
   answers.push({...answer,ids:answer.ids.map(id=>q.options[id-1].id)});
   this.report('Fråga '+(index+1)+': väljer '+answer.ids.map(id=>local.options[id-1].text).join(' · '));
  }
  // No page mutations until every question has a supported answer.
  const ids=answers.flatMap(a=>a.ids).sort((a,b)=>a-b);
  const refresh=async()=>{
   for(let attempt=0;attempt<3;attempt++){
    const available=await this.frames(),matches=available.filter(f=>f.result.fingerprint===s.fingerprint);
    if(matches.length===1)return matches[0];
    if(attempt===2){const current=available.find(f=>f.result.options?.length);this.report('Testkontroll: '+JSON.stringify({before:s.questions.map(q=>q.prompt),after:current?.result.questions?.map(q=>q.prompt)}));throw new Error('Testet ändrades medan AI arbetade.');}
    await this.sleep(500);
   }
  };
  let fresh=await refresh();
  for(const option of s.options){const selected=ids.includes(option.id);if(fresh.result.options.find(o=>o.id===option.id)?.selected!==selected){await this.act(fresh,'select',{id:option.id,text:option.text,selected});fresh=await refresh();}}
  await this.act(fresh,'submit',{ids});this.submitted.add(key);
  this.report('Hela kunskapstestet inskickat. Kontrollerar återkopplingen.');
 }
 async resource({deferVideos=false}={}){
  const started=Date.now();let idle=0,steps=0,prepared=false,submissionWait=0,videoTrack=null,playAttempts=0;const expanded=new Set(),navigation=new Map();
  while(Date.now()-started<30*60*1000&&steps++<1200){
   const frames=await this.frames();const all=frames.map(f=>f.result);
   if(deferVideos&&all.some(s=>s.video)){for(const f of frames)if(f.result.video&&!f.result.video.ended)await this.act(f,'pauseVideo');return 'deferred-video';}
   if(all.some(s=>s.score===100)){this.report('Sales Coach visar 100 procent på kunskapstestet.');return 'passed';}
   if(all.some(s=>s.score!=null))throw new Error('Sales Coach visar '+all.find(s=>s.score!=null).score+' procent. Testet behöver granskas.');
   if(all.some(s=>s.failed))throw new Error('Sales Coach visar fel svar. Autopiloten har pausats.');
   const request=inputRequest(frames);if(request){const e=new Error(request.reason);e.code='USER_INPUT_REQUIRED';e.request=request;throw e;}
   const question=frames.find(f=>f.result.options.length>0&&!f.result.passed);
   // Accumulate lesson paragraphs, excluding frames displaying answer choices.
   for(const f of frames)this.context=(this.context+'\n'+f.result.lesson).split('\n').filter((s,i,a)=>s&&a.indexOf(s)===i).join('\n').slice(-100000);
   if(question){if(this.submitted.has(this.expectedURL+'|'+question.result.fingerprint)||question.result.options.every(o=>o.disabled)){if(++submissionWait>180)throw new Error('Sales Coach har inte lämnat testresultat efter inskickningen.');this.onStatus({phase:'Väntar på testresultat från Sales Coach',heartbeat:Date.now(),media:null});await this.sleep(500);continue;}if(question.result.groups>1&&!prepared){const known=await matchKnownTest(question.result,this.expectedURL);if(known)this.testParents=[known.parent];else await this.prepareTest();prepared=true;idle=0;continue;}await this.solve(question);idle=0;continue;}
   if(all.some(s=>s.freeText))throw new Error('En fritextfråga behöver ditt svar.');
   const video=frames.find(f=>f.result.video&&!f.result.video.ended);
   if(video){
    const v=video.result.video;videoTrack=trackVideo(videoTrack,v,Date.now());
    this.onStatus({phase:v.paused?'Väntar på videospelaren':'Spelar video',media:{time:v.time,duration:v.duration},heartbeat:Date.now()});
    if(videoTrack.stalled)throw new Error('Videon har inte gått framåt på 30 sekunder. Starta den med Spela upp video i Sales Coach och kör momentet igen.');
    if(v.paused&&playAttempts<2){playAttempts++;this.report('Försöker starta videon ('+playAttempts+'/2).');await this.act(video,'play');}
    await this.sleep(2000);idle=0;continue;
   }
   const section=frames.find(f=>f.result.sections.some(t=>!expanded.has(f.frameId+'|'+t)));
   if(section){const title=section.result.sections.find(t=>!expanded.has(section.frameId+'|'+t));expanded.add(section.frameId+'|'+title);this.report('Öppnar läsavsnitt: '+title);await this.act(section,'expand',{text:title});idle=0;continue;}
   const next=frames.find(f=>f.result.next.length===1);
   if(next){const key=next.frameId+'|'+next.result.text+'|'+next.result.next[0];const count=(navigation.get(key)||0)+1;navigation.set(key,count);if(count>2)throw new Error('Nästa-knappen ändrar inte sidan. Körningen är pausad.');this.report('Går vidare: '+next.result.next[0]);await this.act(next,'next',{text:next.result.next[0]});idle=0;continue;}
   if(all.some(s=>s.complete))return;
   if(++idle>=(this.expectTest&&!prepared?30:4)){if(this.expectTest&&!prepared)throw new Error('Testets frågor laddades inte. Inget resultat registrerades.');if(all.some(s=>s.options.length))throw new Error('Frågan saknar en tydlig nästa-knapp.');return;}
   await this.sleep(1500);
  }
  throw new Error('Tids- eller steggränsen nåddes. Körningen är pausad.');
 }
 async crawlCatalog(queue,pages,publish,academy=false,immediate=false){
  const seen=new Set();
  if(academy)this.academyAudit={rootComplete:false,blocked:[]};
  while(pages.length&&seen.size<(academy?40:30)&&queue.length<100){
   await this.guard();const entry=pages.shift(),key=new URL(entry.url).pathname+(entry.button?'|'+entry.button:'');if(seen.has(key))continue;seen.add(key);
   try{
   await this.navigate(entry.url);
   if(entry.button){await this.guard();await this.api.scripting.executeScript({target:{tabId:this.tabId,frameIds:[0]},func:catalogPage,args:[{open:entry.button}]});await this.sleep(1500);const destination=await this.api.tabs.get(this.tabId);if(!isCoachURL(destination.url)||!/^\/home\/achievements\/unearned\/\d+$/.test(new URL(destination.url).pathname))throw new Error('Prestationsknappen öppnade inte en stödd sida.');this.expectedURL=destination.url;await this.navigate(destination.url);}
   const inventory=await this.inventory();
   if(academy&&new URL(entry.url).pathname===new URL(ACADEMY_URL).pathname){const p=inventory?.progress;this.academyAudit.rootComplete=!!p&&p.total>0&&p.completed===p.total;}
   const found=await this.api.scripting.executeScript({target:{tabId:this.tabId,allFrames:true},func:catalogPage});
   if(academy)this.academyAudit.blocked.push(...found.flatMap(f=>f.result?.lockedItems||[]));
   const links=found.flatMap(f=>f.result?.links||[]);const parent=/\/home\/(?:achievements\/unearned\/\d+|collection\/[^/]+|program\/\d+\/\d+)$/.test(new URL(this.expectedURL).pathname)?this.expectedURL:null;
   if(academy){
    if(inventory?.progress&&inventory.progress.completed<inventory.progress.total)this.academyAudit.blocked.push((inventory.title||'Academy')+': '+inventory.progress.completed+'/'+inventory.progress.total+' slutförda.');
    for(const link of links.filter(l=>!l.related&&!/^back$|^tillbaka$/i.test(l.title||''))){
     if(link.locked&&!link.completed)this.academyAudit.blocked.push(link.title);
     if(link.completed){const item=queue.find(i=>i.key===new URL(link.url).pathname);if(item){item.status='Registrerad klar';item.reason='';}}
     if(entry.depth>=6&&!link.completed&&academyChild(link)&&!seen.has(new URL(link.url).pathname))this.academyAudit.blocked.push('Djupgräns: '+link.title);
    }
   }
   const candidates=academy?links.filter(l=>!l.related):links;
   if(immediate){
    const catalogURL=this.expectedURL;
    for(const link of candidates){
     addCandidates(queue,[link],parent,academy);
     const item=queue.find(i=>i.key===new URL(link.url).pathname&&i.status==='Hittad'&&i.academy===academy);
     if(item){await publish();this.report('Hittade ett ogjort moment: '+item.title+'. Bearbetar det innan sökningen fortsätter.');await this.processQueue([item],publish);await this.navigate(catalogURL);}
    }
   }else addCandidates(queue,candidates,parent,academy);
   await publish();
   if(entry.depth<(academy?6:3))for(const link of links)if(link.kind!=='resource'&&!link.locked&&(academy?academyChild(link):!link.completed&&!new URL(link.url).pathname.startsWith('/home/program/7047/'))&&!seen.has(new URL(link.url).pathname+(link.button?'|'+link.button:'')))pages.push({url:link.url,button:link.button,depth:entry.depth+1});
   }catch(e){if(e.code!=='ACCESS_DENIED')throw e;if(academy)this.academyAudit.blocked.push('Åtkomst saknas: '+entry.url.split('?')[0]);this.report('Åtkomst saknas för '+entry.url.split('?')[0]+'. Fortsätter med tillgängliga moment.');}
  }
  if(academy&&(pages.length||queue.length>=100))this.academyAudit.blocked.push('Inventeringens gräns nåddes.');
 }
 async discoverAndRun(){
  const [tab]=await this.api.tabs.query({active:true,currentWindow:true});if(!tab?.id||!isCoachURL(tab.url))throw new Error('Öppna Sales Coach och logga in först.');
  this.tabId=tab.id;this.expectedURL=tab.url;const queue=[];
  const publish=async()=>{this.onQueue?.(prioritizeResources(queue).map(i=>({...i})));await this.api.storage.local.set({autopilotQueue:queue.map(({title,key,status,reason,kind,academy,inputQuestion})=>({title,key,status,reason,kind,academy,inputQuestion})),queueUpdatedAt:Date.now()});};
  this.report('Academy först: söker nästa ogjorda moment och börjar direkt.');
  for(let pass=0;pass<20;pass++){
   const completedBefore=queue.filter(i=>i.academy&&i.status==='Registrerad klar').length;
   await this.crawlCatalog(queue,[{url:ACADEMY_URL,depth:0}],publish,true,true);
   const pending=queue.filter(i=>i.academy&&i.status==='Hittad');
   if(!pending.length){if(queue.filter(i=>i.academy&&i.status==='Registrerad klar').length>completedBefore)continue;break;}
   this.report('Prioriterar '+pending.length+' Academy-moment. Videor körs sist inom Academy.');
   await this.processQueue(pending,publish);
   if(!pending.some(i=>i.status==='Registrerad klar'))break;
   this.report('Söker efter Academy-moment som nu kan ha låsts upp.');
  }
  const unresolved=queue.filter(i=>i.academy&&i.status!=='Registrerad klar');
  const blockers=this.academyAudit?.blocked||[];
  if(unresolved.length||!this.academyAudit?.rootComplete||blockers.length){
   const reason=[unresolved.length?unresolved.length+' Academy-moment återstår.':'',...new Set(blockers),!this.academyAudit?.rootComplete?'Sales Coach har inte bekräftat alla krav på Academys programsida.':''].filter(Boolean).join(' ');
   await this.api.storage.local.set({academyNotice:'Academy väntar: '+reason});
   await publish();this.report('Academy väntar: '+reason+' Fortsätter med övrigt material.');
  }else{await this.api.storage.local.set({academyNotice:''});this.report('Alla Academy-krav är verifierade som klara.');}
  this.report('Söker nu efter övriga resurser under För dig.');
  await this.crawlCatalog(queue,[{url:'https://salescoach.apple.com/home/for-you',depth:0}],publish,false,true);
  const other=queue.filter(i=>!i.academy&&i.status==='Hittad');
  await this.processQueue(other,publish);
  this.report('Kön genomgången: '+queue.filter(i=>i.status==='Registrerad klar').length+' registrerade klara, '+queue.filter(i=>i.status!=='Registrerad klar').length+' behöver kontroll.');
 }
 async processQueue(queue,publish){
  if(queue.some(i=>i.academy)&&queue.some(i=>!i.academy))throw new Error('Academy och övriga resurser måste köras i separata, verifierade faser.');
  queue.splice(0,queue.length,...prioritizeResources(queue));const videos=[];
  for(const item of queue)if(isVideoResource(item)){item.kind='Video';item.status='Video sist';videos.push(item);}
  await publish();this.report('Prioriterar alla resurser utan video. Videor körs sist, en i taget.');
  const execute=async(item,videoPhase)=>{
   await this.guard();item.status='Kontrollerar';await publish();
   const defer=async frames=>{for(const f of frames)if(f.result.video&&!f.result.video.ended)await this.act(f,'pauseVideo');item.kind='Video';item.status='Video sist';item.reason='Väntar tills övriga resurser har bearbetats.';if(!videos.includes(item))videos.push(item);this.report('Lägger sist: '+item.title);};
   try{
    await this.navigate(item.url);await this.inventory();const frames=await this.frames();
    if(!videoPhase&&frames.some(f=>f.result.video)){await defer(frames);await publish();return;}
    const request=inputRequest(frames,item.title);if(request){item.status='Behöver dina uppgifter';item.inputQuestion=request.question;item.reason=request.reason;this.report(item.title+': '+request.question);await publish();return;}
    const capability=classifyCourse(frames,item.title);
    if(!capability.supported){item.status='Behöver hjälp';item.reason=capability.reason;this.report('Hoppar över '+item.title+': '+item.reason);await publish();return;}
    item.kind=capability.kind;item.status='Kör';item.reason='';await publish();this.report('Kör '+capability.kind.toLowerCase()+': '+item.title);
    this.expectTest=/test|frågetävling|kunskapskontroll|quiz/i.test(item.title);this.testParents=item.parents;const result=await this.resource({deferVideos:!videoPhase});
    if(result==='deferred-video'){await defer([]);await publish();return;}
    let verified=false;
    for(const parent of item.parents){await this.navigate(parent);const p=await this.inventory();if(p.earned||p.items.some(i=>new URL(i.url).pathname===item.key&&i.completed)){verified=true;break;}}
    item.status=verified?'Registrerad klar':'Ej verifierad';item.reason=verified?'':'Bearbetad, men Sales Coach har inte bekräftat slutförande.';this.report(item.title+': '+item.status);
   }catch(e){await this.guard();item.status=e.code==='USER_INPUT_REQUIRED'?'Behöver dina uppgifter':e.code==='ACCESS_DENIED'?'Åtkomst saknas':'Behöver hjälp';if(e.request)item.inputQuestion=e.request.question;item.reason=e.message;this.report('Går vidare från '+item.title+': '+e.message);}
   await publish();
  };
  for(const item of [...queue])if(!videos.includes(item))await execute(item,false);
  queue.splice(0,queue.length,...prioritizeResources(queue));await publish();
  if(videos.length)this.report('Övriga resurser har bearbetats. Nu körs '+videos.length+' videomoment i turordning.');
  for(const item of videos)await execute(item,true);
 }
 async start(){
  const [tab]=await this.api.tabs.query({active:true,currentWindow:true});if(!tab?.id||!isCoachURL(tab.url))throw new Error('Öppna en prestation eller kurs i Sales Coach.');
  this.tabId=tab.id;this.expectedURL=tab.url;
  const p=await this.inventory();const badge=/\/achievements\//.test(new URL(p.url).pathname);
  if(badge){
   if(p.earned){this.report('Prestationen är redan registrerad som klar.');return;}
   const pending=p.items.filter(i=>!i.completed&&!i.locked);if(!pending.length)throw new Error('Inga öppna moment hittades. Låsta moment måste låsas upp i Sales Coach.');
   for(const item of pending){this.report('Öppnar '+item.title);await this.navigate(item.url);await this.resource();await this.navigate(p.url);const check=await this.inventory();const current=check.items.find(i=>new URL(i.url).pathname===new URL(item.url).pathname);if(!check.earned&&!current?.completed)throw new Error('Sales Coach har inte registrerat momentet som klart: '+item.title);this.report('Registrerat klart: '+item.title);}
   const final=await this.inventory();if(!final.earned&&final.items.some(i=>!i.completed))throw new Error('Fler moment återstår, exempelvis låsta resurser.');this.report('Prestationens moment är registrerade som klara.');
  }else if(/\/content\/view\//.test(new URL(p.url).pathname)){
   this.testParents=new URL(tab.url).searchParams.getAll('backTo').filter(v=>/^\/home\/collection\/[^/?]+$/.test(v)).map(v=>new URL(v,'https://salescoach.apple.com').href);if(!this.testParents.length){const known=KNOWN_TESTS[new URL(tab.url).pathname];if(known)this.testParents=[known.parent];}this.expectTest=/test|frågetävling|kunskapskontroll|quiz/i.test(p.title);this.report('Bearbetar den öppna kursen.');await this.resource();await this.inventory();
   if(this.testParents?.length){
    const testPath=new URL(p.url).pathname;let verified=false;
    for(const parent of this.testParents){await this.navigate(parent);const result=await this.inventory();if(result.items.some(i=>new URL(i.url).pathname===testPath&&i.completed)){verified=true;break;}}
    if(!verified)throw new Error('Testet har bearbetats men Sales Coach har ännu inte registrerat det som klart.');
    this.report('Kunskapstestet är registrerat som klart i Sales Coach.');
   }else this.report('Inga fler igenkända steg. Kontrollera slutförandestatus på prestationssidan.');
  }else throw new Error('Öppna en enskild prestation eller kurs innan du startar autopiloten.');
 }
}
