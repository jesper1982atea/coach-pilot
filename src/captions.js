// Runs inside the course frame. Only reads caption tracks exposed by its media.
export async function captionFrame(){
 const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 const media=[...document.querySelectorAll('video')];const passages=[],missing=[];
 for(const [index,video] of media.entries()){
  let text='';
  const loaded=[...(video.textTracks||[])].filter(t=>['captions','subtitles'].includes(t.kind)&&t.cues?.length);
  loaded.sort((a,b)=>(/^sv/i.test(b.language)?2:/^en/i.test(b.language)?1:0)-(/^sv/i.test(a.language)?2:/^en/i.test(a.language)?1:0));
  if(loaded[0])text=[...loaded[0].cues].map(c=>clean(c.text)).filter(Boolean).join('\n');
  if(!text){
   const tracks=[...video.querySelectorAll('track[src]')].filter(t=>['captions','subtitles'].includes(t.kind));
   tracks.sort((a,b)=>(/^sv/i.test(b.srclang)?2:/^en/i.test(b.srclang)?1:0)-(/^sv/i.test(a.srclang)?2:/^en/i.test(a.srclang)?1:0));
   for(const track of tracks.slice(0,2)){
    const url=new URL(track.src,location.href);if(!['https:','http:'].includes(url.protocol))continue;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
    try{
     const response=await fetch(url.href,{signal:controller.signal,credentials:'same-origin'});
     if(!response.ok||Number(response.headers.get('content-length'))>1000000)continue;
     const raw=await response.text();if(raw.length>1000000)continue;
     // VTT/SRT cues only; never treat an HTML login/error page as source material.
     const blocks=raw.replace(/\r/g,'').split(/\n\s*\n/);
     text=blocks.flatMap(block=>{const lines=block.split('\n'),at=lines.findIndex(l=>/^(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s+-->\s+/.test(l));return at<0?[]:lines.slice(at+1).map(clean).filter(Boolean);}).join('\n');
     if(text)break;
    }catch{}finally{clearTimeout(timer);}
   }
  }
  if(text)passages.push({video:index+1,text:text.slice(0,30000)});else missing.push(index+1);
 }
 return {passages,missing,videoCount:media.length};
}
