import {indexContext} from './extract.js';

// Each call starts a fresh local model session. A citation is evidence to review,
// not a machine-verifiable proof that an answer is semantically correct.
export async function reviewAnswer({state,context,question,native,guard,report,validate}){
 const source=context.startsWith('KÄLLOR MED ID\n')?context:indexContext(context);
 const request=async(prompt,options,requiredCount)=>{
  if(prompt.length>2000)throw new Error('Frågan är för lång för kvalitetsgranskningen.');
  await guard();const reply=await native({action:'choose',context:source,question:prompt,optionCount:options.length,requiredCount});await guard();
  if(!reply.ok)throw new Error(reply.error||'AI-granskningen misslyckades.');
  return validate(reply.text,{options,multi:requiredCount!==1,requiredCount},source);
 };
 const assessments=[];
 for(const [index,option] of state.options.entries()){
  report('Granskar alternativ '+(index+1)+'/'+state.options.length+' mot frågan och källan.');
  const prompt='Bedöm om alternativet besvarar EXAKT den ursprungliga frågan. Allmänt sann produktinformation räcker inte. Beakta negationer och vad kursen uttryckligen lyfter fram. Om underlaget inte avgör saken: uncertain=true.\nURSPRUNGLIG FRÅGA:\n'+state.prompt+'\nALTERNATIV ATT BEDÖMA:\n'+option.text+'\nBEDÖMNING (dessa är svarsnumren):\n1. Ja, alternativet ska väljas.\n2. Nej, alternativet ska inte väljas.';
  const result=await request(prompt,[{id:1,text:'Ja'},{id:2,text:'Nej'}],1);
  assessments.push({id:option.id,selected:result.ids[0]===1,evidence:result.evidence});
  report('Alternativ '+(index+1)+': '+(result.ids[0]===1?'välj':'välj inte')+' · Källstöd: '+result.evidence.slice(0,180));
 }
 const selected=assessments.filter(a=>a.selected).map(a=>a.id).sort((a,b)=>a-b);
 if(!selected.length||(!state.multi&&selected.length!==1)||(state.requiredCount!=null&&selected.length!==state.requiredCount))throw new Error('Alternativgranskningen gav inte det antal svar frågan kräver. Inget skickas in.');
 report('Kontrollerar hela svaret i en separat AI-granskning.');
 const final=await request(question+'\nKontrollera frågans exakta avgränsning, negationer och antal svar. Kräv direkt stöd för varje valt alternativ; välj inte enbart sådant som är allmänt sant.',state.options,state.requiredCount??(state.multi?undefined:1));
 if(JSON.stringify(final.ids)!==JSON.stringify(selected))throw new Error('Alternativgranskningen och helhetsgranskningen är oense. Inget skickas in.');
 return {...final,evidence:assessments.filter(a=>a.selected).map(a=>a.evidence).join('\n'),assessments};
}
