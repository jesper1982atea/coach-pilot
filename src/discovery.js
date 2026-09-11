export function catalogPage(command={}) {
 const clean=s=>(s||'').replace(/\s+/g,' ').trim();
 const visible=e=>!!e.getClientRects().length&&!e.closest('[hidden],[aria-hidden="true"]');
 const links=[...document.querySelectorAll('a[href]')].filter(visible).flatMap(a=>{
  try{const u=new URL(a.href);if(u.origin!=='https://salescoach.apple.com')return [];
   const path=u.pathname;const resource=/^\/home\/content\/view\/\d+$/.test(path),badge=/^\/home\/achievements\/unearned\/\d+$/.test(path);
   const catalog=/^\/home\/(for-you(?:\/.*)?|achievements(?:\/unearned)?|collection\/[^/]+|program\/\d+\/\d+|explore\/(collections|curriculum\/\d+))$/.test(path);
   if(!resource&&!badge&&!catalog)return [];
   const title=clean(a.getAttribute('aria-label')||a.innerText||a.textContent);if(!title)return [];
   const completed=/, completed|item completed|slutfördes|slutförd/i.test(title)||!!a.querySelector('[aria-label="item completed"]');
   const locked=a.getAttribute('aria-disabled')==='true'||/item locked/i.test(title)||!!a.querySelector('[aria-label*="locked" i],[alt*="locked" i]');
   const related=[...document.querySelectorAll('h2,h3')].some(h=>/^(Mer relaterat|Related)/i.test(clean(h.textContent))&&!!(h.compareDocumentPosition(a)&4));
   return [{url:u.href,title,kind:resource?'resource':badge?'badge':'catalog',completed,locked,related}];
  }catch{return [];}
 });
 const buttons=[...document.querySelectorAll('button,[role="button"]')].filter(visible).filter(b=>/\bunearned\b/i.test(clean(b.getAttribute('aria-label')||b.innerText||b.textContent))&&!b.disabled);
 const titleOf=b=>clean(b.getAttribute('aria-label')||b.innerText||b.textContent);
 if(command.open){const matches=buttons.filter(b=>titleOf(b)===command.open);if(matches.length!==1)throw new Error('Prestationsknappen saknas eller är otydlig.');matches[0].click();return {opened:true};}
 for(const b of buttons)links.push({url:location.href,title:titleOf(b),kind:'badgeButton',button:titleOf(b)});
 const lockedItems=[...document.querySelectorAll('a:not([href]),[role="link"]:not([href])')].filter(visible).filter(e=>e.getAttribute('aria-disabled')==='true'||e.querySelector('[aria-label*="locked" i],[alt*="locked" i]')).map(e=>clean(e.getAttribute('aria-label')||e.textContent)).filter(Boolean);
 return {url:location.href,links,lockedItems};
}
export function classifyCourse(frames,title='') {
 if(/formulär|survey|enkät/i.test(title))return {supported:false,reason:'Formulär kräver egna uppgifter och fritextsvar. Öppna och fyll i formuläret manuellt.'};
 const states=frames.map(f=>f.result).filter(Boolean);
 if(!states.length)return {supported:false,reason:'Inget åtkomligt kursinnehåll'};
 if(states.some(s=>s.freeText||(s.groups>1&&!s.questions?.length)))return {supported:false,reason:'Fritext eller otydligt grupperade frågor'};
 if(states.some(s=>s.video))return {supported:true,kind:'Video'};
 if(states.some(s=>s.options?.length>=2))return {supported:true,kind:'Flervalsfråga'};
 if(states.some(s=>s.sections?.length||s.next?.length))return {supported:true,kind:'Interaktiv läsresurs'};
 if(states.some(s=>(s.lesson||'').length>180))return {supported:true,kind:'Läsresurs'};
 return {supported:false,reason:'Ingen stödd uppgift eller tillräckligt läsbart material'};
}
export function addCandidates(queue,links,parent,academy=false) {
 for(const link of links){if(link.kind!=='resource'||link.completed||link.locked)continue;
  const key=new URL(link.url).pathname;const existing=queue.find(i=>i.key===key);
  if(existing){if(academy)existing.academy=true;if(parent&&!existing.parents.includes(parent))existing.parents.push(parent);continue;}
  if(queue.length>=100)break;
  queue.push({...link,key,academy,parents:parent?[parent]:[],status:'Hittad',reason:''});
 }
 return queue;
}

export function isVideoResource(item){return item.kind==='Video'||/\b(?:video(?:n|r|s)?|film(?:en|er)?)\b/i.test(item.title||'');}
export function prioritizeResources(queue){const rank=i=>(i.academy?0:2)+(isVideoResource(i)?1:0);return [...queue].sort((a,b)=>rank(a)-rank(b));}
export const ACADEMY_URL='https://salescoach.apple.com/home/program/7047/368135';
export function academyChild(link){return !link.locked&&!link.related&&/\/home\/(?:collection\/[^/]+|program\/7047\/\d+)$/.test(new URL(link.url).pathname)&&!/^back$|^tillbaka$/i.test(link.title);}
