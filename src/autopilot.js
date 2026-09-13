import {captionFrame} from './captions.js';
import {trackVideo} from './run-progress.js';
import {inputRequest} from './user-input.js';
import {KNOWN_TESTS} from './known-tests-data.js';
import {accessDialog,followVisibleLink} from './navigation.js';
import {catalogPage,classifyCourse,addCandidates,isVideoResource,prioritizeResources,ACADEMY_URL,academyChild} from './discovery.js';
import {extractPage,mergeFrames,relevantContext,isCoachURL,indexContext} from './extract.js';

export function isTransientFrameError(error){return /frame with id .* removed|no frame with id|frame.*(?:was )?removed|execution context.*(?:destroyed|invalidated)|cannot access contents of url/i.test(error?.message||String(error));}

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
  const feedbackNodes=[...container.querySelectorAll('[role="alert"],.feedback,[class*="feedback"],[class*="Feedback"],[aria-label]')].filter(visible);
  const questionFeedback=clean(feedbackNodes.map(e=>e.getAttribute('aria-label')||label(e)).filter(t=>/incorrect|correct|fel svar|rätt svar|inte rätt|inte korrekt|korrekt/i.test(t)).join(' ')).slice(0,1000);
  return {prompt,options:opts,multi,requiredCount,feedback:questionFeedback};
 });
 const prompt=questions[0]?.prompt||'',multi=questions[0]?.multi||false;
 const groups=questions.length;
 const fingerprint=JSON.stringify(questions.map(q=>[q.prompt,q.options.map(o=>o.text),q.multi,q.requiredCount]));
 const buttons=[...root.querySelectorAll('button,[role="button"],[role="tab"],input[type="submit"]')].filter(visible);
 const enabled=e=>!e.matches(':disabled')&&!e.closest('[aria-disabled="true"]');
 const submit=buttons.filter(e=>/^(skicka(?: in)?(?: svar(?:et|en)?)?|svara|kontrollera(?: svar(?:et|en)?)?|submit(?: answer)?|check(?: answer)?)$/i.test(label(e)));
 const retry=buttons.filter(e=>/^(försök igen|prova igen|gör om|try again|retry)$/i.test(label(e)));
 const next=buttons.filter(e=>/^(nästa(?: fråga|avsnitt|sida)?|fortsätt|gå vidare|next(?: question|section)?|continue|starta (?:kunskapskontroll|quiz|prov)|start (?:quiz|test)|börja)$/i.test(label(e)));
 const sections=buttons.filter(e=>e.getAttribute('aria-expanded')==='false'&&e.closest('h2,h3,h4,[role="heading"]')&&!/skicka|submit|prov|quiz|test/i.test(label(e)));
 const sectionControls=sections.filter(enabled).map((e,id)=>({id:id+1,text:label(e)}));
 const stepControls=next.filter(enabled).map((e,id)=>({id:id+1,text:label(e)}));
 const reserved=new Set([...submit,...retry,...next,...sections]);
 const embeddedCourse=location.hostname==='seeddownload.cdn-apple.com';
 const interactions=buttons.filter(e=>enabled(e)&&!reserved.has(e)&&(
  (embeddedCourse&&label(e))||
  e.getAttribute('aria-expanded')==='false'||
  (e.getAttribute('role')==='tab'&&e.getAttribute('aria-selected')!=='true')||
  /^(visa|läs|vänd|reveal|show|learn)\b/i.test(label(e))
 )&&!/spela|play|paus|pause|ljud|mute|volym|volume|undertext|caption|inställningar|settings|bild-i-bild|picture.in.picture|helskärm|fullscreen|stäng|close|bakåt|back|åtgärder|actions|meny|menu|profil|profile|dela|share|ladda ner|download|tillåt kursramar|stoppa/i.test(label(e)));
 const lesson=[...root.querySelectorAll('h1,h2,h3,h4,p,li,td,th,blockquote,a')].filter(e=>visible(e)&&(!choices.length||!containers.some(c=>c.contains(e)))).map(label).filter(Boolean).join('\n').slice(0,40000);
 const text=[...root.querySelectorAll('h1,h2,h3,h4,p,li,[role="alert"]')].filter(visible).map(label).filter(Boolean).join('\n').slice(0,40000);
 const feedback=[...root.querySelectorAll('[role="alert"],.feedback,[class*="feedback"],[class*="Feedback"]')].filter(visible).map(label).join(' ');
 const failed=/\b(incorrect|wrong answer|fel svar|inte rätt|inte korrekt)\b/i.test(feedback);
 const passed=/\b(correct|rätt svar|korrekt svar|bra jobbat)\b/i.test(feedback)&&!failed;
 const resultMatch=clean(root.innerText||root.textContent).match(/(\d{1,3})\s*%?\s*(?:Bra jobbat|Du är inte godkänd|Gå igenom dina svar|Du fick|Du har|Grattis|You)/i);
 const resultLocked=options.length&&(options.every(o=>o.disabled)||retry.some(enabled)||!submit.some(enabled));
 const score=resultMatch&&resultLocked?Number(resultMatch[1]):null;
 const ariaSignals=[...root.querySelectorAll('[aria-label]')].filter(visible).map(e=>clean(e.getAttribute('aria-label'))).filter(s=>/XP|ERFARENHETSPOÄNG|EXPERIENCE POINTS/i.test(s));
 const currentTitle=clean(document.title).split('|')[0].trim().toLocaleLowerCase('sv');
 const rewardSignals=(ariaSignals.length?ariaSignals:[feedback]).filter(signal=>{const named=signal.match(/["\u201c]([^"\u201d]+)["\u201d]/);return !named||!currentTitle||currentTitle.includes(clean(named[1]).toLocaleLowerCase('sv'));});
 const xp=rewardSignals.reduce((sum,signal)=>sum+[...signal.matchAll(/(?:\+(\d+)\s*(?:XP|INTJÄNADE ERFARENHETSPOÄNG)|(?:earned|intjänade)\s+(\d+)\s*(?:experience points|erfarenhetspoäng|XP))/gi)].reduce((n,m)=>n+Number(m[1]||m[2]||0),0),0);
 const success=score===100||/^(?:full pott|bra jobbat|success|successful|slutfört|slutfördes|completed|course complete)[!.]?$/im.test(text);
 const complete=xp>0||success||/^(grattis[!.]?|du (?:har )?slutfört.*|du är klar[!.]?|congratulations[!.]?|course complete[!.]?)$/im.test(text);
 const rootScroller=document.scrollingElement||document.documentElement;
 const scrollables=[...new Set([rootScroller,...root.querySelectorAll('*')])].filter(e=>e&&Number(e.scrollHeight)>Number(e.clientHeight)+4&&(e===rootScroller||/auto|scroll/i.test(getComputedStyle(e).overflowY||'')));
 const scroll=scrollables.map((e,id)=>({id:id+1,top:Math.round(Number(e.scrollTop)||0),remaining:Math.max(0,Math.round(Number(e.scrollHeight)-Number(e.clientHeight)-(Number(e.scrollTop)||0)))})).filter(s=>s.remaining>4);
 const video=[...root.querySelectorAll('video')].find(visible);
 const freeText=[...root.querySelectorAll('textarea,[contenteditable="true"],input[type="text"]')].some(visible);
 const state={url:location.href,text,lesson,prompt,options,multi,groups,questions,requiredCount:questions[0]?.requiredCount,fingerprint,submit:submit.length===1&&enabled(submit[0]),retry:retry.length===1&&enabled(retry[0]),next:stepControls.map(s=>s.text),stepControls,sections:sectionControls.map(s=>s.text),sectionControls,interactions:interactions.map((e,id)=>({id:id+1,text:label(e)})),scroll,failed,passed,complete,success,xp,score,freeText,video:video?{ended:video.ended,paused:video.paused,time:video.currentTime,duration:Number.isFinite(video.duration)?video.duration:null}:null};
 if(!command.action)return state;
 if(command.url!==location.href||command.fingerprint!==fingerprint)throw new Error('Sidan ändrades före åtgärden.');
 const click=e=>{if(!e||!enabled(e))throw new Error('Kontrollen är inte tillgänglig.');e.scrollIntoView({block:'center'});e.click();return {acted:true};};
 if(command.action==='select'){
  const option=options.find(o=>o.id===command.id),element=choices[command.id-1];
  if(state.freeText||state.failed||!option||option.text!==command.text)throw new Error('Svarsalternativet ändrades eller kräver manuell input.');
  if(option.selected===command.selected)return {acted:false};return click(element);
 }
 if(command.action==='submit'){
  if(!state.submit||state.failed||state.freeText||!questions.length||questions.some(q=>{const n=q.options.filter(o=>o.selected).length;return !n||(q.requiredCount!=null&&n!==q.requiredCount);}))throw new Error('Inskickning stoppad: otydlig uppgift eller kontroll.');
  if(JSON.stringify(options.filter(o=>o.selected).map(o=>o.id))!==JSON.stringify(command.ids))throw new Error('De valda svaren stämmer inte med förslaget.');
  return click(submit[0]);
 }
 if(command.action==='retry'){
  if(!state.retry||score===100)throw new Error('Omförsök är inte tillgängligt.');
  return click(retry[0]);
 }
 if(command.action==='next'){const candidates=next.filter(enabled),matches=candidates.filter(e=>label(e)===command.text),candidate=command.id?candidates[command.id-1]:(matches.length===1?matches[0]:null);if(!candidate||label(candidate)!==command.text)throw new Error('Nästa steg ändrades.');return click(candidate);}
 if(command.action==='expand'){const candidates=sections.filter(enabled),matches=candidates.filter(e=>label(e)===command.text),candidate=command.id?candidates[command.id-1]:(matches.length===1?matches[0]:null);if(!candidate||label(candidate)!==command.text)throw new Error('Läsavsnittet ändrades.');return click(candidate);}
 if(command.action==='interact'){const candidate=interactions[command.id-1];if(!candidate||label(candidate)!==command.text)throw new Error('Interaktionen ändrades.');return click(candidate);}
 if(command.action==='scroll'){
  const target=scrollables[command.id-1],current=scroll.find(s=>s.id===command.id);if(!target||!current||current.top!==command.top)throw new Error('Rullytan ändrades.');
  const before=Number(target.scrollTop)||0,step=Math.max(500,Math.round(Number(target.clientHeight)*0.8)||0);target.scrollTop=Math.min(before+step,Number(target.scrollHeight)-Number(target.clientHeight));target.dispatchEvent(new Event('scroll',{bubbles:true}));return {acted:target.scrollTop>before,top:target.scrollTop};
 }
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
  if(!result.sourceIds.length||result.sourceIds.some(id=>!Number.isInteger(id)||!passages.has(id)))throw new Error('AI-svaret anger en källreferens som inte finns.');
  return {ids:[...ids].sort((a,b)=>a-b),evidence:[...new Set(result.sourceIds)].map(id=>passages.get(id)).join('\n'),reason:String(result.reason||'').slice(0,1000)};
 }
 const normalize=s=>s.replace(/\s+/g,' ').trim().toLocaleLowerCase('sv');
 if(typeof result.evidence!=='string'||result.evidence.trim().length<20||!normalize(context).includes(normalize(result.evidence)))throw new Error('AI-svaret saknar ett verifierbart citat ur kursunderlaget.');
 return {ids:[...ids].sort((a,b)=>a-b),evidence:result.evidence,reason:String(result.reason||'').slice(0,1000)};
}

export class Autopilot {
 constructor({api,native,report,onPage,onQueue,onStatus=()=>{},wait=ms=>new Promise(r=>setTimeout(r,ms))}){Object.assign(this,{api,native,report,onPage,onQueue,onStatus,wait});this.stopped=false;this.submitted=new Set();this.lastSubmissions=new Map();this.failedAttempts=new Map();this.retrying=new Map();this.retryCounts=new Map();this.issues=new Map();this.maxTestAttempts=5;this.maxAnswerAnalyses=5;this.context='';this.captionPages=new Set();}
 stop(){this.stopped=true;}
 async loadIssues(){const stored=await this.api.storage?.local?.get?.(['autopilotIssues','autopilotQueue'])||{};this.issues=new Map((stored.autopilotIssues||[]).filter(i=>i?.key).map(i=>[i.key,i]));let migrated=false;for(const item of stored.autopilotQueue||[])if(item?.key&&['Ej verifierad','Behöver hjälp','Behöver ett klick','Behöver dina uppgifter','Besvara provet','Åtkomst saknas'].includes(item.status)&&!this.issues.has(item.key)){const now=Date.now();this.issues.set(item.key,{...item,firstSeen:now,lastSeen:now,attempts:1});migrated=true;}if(migrated)await this.saveIssues();return this.issues;}
 async saveIssues(){await this.api.storage?.local?.set?.({autopilotIssues:[...this.issues.values()].sort((a,b)=>(b.lastSeen||0)-(a.lastSeen||0)).slice(0,100)});}
 async rememberIssue(item){if(!item?.key||item.status==='Registrerad klar')return;const old=this.issues.get(item.key),now=Date.now();this.issues.set(item.key,{key:item.key,url:item.url||'https://salescoach.apple.com'+item.key,title:item.title||old?.title||item.key,status:item.status,reason:item.reason||'',inputQuestion:item.inputQuestion||'',studyGuide:item.studyGuide||old?.studyGuide||[],firstSeen:old?.firstSeen||now,lastSeen:now,attempts:(old?.attempts||0)+1});await this.saveIssues();}
 async clearIssue(key){if(this.issues.delete(key))await this.saveIssues();}
 async checkAccess(){
  const t=await this.api.tabs.get(this.tabId);if(this.stopped||!t.active||!isCoachURL(t.url))return;
  const r=await this.script({target:{tabId:this.tabId,frameIds:[0]},func:accessDialog,args:[true]});
  if(r[0]?.result?.denied){this.expectedURL=t.url;const e=new Error(r[0].result.message+' Momentet läggs åt sidan.');e.code='ACCESS_DENIED';throw e;}
 }
 async guard(){if(this.stopped)throw new Error('Stoppad av dig.');const t=await this.api.tabs.get(this.tabId);if(!t.active||!isCoachURL(t.url))throw new Error('Pausad eftersom du bytte flik eller sida.');if(new URL(t.url).pathname!==new URL(this.expectedURL).pathname){await this.checkAccess();throw new Error('Pausad eftersom du bytte flik eller sida.');}this.expectedURL=t.url;}
 async sleep(ms){for(let n=0;n<ms;n+=250){if(this.stopped)throw new Error('Stoppad av dig.');await this.wait(Math.min(250,ms-n));}}
 async script(details,{attempts=4}={}){
  for(let attempt=1;attempt<=attempts;attempt++)try{return await this.api.scripting.executeScript(details);}catch(error){
   if(!isTransientFrameError(error))throw error;
   if(attempt===attempts){const exhausted=new Error('Sales Coach fortsatte byta sidram. Momentet läggs åt sidan och sökningen fortsätter.');exhausted.code='TRANSIENT_FRAME';throw exhausted;}
   this.report('Sales Coach bytte sidram. Återansluter ('+attempt+'/'+(attempts-1)+')…');this.onStatus({phase:'Återansluter till Sales Coach',heartbeat:Date.now(),media:null});
   await this.sleep(350*attempt);const tab=await this.api.tabs.get(this.tabId);if(!tab.active||!isCoachURL(tab.url))throw error;
  }
 }
 async frames(){await this.guard();await this.checkAccess();const frames=(await this.script({target:{tabId:this.tabId,allFrames:true},func:courseFrame})).filter(f=>f.result);this.onStatus({heartbeat:Date.now()});return frames;}
 async collectCaptions(frames){
  if(!frames.some(f=>f.result.video))return;
  const path=new URL(this.expectedURL).pathname;if(this.captionPages.has(path))return;
  this.report('Läser tillgängliga videoundertexter…');
  const results=await this.script({target:{tabId:this.tabId,allFrames:true},func:captionFrame});await this.guard();
  this.captionPages.add(path);
  let found=0,missing=0;
  for(const {result} of results){if(!Array.isArray(result?.passages))continue;for(const passage of result.passages){if(typeof passage.text!=='string')continue;this.context+='\n'+passage.text;found++;}missing+=result.missing?.length||0;}
  this.context=this.context.slice(-100000);
  this.report('Videounderlag: '+found+' undertextspår lästa'+(missing?', '+missing+' videor saknar läsbara undertexter. Videoinnehållet är inte fullständigt tillgängligt.':'.'));
 }
 async settledCourseFrames(item,initial){let path;try{path=new URL(item.url).pathname;}catch{return initial;}if(!/^\/home\/course\/\d+$/.test(path))return initial;let frames=initial;this.onStatus({phase:'Kontrollerar om kursen kräver eventinbjudan',heartbeat:Date.now(),media:null});for(let attempt=0;attempt<8;attempt++){const capability=classifyCourse(frames,item.title),ready=capability.code==='ACCESS_DENIED'||frames.some(f=>f.result?.video||f.result?.freeText||f.result?.options?.length||f.result?.sections?.length||f.result?.next?.length);if(ready)return frames;if(attempt<7){await this.sleep(500);frames=await this.frames();}}return frames;}
 async act(frame,action,extra={}){await this.guard();try{await this.script({target:frame.documentId?{tabId:this.tabId,documentIds:[frame.documentId]}:{tabId:this.tabId,frameIds:[frame.frameId]},func:courseFrame,args:[{action,url:frame.result.url,fingerprint:frame.result.fingerprint,...extra}]},{attempts:1});}catch(error){if(isTransientFrameError(error)){const changed=new Error('Sales Coach bytte sida under åtgärden. Momentet kontrolleras igen vid nästa körning.');changed.code='PAGE_CHANGED';throw changed;}throw error;}await this.sleep(800);}
 async inventory(){await this.guard();const r=await this.script({target:{tabId:this.tabId,allFrames:true},func:extractPage});const p=mergeFrames(r);this.onPage(p);return p;}
 async navigate(url){
  await this.guard();if(!isCoachURL(url))throw new Error('Resursen ligger utanför Sales Coach.');await this.checkAccess();
  const previous=this.expectedURL,targetPath=new URL(url).pathname;
  if(new URL(previous).pathname===targetPath)return;
  let result=await this.script({target:{tabId:this.tabId,frameIds:[0]},func:followVisibleLink,args:[url]});
  if(!result[0]?.result?.clicked&&targetPath==='/home/program/7047/368135'){
   if(new URL(previous).pathname!=='/home/for-you')await this.navigate('https://salescoach.apple.com/home/for-you');
   result=await this.script({target:{tabId:this.tabId,frameIds:[0]},func:followVisibleLink,args:[url]});
   if(!result[0]?.result?.clicked){const e=new Error('Academy-kortet är inte tillgängligt under För dig. Ett aktivt programval kan behövas.');e.code='ACCESS_DENIED';throw e;}
  }else if(!result[0]?.result?.clicked){await this.api.tabs.update(this.tabId,{url});}
  for(let i=0;i<24;i++){
   await this.sleep(500);if(this.stopped)throw new Error('Stoppad av dig.');const t=await this.api.tabs.get(this.tabId);if(!t.active||!isCoachURL(t.url))throw new Error('Pausad eftersom du bytte flik eller sida.');await this.checkAccess();
   if(new URL(t.url).pathname===targetPath){this.expectedURL=t.url;const r=await this.script({target:{tabId:this.tabId,allFrames:true},func:extractPage});if(r.some(f=>(f.result?.text||'').length>100)){await this.sleep(700);await this.checkAccess();await this.guard();return;}}
  }
  const t=await this.api.tabs.get(this.tabId);if(new URL(t.url).pathname!==targetPath)throw new Error('Navigationen nådde inte den valda sidan.');this.expectedURL=t.url;
 }
 testKey(state){const target=new URL(this.expectedURL);return target.origin+target.pathname+'|'+(state.questions?.length?JSON.stringify(state.questions.map(q=>[q.prompt.replace(/^\d+[.)]?\s+/,''),q.options.map(o=>o.text).sort(),q.multi,q.requiredCount]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))):state.fingerprint);}
 answerSignature(state,ids){return JSON.stringify((state.questions?.length?state.questions:[state]).map(q=>[q.prompt?.replace(/^\d+[.)]?\s+/,''),q.options.filter(o=>ids.includes(o.id)).map(o=>o.text).sort()]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}
 questionFeedback(result,state){return (state.questions?.length?state.questions:[state]).map(q=>{const signature=JSON.stringify(q.options.map(o=>o.text).sort());const matches=(result.questions||[]).filter(r=>JSON.stringify(r.options.map(o=>o.text).sort())===signature);return {prompt:q.prompt,feedback:matches.length===1?matches[0].feedback||'':''};});}
 questionChoices(state,ids){return (state.questions?.length?state.questions:[state]).map(q=>({prompt:q.prompt,choices:q.options.filter(o=>ids.includes(o.id)).map(o=>o.text)}));}
 rememberSubmission(state,ids){const key=this.testKey(state);this.lastSubmissions.set(new URL(this.expectedURL).pathname,{key,state,ids});this.submitted.add(key);}
 failedSubmission(state){return this.lastSubmissions.get(new URL(this.expectedURL).pathname)||{key:this.testKey(state),state,ids:state.options.filter(o=>o.selected).map(o=>o.id)};}
 beginRetry(key){const path=new URL(this.expectedURL).pathname,count=this.retryCounts.get(path)||0;if(count>=this.maxTestAttempts-1)throw new Error('Gränsen på '+this.maxTestAttempts+' provförsök är nådd. Momentet sparas för uppföljning.');this.retryCounts.set(path,count+1);this.submitted.delete(key);const previous=this.lastSubmissions.get(path);if(previous)this.submitted.delete(previous.key);this.retrying.set(path,0);}
 async solve(frame,revised=0){
  const s=frame.result;if(s.groups>1)return this.solveTest(frame);if(s.freeText||!s.prompt||s.options.length<2||s.options.length>12||s.options.some(o=>!o.text))throw new Error('Den här frågetypen behöver granskas manuellt.');
  const key=this.testKey(s);if(this.submitted.has(key))throw new Error('Samma fråga visas efter inskickning. Kontrollera återkopplingen.');
  const context=relevantContext(this.context,s.prompt,5500);if(context.trim().length<60)throw new Error('Kursunderlag saknas för att besvara frågan. Läs materialet först.');
  this.report('Läser frågan och ber Apple Intelligence om svar…');
  const previous=this.failedAttempts.get(key)||[];
  const detail=previous.flatMap(a=>(a.feedback||[]).filter(f=>f.prompt===s.prompt&&f.feedback).map(f=>f.feedback)).join(' | ');
  const history=(detail?'\nSales Coach återkoppling för frågan: '+detail:'')+(previous.length?'\nTidigare svar '+previous.map(a=>(a.choices||a.ids).join(' + ')+' gav '+(a.score==null?'underkänt resultat':a.score+' %')).join('; ')+'. Granska frågan på nytt mot källan och upprepa inte ett underkänt svar.':'');
  const question=s.prompt+'\n'+s.options.map(o=>o.id+'. '+o.text).join('\n')+'\n'+(s.multi?'Flera alternativ kan vara rätt.':'Exakt ett alternativ ska väljas.')+history+(revised?'\nFörra AI-analysen upprepade en underkänd svarskombination. Kontrollera varje alternativ på nytt och korrigera slutsatsen utifrån underlaget och återkopplingen.':'');
  if(question.length>2000)throw new Error('Frågan är för lång för den lokala bryggan.');
  const reply=await this.native({action:'choose',context,question});await this.guard();if(!reply.ok)throw new Error(reply.error||reply.message||'AI-anropet misslyckades.');
  const answer=validateAnswer(reply.text,s,context);this.report('AI föreslår '+answer.ids.join(', ')+': '+answer.reason);
  if(previous.some(a=>(a.signature?a.signature===this.answerSignature(s,answer.ids):JSON.stringify(a.ids)===JSON.stringify(answer.ids)))){if(revised<this.maxAnswerAnalyses-1){this.report('AI upprepade ett felaktigt svar. Begär en fördjupad analys före inlämning.');return this.solve(frame,revised+1);}throw new Error('Apple Intelligence upprepade ett redan underkänt svar efter fördjupad analys. Inget nytt svar skickades in.');}
  let fresh=(await this.frames()).find(f=>f.frameId===frame.frameId);if(!fresh||fresh.result.fingerprint!==s.fingerprint)throw new Error('Frågan ändrades medan AI arbetade.');
  for(const option of s.options){const selected=answer.ids.includes(option.id);if(fresh.result.options.find(o=>o.id===option.id)?.selected!==selected){await this.act(fresh,'select',{id:option.id,text:option.text,selected});fresh=(await this.frames()).find(f=>f.frameId===frame.frameId);if(!fresh||fresh.result.fingerprint!==s.fingerprint)throw new Error('Frågan ändrades när svar valdes.');}}
  this.rememberSubmission(s,answer.ids);await this.act(fresh,'submit',{ids:answer.ids});this.report('Svar inskickat. Kontrollerar återkopplingen.');
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
  this.testParents=[new URL(parent,'https://salescoach.apple.com').href];let sources=0;
  this.report('Läser tillgängligt kursunderlag i testets samling…');
  try{
   await this.navigate(new URL(parent,'https://salescoach.apple.com').href);
   const page=await this.inventory();
   for(const item of page.items.filter(i=>!i.locked&&new URL(i.url).pathname!==new URL(testURL).pathname).slice(0,30)){
    this.report('Läser kurskälla: '+item.title);await this.navigate(item.url);
    const expanded=new Set();
    for(let step=0;step<30;step++){
     const frames=await this.frames();
     if(frames.some(f=>f.result.freeText))break;
     await this.collectCaptions(frames);
     for(const f of frames){if(f.result.lesson?.length>60)sources++;this.context=(this.context+'\n'+f.result.lesson).split('\n').filter((v,i,a)=>v&&a.indexOf(v)===i).join('\n').slice(-100000);}
     const frame=frames.find(f=>(f.result.sectionControls||f.result.sections.map((text,id)=>({id:id+1,text}))).some(s=>!expanded.has(f.frameId+'|'+s.id+'|'+s.text)));
     if(!frame)break;
     const section=(frame.result.sectionControls||frame.result.sections.map((text,id)=>({id:id+1,text}))).find(s=>!expanded.has(frame.frameId+'|'+s.id+'|'+s.text));expanded.add(frame.frameId+'|'+section.id+'|'+section.text);await this.act(frame,'expand',section);
    }
   }
  }finally{if(!this.stopped){await this.guard();await this.navigate(testURL);}}
  this.report('Läst kursunderlag: '+this.context.length+' tecken från '+sources+' läsavsnitt.');
  if(this.context.trim().length<500)throw new Error('För lite kursunderlag kunde läsas i testets samling. Inga svar skickas.');
  for(let attempt=0;attempt<40;attempt++){const ready=await this.frames();if(ready.some(f=>f.result.groups>0))return;await this.sleep(500);}
  throw new Error('Testfrågorna laddades inte efter återgången från kursmaterialet.');
 }
 async solveTest(frame,revised=0){
  const s=frame.result,questions=s.questions;
  if(s.freeText||!questions?.length||questions.length>20||questions.some(q=>!q.prompt||q.options.length<2||q.options.length>12||q.options.some(o=>!o.text)))throw new Error('Testets frågor behöver granskas manuellt.');
  const key=this.testKey(s);
  if(this.submitted.has(key))throw new Error('Samma fråga visas efter inskickning. Kontrollera återkopplingen.');
  const attempts=this.failedAttempts.get(key)||[];const answers=[];
  for(const [index,q] of questions.entries()){
   const local={...q,options:q.options.map((o,i)=>({...o,id:i+1}))};
   const context=indexContext(relevantContext(this.context,q.prompt+' '+q.options.map(o=>o.text).join(' '),5000));
   if(context.trim().length<60)throw new Error('Kursunderlag saknas för kunskapstestet. Läs kursmaterialet först.');
   this.report('Kunskapstest: analyserar fråga '+(index+1)+' av '+questions.length+'…');
   const prior=attempts.map(a=>{const choices=a.questionChoices?.find(saved=>saved.prompt===q.prompt)?.choices||a.choices;return {score:a.score,answers:choices?q.options.flatMap((o,i)=>choices.includes(o.text)?[i+1]:[]):a.ids.filter(id=>q.options.some(o=>o.id===id)).map(id=>q.options.findIndex(o=>o.id===id)+1)};}).filter(a=>a.answers.length);
   const detail=attempts.flatMap(a=>(a.feedback||[]).filter(f=>f.prompt===q.prompt&&f.feedback).map(f=>f.feedback)).join(' | ');
   const history=(detail?'\nSales Coach återkoppling för frågan: '+detail:'')+(prior.length?'\nTidigare fullständiga försök blev underkända: '+prior.map(a=>'den här frågan hade '+a.answers.join('+')+' och totalresultatet blev '+a.score+' %').join('; ')+'. Granska varje påstående på nytt mot källan. Den fullständiga underkända kombinationen får inte upprepas.':'');
   const question=q.prompt+'\n'+local.options.map(o=>o.id+'. '+o.text).join('\n')+'\n'+(q.requiredCount?'Välj exakt '+q.requiredCount+' alternativ.':q.multi?'Flera alternativ kan vara rätt.':'Välj ett alternativ.')+history+(revised?'\nFörra AI-analysen upprepade en underkänd svarskombination. Kontrollera varje alternativ på nytt och korrigera slutsatsen utifrån underlaget och återkopplingen.':'');
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
  if(attempts.some(a=>(a.signature?a.signature===this.answerSignature(s,ids):JSON.stringify(a.ids)===JSON.stringify(ids)))){if(revised<this.maxAnswerAnalyses-1){this.report('AI upprepade provsvaren. Begär en fördjupad analys med återkopplingen.');return this.solveTest(frame,revised+1);}throw new Error('Apple Intelligence upprepade en redan underkänd svarskombination efter fördjupad analys. Inget nytt försök skickades in.');}
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
  this.rememberSubmission(s,ids);await this.act(fresh,'submit',{ids});
  this.report('Hela kunskapstestet inskickat. Kontrollerar återkopplingen.');
 }
 async resource({deferVideos=false}={}){
  const started=Date.now();let idle=0,steps=0,prepared=false,submissionWait=0,videoTrack=null,playAttempts=0;const expanded=new Set(),interacted=new Set(),scrolled=new Set(),navigation=new Map();
  while(Date.now()-started<30*60*1000&&steps++<1200){
   const frames=await this.frames();const all=frames.map(f=>f.result);
   if(deferVideos&&all.some(s=>s.video)){for(const f of frames)if(f.result.video&&!f.result.video.ended)await this.act(f,'pauseVideo');return 'deferred-video';}
   if(all.some(s=>s.score===100)){this.report('Sales Coach visar 100 procent på kunskapstestet.');return 'passed';}
   const result=frames.find(f=>f.result.score!=null&&f.result.score<100);
   if(result){
    const {key,state:submittedState,ids}=this.failedSubmission(result.result),attempts=this.failedAttempts.get(key)||[];
    if(this.retrying.has(new URL(this.expectedURL).pathname)){const waits=this.retrying.get(new URL(this.expectedURL).pathname)+1;this.retrying.set(new URL(this.expectedURL).pathname,waits);if(waits>40)throw new Error('Sales Coach laddade inte om frågorna efter Försök igen.');this.onStatus({phase:'Väntar på nya testfrågor',heartbeat:Date.now(),media:null});await this.sleep(500);continue;}
    if(ids.length&&!attempts.some(a=>JSON.stringify(a.ids)===JSON.stringify(ids)))attempts.push({ids,score:result.result.score,signature:this.answerSignature(submittedState,ids),questionChoices:this.questionChoices(submittedState,ids),feedback:this.questionFeedback(result.result,submittedState),choices:submittedState.options.filter(o=>ids.includes(o.id)).map(o=>o.text)});
    this.failedAttempts.set(key,attempts);this.submitted.delete(key);submissionWait=0;
    if(attempts.length>=this.maxTestAttempts)throw new Error('Sales Coach visar '+result.result.score+' procent efter '+attempts.length+' olika försök. Testet pausas för granskning.');
    if(result.result.retry){this.report('Sales Coach visar '+result.result.score+' procent. Försök '+(attempts.length+1)+' av '+this.maxTestAttempts+' granskar svaren på nytt.');this.onStatus({phase:'Granskar om underkänt test ('+(attempts.length+1)+'/'+this.maxTestAttempts+')',heartbeat:Date.now(),media:null});this.beginRetry(key);await this.act(result,'retry');idle=0;continue;}
    throw new Error('Sales Coach visar '+result.result.score+' procent men erbjuder inget säkert omförsök.');
   }
   const failed=frames.find(f=>f.result.failed);
   if(failed?.result.retry){const {key,state:submittedState,ids}=this.failedSubmission(failed.result);if(this.retrying.has(new URL(this.expectedURL).pathname)){const waits=this.retrying.get(new URL(this.expectedURL).pathname)+1;this.retrying.set(new URL(this.expectedURL).pathname,waits);if(waits>40)throw new Error('Sales Coach laddade inte om frågorna efter Försök igen.');await this.sleep(500);continue;}const attempts=this.failedAttempts.get(key)||[];if(ids.length&&!attempts.some(a=>JSON.stringify(a.ids)===JSON.stringify(ids)))attempts.push({ids,score:null,signature:this.answerSignature(submittedState,ids),questionChoices:this.questionChoices(submittedState,ids),feedback:this.questionFeedback(failed.result,submittedState),choices:submittedState.options.filter(o=>ids.includes(o.id)).map(o=>o.text)});this.failedAttempts.set(key,attempts);this.submitted.delete(key);if(attempts.length>=this.maxTestAttempts)throw new Error('Testet är fortfarande underkänt efter '+attempts.length+' olika försök.');this.report('Sales Coach visar fel svar. Granskar svaren på nytt.');this.beginRetry(key);await this.act(failed,'retry');idle=0;continue;}
   if(failed)throw new Error('Sales Coach visar fel svar och erbjuder inget säkert omförsök.');
   const rewarded=all.find(s=>s.xp>0||s.success);if(rewarded){this.report(rewarded.xp>0?'Sales Coach bekräftar '+rewarded.xp+' intjänade erfarenhetspoäng.':'Sales Coach visar att momentet är slutfört.');return 'passed';}
   const request=inputRequest(frames);if(request){const e=new Error(request.reason);e.code='USER_INPUT_REQUIRED';e.request=request;throw e;}
   const question=frames.find(f=>f.result.options.length>0&&!f.result.passed);
   // Accumulate lesson paragraphs, excluding frames displaying answer choices.
   for(const f of frames)this.context=(this.context+'\n'+f.result.lesson).split('\n').filter((s,i,a)=>s&&a.indexOf(s)===i).join('\n').slice(-100000);
   if(question){await this.collectCaptions(frames);const key=this.testKey(question.result);if(this.submitted.has(key)||question.result.options.every(o=>o.disabled)){if(++submissionWait>180){this.report('Resultatvyn svarar inte. Kontrollerar om Sales Coach registrerade testet i samlingen.');return 'submitted-pending';}this.onStatus({phase:'Väntar på testresultat från Sales Coach',heartbeat:Date.now(),media:null});await this.sleep(500);continue;}if(this.retrying.delete(new URL(this.expectedURL).pathname))this.report('De nya testfrågorna är redo. Apple Intelligence analyserar svaren på nytt.');if(!prepared&&(question.result.groups>1||this.context.trim().length<500)){const record=KNOWN_TESTS[new URL(this.expectedURL).pathname];if(record?.parent&&!this.testParents?.length)this.testParents=[record.parent];try{await this.prepareTest();}catch(error){if(['PAGE_CHANGED','TRANSIENT_FRAME','ACCESS_DENIED'].includes(error.code))throw error;const paused=new Error('Provet hittades, men hela kursunderlaget kunde inte läsas. Granska frågorna manuellt.');paused.code='USER_QUIZ_REQUIRED';paused.studyGuide=(question.result.questions?.length?question.result.questions:[question.result]).map(q=>({prompt:q.prompt,suggestions:[],reason:error.message,evidence:''}));throw paused;}prepared=true;idle=0;continue;}await this.solve(question);idle=0;continue;}
   if(all.some(s=>s.freeText))throw new Error('En fritextfråga behöver ditt svar.');
   const video=frames.find(f=>f.result.video&&!f.result.video.ended);
   if(video){
    const v=video.result.video;videoTrack=trackVideo(videoTrack,v,Date.now());
    this.onStatus({phase:v.paused?'Väntar på videospelaren':'Spelar video',media:{time:v.time,duration:v.duration},heartbeat:Date.now()});
    if(videoTrack.stalled){const e=new Error('Webbläsaren kräver ett klick för att starta videon. Öppna momentet, tryck Play och starta autopiloten igen.');e.code='USER_GESTURE_REQUIRED';throw e;}
    if(v.paused&&playAttempts<2){playAttempts++;this.report('Försöker starta videon ('+playAttempts+'/2).');try{await this.act(video,'play');}catch(error){if(/play\(\)|notallowed|user gesture|interact/i.test(error.message||'')){const e=new Error('Webbläsaren blockerade automatisk uppspelning. Öppna momentet, tryck Play och starta autopiloten igen.');e.code='USER_GESTURE_REQUIRED';throw e;}throw error;}}
    await this.sleep(2000);idle=0;continue;
   }
   const section=frames.find(f=>(f.result.sectionControls||f.result.sections.map((text,id)=>({id:id+1,text}))).some(s=>!expanded.has(f.frameId+'|'+s.id+'|'+s.text)));
   if(section){const item=(section.result.sectionControls||section.result.sections.map((text,id)=>({id:id+1,text}))).find(s=>!expanded.has(section.frameId+'|'+s.id+'|'+s.text));expanded.add(section.frameId+'|'+item.id+'|'+item.text);this.report('Öppnar och läser avsnitt: '+item.text);await this.act(section,'expand',item);this.onStatus({phase:'Läser avsnittet: '+item.text,heartbeat:Date.now(),media:null});await this.sleep(3000);idle=0;continue;}
   const interactive=frames.find(f=>(f.result.interactions||[]).some(i=>!interacted.has(f.frameId+'|'+i.text)));
   if(interactive){const item=interactive.result.interactions.find(i=>!interacted.has(interactive.frameId+'|'+i.text));interacted.add(interactive.frameId+'|'+item.text);this.report('Aktiverar kursmoment: '+item.text);this.onStatus({phase:'Går igenom interaktivt innehåll: '+item.text,heartbeat:Date.now(),media:null});await this.act(interactive,'interact',item);await this.sleep(1200);idle=0;continue;}
   const scrollFrame=frames.find(f=>(f.result.scroll||[]).some(s=>!scrolled.has(f.frameId+'|'+s.id+'|'+s.top)));
   if(scrollFrame){const target=scrollFrame.result.scroll.find(s=>!scrolled.has(scrollFrame.frameId+'|'+s.id+'|'+s.top));scrolled.add(scrollFrame.frameId+'|'+target.id+'|'+target.top);this.report('Rullar igenom kursinnehållet: '+Math.max(0,target.remaining)+' px kvar.');this.onStatus({phase:'Rullar igenom sidan och letar efter nya moment',heartbeat:Date.now(),media:null});await this.act(scrollFrame,'scroll',target);await this.sleep(1000);idle=0;continue;}
   const next=frames.find(f=>(f.result.stepControls||f.result.next.map((text,id)=>({id:id+1,text}))).length);
   if(next){const item=(next.result.stepControls||next.result.next.map((text,id)=>({id:id+1,text})))[0],key=next.frameId+'|'+item.id+'|'+next.result.text+'|'+item.text,count=(navigation.get(key)||0)+1;navigation.set(key,count);if(count>2)throw new Error('Nästa-knappen ändrar inte sidan. Körningen är pausad.');this.report('Går vidare till kursens nästa undersida: '+item.text);await this.act(next,'next',item);idle=0;continue;}
   if(all.some(s=>s.complete))return;
   const idleLimit=this.expectTest&&!prepared?30:(interacted.size||expanded.size||scrolled.size||videoTrack?12:4);
   if(++idle>=idleLimit){if(this.expectTest&&!prepared)throw new Error('Testets frågor laddades inte. Inget resultat registrerades.');if(all.some(s=>s.options.length))throw new Error('Frågan saknar en tydlig nästa-knapp.');return 'unconfirmed';}
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
   if(entry.button){await this.guard();await this.script({target:{tabId:this.tabId,frameIds:[0]},func:catalogPage,args:[{open:entry.button}]},{attempts:1});await this.sleep(1500);const destination=await this.api.tabs.get(this.tabId);if(!isCoachURL(destination.url)||!/^\/home\/achievements\/unearned\/\d+$/.test(new URL(destination.url).pathname))throw new Error('Prestationsknappen öppnade inte en stödd sida.');this.expectedURL=destination.url;await this.navigate(destination.url);}
   const inventory=await this.inventory();
   if(academy&&new URL(entry.url).pathname===new URL(ACADEMY_URL).pathname){const p=inventory?.progress;this.academyAudit.rootComplete=!!p&&p.total>0&&p.completed===p.total;}
   const found=await this.script({target:{tabId:this.tabId,allFrames:true},func:catalogPage});
   if(academy)this.academyAudit.blocked.push(...found.flatMap(f=>f.result?.lockedItems||[]));
   const links=found.flatMap(f=>f.result?.links||[]);const parent=/\/home\/(?:achievements\/unearned\/\d+|collection\/[^/]+|program\/\d+\/\d+)$/.test(new URL(this.expectedURL).pathname)?this.expectedURL:null;
   let clearedIssue=false;for(const link of links)if(link.completed){try{clearedIssue=this.issues.delete(new URL(link.url).pathname)||clearedIssue;}catch{}}if(clearedIssue)await this.saveIssues();
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
   }catch(e){
    if(['PAGE_CHANGED','TRANSIENT_FRAME'].includes(e.code)&&(entry.retries||0)<2){entry.retries=(entry.retries||0)+1;seen.delete(key);pages.unshift(entry);this.report('Sales Coach bytte sida under sökningen. Försöker samma katalog igen.');continue;}
    if(e.code!=='ACCESS_DENIED'&&!['PAGE_CHANGED','TRANSIENT_FRAME'].includes(e.code))throw e;
    if(academy)this.academyAudit.blocked.push((e.code==='ACCESS_DENIED'?'Åtkomst saknas: ':'Sidan kunde inte läsas stabilt: ')+entry.url.split('?')[0]);this.report((e.code==='ACCESS_DENIED'?'Åtkomst saknas för ':'Kunde inte läsa ')+entry.url.split('?')[0]+'. Fortsätter med tillgängliga moment.');
   }
  }
  if(academy&&(pages.length||queue.length>=100))this.academyAudit.blocked.push('Inventeringens gräns nåddes.');
 }
 async discoverAndRun(){
  const [tab]=await this.api.tabs.query({active:true,currentWindow:true});if(!tab?.id||!isCoachURL(tab.url))throw new Error('Öppna Sales Coach och logga in först.');
  this.tabId=tab.id;this.expectedURL=tab.url;await this.loadIssues();const queue=[];const selectedCatalog=/^\/home\/collection\/[^/]+$/.test(new URL(tab.url).pathname)?tab.url:null;
  const publish=async()=>{this.onQueue?.(prioritizeResources(queue).map(i=>({...i})));await this.api.storage.local.set({autopilotQueue:queue.map(({title,url,key,status,reason,kind,academy,inputQuestion,studyGuide})=>({title,url,key,status,reason,kind,academy,inputQuestion,studyGuide})),queueUpdatedAt:Date.now()});};
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
  if(selectedCatalog){this.report('Kontrollerar först samlingen som var öppen när piloten startades.');await this.crawlCatalog(queue,[{url:selectedCatalog,depth:0}],publish,false,true);}
  this.report('Söker nu efter övriga resurser under För dig.');
  await this.crawlCatalog(queue,[{url:'https://salescoach.apple.com/home/for-you',depth:0}],publish,false,true);
  const other=queue.filter(i=>!i.academy&&i.status==='Hittad');
  await this.processQueue(other,publish);
  this.report('Kön genomgången: '+queue.filter(i=>i.status==='Registrerad klar').length+' registrerade klara, '+queue.filter(i=>i.status!=='Registrerad klar').length+' behöver kontroll.');
 }
 async verifyCompletion(item,{attempts=6,delays=[1500,2500,4000,6000,8000]}={}){
  const parents=[...new Set(item.parents||[])];if(!parents.length)return false;
  for(let attempt=0;attempt<attempts;attempt++){
   for(const parent of parents){await this.navigate(parent);const page=await this.inventory();if(page.earned||page.items.some(i=>{try{return new URL(i.url).pathname===item.key&&i.completed;}catch{return false;}}))return true;}
   if(attempt<attempts-1){const delay=delays[Math.min(attempt,delays.length-1)]||1500;this.report('Sales Coach har ännu inte registrerat '+item.title+'. Kontrollerar igen ('+(attempt+2)+'/'+attempts+').');this.onStatus({phase:'Väntar på registrering från Sales Coach',heartbeat:Date.now(),media:null});await this.sleep(delay);}
  }
  return false;
 }
 async processQueue(queue,publish){
  if(queue.some(i=>i.academy)&&queue.some(i=>!i.academy))throw new Error('Academy och övriga resurser måste köras i separata, verifierade faser.');
  queue.splice(0,queue.length,...prioritizeResources(queue));const videos=[];
  for(const item of queue)if(isVideoResource(item)){item.kind='Video';item.status='Video sist';videos.push(item);}
  await publish();this.report('Prioriterar alla resurser utan video. Videor körs sist, en i taget.');
  const execute=async(item,videoPhase)=>{
   await this.guard();const remembered=this.issues.get(item.key);if(remembered&&!remembered.retryRequested&&['Åtkomst saknas','Behöver dina uppgifter'].includes(remembered.status)){Object.assign(item,{status:remembered.status,reason:remembered.reason,inputQuestion:remembered.inputQuestion||'',studyGuide:remembered.studyGuide||[]});this.report('Hoppar över sparat moment för '+item.title+': '+item.reason);await publish();return;}item.status='Kontrollerar';await publish();
   const defer=async frames=>{for(const f of frames)if(f.result.video&&!f.result.video.ended)await this.act(f,'pauseVideo');item.kind='Video';item.status='Video sist';item.reason='Väntar tills övriga resurser har bearbetats.';if(!videos.includes(item))videos.push(item);this.report('Lägger sist: '+item.title);};
   try{
    await this.navigate(item.url);await this.inventory();let frames=await this.frames();frames=await this.settledCourseFrames(item,frames);
    if(!videoPhase&&frames.some(f=>f.result.video)){await defer(frames);await publish();return;}
    const request=inputRequest(frames,item.title);if(request){item.status='Behöver dina uppgifter';item.inputQuestion=request.question;item.reason=request.reason;this.report(item.title+': '+request.question);await this.rememberIssue(item);await publish();return;}
    const capability=classifyCourse(frames,item.title);
    if(!capability.supported){item.status=capability.code==='ACCESS_DENIED'?'Åtkomst saknas':'Behöver hjälp';item.reason=capability.reason;this.report('Hoppar över '+item.title+': '+item.reason);await this.rememberIssue(item);await publish();return;}
    item.kind=capability.kind;item.status='Kör';item.reason='';await publish();this.report('Kör '+capability.kind.toLowerCase()+': '+item.title);
    this.context='';this.captionPages.clear();this.expectTest=/test|frågetävling|kunskapskontroll|quiz/i.test(item.title);this.testParents=item.parents;const result=await this.resource({deferVideos:!videoPhase});
    if(result==='deferred-video'){await defer([]);await publish();return;}
    const verified=await this.verifyCompletion(item,result==='unconfirmed'?{attempts:2,delays:[1500]}:{});
    item.status=verified?'Registrerad klar':'Ej verifierad';item.reason=verified?'':result==='submitted-pending'?'Svar inskickat, men varken resultatvyn eller samlingen bekräftade registreringen efter flera kontroller.':'Bearbetad, men Sales Coach har inte bekräftat slutförande efter flera kontroller.';if(verified)await this.clearIssue(item.key);else await this.rememberIssue(item);this.report(item.title+': '+item.status);
   }catch(e){if(['ACCESS_DENIED','PAGE_CHANGED','TRANSIENT_FRAME'].includes(e.code)){if(this.stopped)throw new Error('Stoppad av dig.');const tab=await this.api.tabs.get(this.tabId);if(!tab.active||!isCoachURL(tab.url))throw new Error('Pausad eftersom du bytte flik eller sida.');this.expectedURL=tab.url;}else await this.guard();item.status=e.code==='USER_INPUT_REQUIRED'?'Behöver dina uppgifter':e.code==='USER_QUIZ_REQUIRED'?'Besvara provet':e.code==='USER_GESTURE_REQUIRED'?'Behöver ett klick':e.code==='ACCESS_DENIED'?'Åtkomst saknas':['PAGE_CHANGED','TRANSIENT_FRAME'].includes(e.code)?'Ej verifierad':'Behöver hjälp';if(e.request)item.inputQuestion=e.request.question;if(e.studyGuide)item.studyGuide=e.studyGuide;item.reason=e.message;await this.rememberIssue(item);this.report('Går vidare från '+item.title+': '+e.message);}
   await publish();
  };
  for(const item of [...queue])if(!videos.includes(item))await execute(item,false);
  queue.splice(0,queue.length,...prioritizeResources(queue));await publish();
  if(videos.length)this.report('Övriga resurser har bearbetats. Nu körs '+videos.length+' videomoment i turordning.');
  for(const item of videos)await execute(item,true);
 }
 async start(){
  const [tab]=await this.api.tabs.query({active:true,currentWindow:true});if(!tab?.id||!isCoachURL(tab.url))throw new Error('Öppna en prestation eller kurs i Sales Coach.');
  this.tabId=tab.id;this.expectedURL=tab.url;await this.loadIssues();
  const p=await this.inventory();const collection=/^\/home\/(?:achievements\/(?:unearned|earned)|collection\/[^/]+)$/.test(new URL(p.url).pathname);
  if(collection){
   if(p.earned){this.report('Prestationen är redan registrerad som klar.');return;}
   const pending=p.items.filter(i=>!i.completed&&!i.locked);if(!pending.length)throw new Error('Inga öppna moment hittades. Låsta moment måste låsas upp i Sales Coach.');
   const queue=pending.map(item=>({...item,key:new URL(item.url).pathname,parents:[p.url],status:'Hittad',reason:'',academy:false}));this.report('Bearbetar '+queue.length+' öppna krav på den här sidan.');await this.processQueue(queue,async()=>this.onQueue?.(queue.map(i=>({...i}))));await this.navigate(p.url);const final=await this.inventory();
   if(!final.earned&&final.items.some(i=>!i.completed)){const blocked=queue.filter(i=>i.status!=='Registrerad klar');throw new Error('Fler krav återstår. '+blocked.map(i=>i.title+': '+i.reason).join(' '));}this.report('Samlingens moment är registrerade som klara.');
  }else if(/\/home\/(?:content\/view|course)\//.test(new URL(p.url).pathname)){
   const capability=classifyCourse(await this.frames(),p.title);if(!capability.supported){const error=new Error(capability.reason);error.code=capability.code;throw error;}
   this.testParents=new URL(tab.url).searchParams.getAll('backTo').filter(v=>/^\/home\/collection\/[^/?]+$/.test(v)).map(v=>new URL(v,'https://salescoach.apple.com').href);if(!this.testParents.length){const known=KNOWN_TESTS[new URL(tab.url).pathname];if(known?.parent)this.testParents=[known.parent];}this.expectTest=/test|frågetävling|kunskapskontroll|quiz/i.test(p.title);this.report('Bearbetar den öppna kursen.');try{await this.resource();}catch(e){if(e.code!=='USER_QUIZ_REQUIRED')throw e;const item={title:p.title,key:new URL(p.url).pathname,url:p.url,status:'Besvara provet',reason:e.message,studyGuide:e.studyGuide||[],parents:this.testParents||[]};await this.rememberIssue(item);this.onQueue?.([item]);this.report('Provförslagen visas under Återstår. Välj och skicka in svaren i Sales Coach.');return;}await this.inventory();
   if(this.testParents?.length){
    const testPath=new URL(p.url).pathname;const verified=await this.verifyCompletion({title:p.title,key:testPath,parents:this.testParents});
    if(!verified)throw new Error('Testet har bearbetats men Sales Coach har ännu inte registrerat det som klart.');
    this.report('Kunskapstestet är registrerat som klart i Sales Coach.');
   }else this.report('Inga fler igenkända steg. Kontrollera slutförandestatus på prestationssidan.');
  }else throw new Error('Öppna en enskild prestation eller kurs innan du startar autopiloten.');
 }
}
