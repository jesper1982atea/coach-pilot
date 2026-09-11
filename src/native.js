export function nativeRequest(runtime,payload,{timeoutMs=90000,signal}={}){
 return new Promise((resolve,reject)=>{
  const port=runtime.connectNative('se.atea.coachpilot');let settled=false,timer;
  const finish=(reply,error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);port.onMessage.removeListener(message);port.onDisconnect.removeListener(disconnected);try{port.disconnect();}catch{};if(error)reject(error);else resolve(reply);};
  const abort=()=>finish(null,new Error('AI-anropet stoppades.'));
  const message=reply=>finish(reply);
  const disconnected=()=>{const detail=runtime.lastError?.message;finish(null,new Error(detail?'Mac-bryggan kunde inte nås. Kör Coach Pilot Setup och prova igen.':'Mac-bryggan avslutades utan svar.'));};
  port.onMessage.addListener(message);port.onDisconnect.addListener(disconnected);
  timer=setTimeout(()=>finish(null,new Error('Den lokala modellen svarade inte inom 90 sekunder. Anropet har avbrutits.')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  try{port.postMessage(payload);}catch(e){finish(null,e);}
 });
}
