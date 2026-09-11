export const RELEASES='https://github.com/jesper1982atea/coach-pilot/releases';
export const ENDPOINT='https://api.github.com/repos/jesper1982atea/coach-pilot/releases/latest';
export function compareVersions(a,b){
 const parse=v=>{if(!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(v))throw new Error('Ogiltigt versionsnummer.');return v.split('.').map(Number);};
 const x=parse(a),y=parse(b);for(let i=0;i<4;i++){const d=(x[i]||0)-(y[i]||0);if(d)return Math.sign(d);}return 0;
}
export function parseRelease(data,current){
 const version=String(data.tag_name||'').replace(/^v/,'');
 if(data.draft||data.prerelease)throw new Error('Ingen stabil uppdatering hittades.');
 const url=RELEASES+'/tag/v'+version;
 if(data.html_url!==url)throw new Error('Oväntad uppdateringsadress.');
 const asset=data.assets?.find(a=>a.name===`Coach-Pilot-Kollegapaket-${version}.zip`&&a.state==='uploaded'&&a.browser_download_url===RELEASES+`/download/v${version}/Coach-Pilot-Kollegapaket-${version}.zip`);
 if(!asset)throw new Error('Installationspaketet är ännu inte tillgängligt.');
 return {version,url,available:compareVersions(version,current)>0};
}
export async function checkUpdate({current,storage,fetcher=fetch,force=false,now=Date.now()}){
 const saved=(await storage.get('releaseCheck')).releaseCheck;
 if(!force&&saved?.current===current&&now>=saved.at&&now-saved.at<12*60*60*1000){return parseRelease(saved.release,current);}
 const response=await fetcher(ENDPOINT,{credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error(response.status===404?'Ingen publicerad version hittades.':'Kunde inte kontrollera uppdateringar. Försök igen senare.');
 const release=await response.json();const result=parseRelease(release,current);
 await storage.set({releaseCheck:{current,at:now,release:{tag_name:release.tag_name,html_url:release.html_url,draft:release.draft,prerelease:release.prerelease,assets:release.assets?.map(({name,state,browser_download_url})=>({name,state,browser_download_url}))}}});return result;
}
