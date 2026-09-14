export function emptyLedger(){return {version:1,records:{},events:[]};}
export function updateLedger(db,item,{attempt=false}={}){
 const key=item.key,old=db.records[key]||{},at=Date.now();
 const row={...old,key,url:item.url||old.url,title:item.title||old.title,status:item.status,reason:item.reason||'',kind:item.kind||old.kind||'resource',attempts:(old.attempts||0)+(attempt?1:0),updatedAt:at};
 if(item.status==='Registrerad klar')row.verifiedAt=at;
 db.records[key]=row;
 db.events.push({at,key,title:row.title,status:row.status,reason:row.reason,attempt:row.attempts});
 db.events=db.events.slice(-2000);
 return row;
}
export function exhausted(row){return row&&row.status!=='Registrerad klar'&&row.attempts>=3;}
