// Runs inside a frame; must be self-contained for chrome.scripting.executeScript.
export function extractPage() {
  const visible = el => !!(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const main = document.querySelector('main') || document.body;
  const clean = s => (s || '').replace(/\s+/g,' ').trim();
  const items = [...main.querySelectorAll('a[href]')].filter(visible).flatMap(a => {
    let u; try { u = new URL(a.getAttribute('href'),location.href); } catch { return []; }
    if(u.origin !== 'https://salescoach.apple.com' || !/^\/home\/(content\/view|course|achievements\/(unearned|earned))\/\d+/.test(u.pathname)) return [];
    const label = clean(a.getAttribute('aria-label') || a.innerText || a.textContent);
    if(!label) return [];
    const completed = /(?:, completed|item completed|slutförd|slutfördes)/i.test(label) || !!a.querySelector('[aria-label="item completed"]');
    const locked = a.getAttribute('aria-disabled') === 'true' || /item locked/i.test(label);
    return [{url:u.href,title:label.replace(/^Content |^Resurs |^Course |^Kurs /,'').replace(/\s+\d+ minutes.*$|\s+item (completed|locked).*$/,'').trim(),completed,locked}];
  });
  const clone = main.cloneNode(true);
  clone.querySelectorAll('script,style,nav,header,footer,input,textarea,select,[contenteditable="true"],[hidden],[aria-hidden="true"]').forEach(e=>e.remove());
  const blocks = [...main.querySelectorAll('h1,h2,h3,p,[role="radio"],[role="checkbox"],label')].filter(visible).map(e=>clean(e.innerText || e.textContent)).filter(Boolean);
  const text = [...new Set(blocks)].join('\n') || clean(clone.textContent);
  const counts=[...main.querySelectorAll('h3,button,p,div')].filter(visible).map(e=>clean(e.textContent).match(/^(?:Resurser )?(\d+)\s*\/\s*(\d+)\s*slutförd|^(\d+)\s*slutförd\s*(\d+)\s*krävs$/i)).find(Boolean);
  const progress=counts?{completed:Number(counts[1]||counts[3]),total:Number(counts[2]||counts[4])}:null;
  return {progress,title:clean(main.querySelector('h1,h2')?.textContent || document.title),url:location.href,text:text.slice(0,40000),truncated:text.length>40000,items,frames:[...document.querySelectorAll('iframe[src]')].map(f=>f.src).filter(u=>u.startsWith('https:')),earned:!!main.querySelector('time') && items.length===0 && /\/achievements\//.test(location.pathname),capturedAt:Date.now()};
}
export function expandReadSection() {
  const visible=el=>!!el.getClientRects().length;
  const buttons=[...document.querySelectorAll('h2 button,h3 button,[role="heading"] button')];
  const next=buttons.find(b=>visible(b) && !b.disabled && b.getAttribute('aria-expanded')!=='true' && !b.dataset.coachOpened && !/prov|test|skicka|submit|slutför|klar|svara/i.test(b.textContent));
  if(!next) return {opened:false};
  next.dataset.coachOpened='true'; next.scrollIntoView({block:'center'}); next.click();
  return {opened:true,title:next.textContent.trim()};
}
export function isCoachURL(url) { try {const u=new URL(url); return u.origin==='https://salescoach.apple.com' && u.pathname.startsWith('/home/');}catch{return false;} }
export function mergeFrames(results) {
 const frames=results.filter(r=>r?.result).sort((a,b)=>a.frameId-b.frameId);
 if(!frames.length) throw new Error('Inget läsbart innehåll. Vänta tills sidan laddats.');
 const top=frames.find(f=>f.frameId===0)?.result || frames[0].result;
 const items=[...new Map(frames.flatMap(f=>f.result.items).map(i=>[new URL(i.url).pathname,i])).values()];
 return {...top,items,text:frames.map(f=>f.result.text).filter(Boolean).join('\n\n'),frameCount:frames.length,truncated:frames.some(f=>f.result.truncated)};
}
export function relevantContext(text,question,limit=6500) {
 if(!question.trim()) return text.slice(0,limit);
 const stop=new Set('och att det den de som för till med kan ska har ett en vad vilka vilket hur du kunden kundens om på the and for with what which how this that are'.split(' '));
 const words=[...new Set(question.toLocaleLowerCase('sv').match(/[\p{L}\d]{3,}/gu)||[])].filter(w=>!stop.has(w));
 const lines=text.split('\n').filter(Boolean);
 const ranked=lines.map((line,index)=>({line,index,score:words.reduce((s,w)=>s+(line.toLocaleLowerCase('sv').includes(w)?Math.log(1+lines.length/(1+lines.filter(l=>l.toLocaleLowerCase('sv').includes(w)).length)):0),0)})).sort((a,b)=>b.score-a.score||a.index-b.index);
 let length=0; const chosen=[];
 for(const entry of ranked){if(length+entry.line.length>limit)continue;chosen.push(entry);length+=entry.line.length+1;}
 return chosen.sort((a,b)=>a.index-b.index).map(e=>e.line).join('\n').slice(0,limit);
}

export function indexContext(text){
 const chunks=text.split('\n').filter(Boolean).flatMap(line=>line.match(/.{1,600}(?:\s|$)|\S{601,}/gu)||[line]);
 return 'KÄLLOR MED ID\n'+chunks.map((line,i)=>'[K'+(i+1)+'] '+line.replace(/\s+/g,' ').trim()).join('\n');
}
