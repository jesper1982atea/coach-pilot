import {KNOWN_TESTS} from './known-tests-data.js';
export const normalize=s=>(s||'').normalize('NFKC').replace(/[“”„]/g,'"').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().toLocaleLowerCase('sv');
export const normalizePrompt=s=>normalize(s).replace(/^\d+\s*/, '').replace(/(?:du har valt \d+ av \d+|välj (?:\d+|ett|en)|you have selected \d+ (?:of|out of) \d+|select \d+)\.?\s*$/i,'').trim();
export async function digest(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function matchKnownTest(state,url,records=KNOWN_TESTS){
 const target=new URL(url);if(target.origin!=='https://salescoach.apple.com')return null;
 const record=records[target.pathname];if(!record||state.questions?.length!==record.questions.length)return null;
 const ids=[],seen=new Set();
 for(const q of state.questions){
  const options=await Promise.all(q.options.map(o=>digest(normalize(o.text))));
  const key=await digest(JSON.stringify([normalizePrompt(q.prompt),[...options].sort(),q.multi,q.requiredCount]));
  const stored=record.questions.find(r=>r.key===key);if(!stored||seen.has(key))return null;seen.add(key);
  const chosen=q.options.filter((o,i)=>stored.answers.includes(options[i]));
  if(chosen.length!==stored.answers.length||chosen.some(o=>o.disabled))return null;
  ids.push(...chosen.map(o=>o.id));
 }
 return {ids:ids.sort((a,b)=>a-b),parent:record.parent,verification:record.verification};
}
