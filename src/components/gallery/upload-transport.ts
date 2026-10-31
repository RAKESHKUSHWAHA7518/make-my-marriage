export type UploadItem = { id:string; file:File; src:string; key:string; intent?:string; status:string; progress:number; attempted:boolean; blocked?:boolean; error?:string };
export class RequestError extends Error { constructor(message:string,public status:number){super(message);} }
export async function jsonRequest(url:string, method="GET", payload?:unknown, key?:string) {
  const response = await fetch(url,{ method,cache:"no-store",headers:{...(method!=="GET"?{"Content-Type":"application/json","X-MMM-CSRF":"1"}:{}),...(key?{"Idempotency-Key":key}:{})},...(payload!==undefined?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(20000) });
  const result=await response.json(); if(!response.ok)throw new RequestError(result.error?.message??"Please retry.",response.status); return result.data;
}
export function directUpload(file:File, upload:{url:string;fields:Record<string,string>}, progress:(n:number)=>void) {
  return new Promise<void>((resolve,reject)=>{
    const xhr=new XMLHttpRequest(),data=new FormData();
    Object.entries(upload.fields).forEach(([key,value])=>data.append(key,value));data.append("file",file);
    xhr.open("POST",upload.url);xhr.timeout=120000;
    xhr.upload.onprogress=e=>{if(e.lengthComputable)progress(Math.round(e.loaded/e.total*100));};
    xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error("Upload result requires checking."));
    xhr.onerror=xhr.ontimeout=()=>reject(Error("Upload interrupted; check its result before starting another."));xhr.send(data);
  });
}

export async function uploadOne(item: UploadItem, endpoint: (path: string) => string, update: (item: UploadItem, patch: Partial<UploadItem>) => void, retryTransfer = false) {
        if(retryTransfer&&item.intent){const existing=await jsonRequest(endpoint(`/api/v1/media/intents/${item.intent}/complete`),"POST",{});if(existing?.ready){update(item,{status:"Uploaded",progress:100,error:undefined});return;}}
        if(!item.intent||retryTransfer){update(item,{status:"Preparing upload",error:undefined});const intent=await jsonRequest(endpoint("/api/v1/media/intents"),"POST",{purpose:"gallery",filename:item.file.name,contentType:item.file.type,sizeBytes:String(item.file.size)},item.key);update(item,{intent:intent.id});
          // Intent identity is retained before transmitting any file bytes.
          update(item,{status:"Uploading",attempted:true});try{await directUpload(item.file,intent.upload,n=>update(item,{progress:n}));}catch{update(item,{status:"Checking photo"});}
        }
        update(item,{status:"Checking photo",error:undefined});let ready=false;
        for(let attempt=0;attempt<3;attempt++){const result=await jsonRequest(endpoint(`/api/v1/media/intents/${item.intent}/complete`),"POST",{});if(result?.ready){ready=true;break;}if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1500));}
        if(!ready)throw Error("We couldn’t confirm this upload yet. Retry checking, or retry the transfer without selecting the photo again.");
        update(item,{status:"Uploaded",progress:100,error:undefined});

}

export const formatPhotoBytes=(value:string|number)=>{const n=Number(value),divisor=n>=1_000_000_000?1_000_000_000:n>=1_000_000?1_000_000:n>=1000?1000:1;return `${(n/divisor).toLocaleString("en-IN",{maximumFractionDigits:1})} ${divisor===1_000_000_000?"GB":divisor===1_000_000?"MB":divisor===1000?"KB":"B"}`;};
