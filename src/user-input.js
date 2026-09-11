// No responses are stored or sent by this detector.
export function inputRequest(frames,title=''){
 const states=frames.map(f=>f.result).filter(Boolean);
 const prompts=states.flatMap(s=>(s.questions||[]).map(q=>q.prompt)).filter(Boolean);
 const personal=/din egen|dina egna|dina erfarenheter|du gjorde under året|årets lyckade|kundexempel|personlig(?:a)? uppgifter/i;
 if(!/formulär|enkät|survey/i.test(title)&&!personal.test(title+' '+prompts.join(' '))&&!states.some(s=>s.freeText))return null;
 const customer=/årets lyckade|kundexempel/i.test(title+' '+prompts.join(' '));
 return {question:customer?'Vilken verklig kundaffär vill du beskriva? Ange bransch, kundens behov, Apple-lösningen, vilka som använder den och resultatet. Utelämna kundnamn, priser och konfidentiella uppgifter.':prompts.find(p=>personal.test(p))||'Vilka egna uppgifter eller erfarenheter vill du ange i detta formulär? Öppna momentet för att läsa alla frågor.',reason:'Momentet kräver dina egna uppgifter. Det väntar tills du har svarat och skickat in formuläret i Sales Coach.'};
}
