// Reads and dismisses only the specific Sales Coach access-denied dialog.
export function accessDialog(dismiss=false){
 const clean=s=>(s||'').replace(/\s+/g,' ').trim();const visible=e=>!!e.getClientRects().length&&!e.closest('[hidden],[aria-hidden="true"]');
 const text=[...document.querySelectorAll('h1,h2,h3,p,div,span,[role="alert"],[role="dialog"]')].filter(visible).map(e=>clean(e.innerText||e.textContent)).join(' ');
 const hasHeading=[...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(visible).some(e=>/^(Innehåll otillgängligt|Content unavailable|Access denied)$/i.test(clean(e.textContent)));
 const denied=hasHeading&&/Du har inte tillgång till det här innehållet|You (?:do not|don't) have access to this content|You don.t have permission to access this content/i.test(text);
 if(!denied)return {denied:false};
 let dismissed=false;if(dismiss){const buttons=[...document.querySelectorAll('button,[role="button"]')].filter(visible).filter(b=>/^OK$/i.test(clean(b.innerText||b.textContent)));if(buttons.length===1){buttons[0].click();dismissed=true;}}
 return {denied:true,dismissed,message:'Sales Coach: du har inte tillgång till det här innehållet.'};
}
export function followVisibleLink(url){
 const target=new URL(url);if(target.origin!=='https://salescoach.apple.com')throw new Error('Otillåten webbplats');
 const visible=e=>!!e.getClientRects().length&&!e.closest('[hidden],[aria-hidden="true"]');
 const links=[...document.querySelectorAll('a[href]')].filter(visible).filter(a=>a.getAttribute('aria-disabled')!=='true').filter(a=>{try{const u=new URL(a.href);return u.origin===target.origin&&u.pathname===target.pathname;}catch{return false;}});
 if(links.length){links[0].click();return {clicked:true,kind:'link'};}
 if(target.pathname==='/home/program/7047/368135'&&location.pathname==='/home/for-you'){
  const clean=s=>(s||'').replace(/\s+/g,' ').trim();
  const cards=[...document.querySelectorAll('span,p,div,a,button')].filter(visible).filter(e=>/^Apple Professional(?: Services)? Academy$/i.test(clean(e.textContent))).filter(e=>![...e.children].some(c=>/^Apple Professional(?: Services)? Academy$/i.test(clean(c.textContent))));
  if(cards.length===1){cards[0].click();return {clicked:true,kind:'academy-card'};}
 }
 return {clicked:false};
}
