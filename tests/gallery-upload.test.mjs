import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require=createRequire(import.meta.url),selection=require("../src/components/gallery/file-selection.ts");
function harness(results){
  const states=[],refs=[],requests=[],uploads=[];let s=0,r=0,serial=0;
  const initial={photos:[],count:0,nextCursor:null,archived:false,storage:{usedBytes:"0",reservedBytes:"0",limitBytes:"1000000000"}};
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(value){const i=s++;if(!(i in states))states[i]=value;return[states[i],v=>{states[i]=typeof v==="function"?v(states[i]):v;}];},useRef(value){return refs[r++]??(refs[r-1]={current:value});},useEffect(){}};
  class Xhr{status=200;upload={};open(method,url){this.url=url;}send(){uploads.push(this.url);this.onload();}}
  const context={React,exports:{},Error,AbortSignal,URL:{createObjectURL:()=>"blob:local-test",revokeObjectURL(){}},crypto:{randomUUID:()=>`immutable-upload-key-${++serial}`},FormData:class{append(){}},XMLHttpRequest:Xhr,
    require(id){if(id==="react")return React;if(id==="next/image"||id==="next/link")return"img";if(id==="next/navigation")return{useRouter:()=>({refresh(){},push(){}})};if(id.includes("file-selection"))return selection;return{useUnsavedNavigation(){}};},
    async fetch(url,options){requests.push({url,...options});if(options.method==="GET")return{ok:true,status:200,json:async()=>({data:initial})};const next=results.shift();if(next instanceof Error)throw next;return{ok:next.status<300,status:next.status,json:async()=>next.body};}
  };
  runInNewContext(ts.transpileModule(readFileSync("src/components/gallery/gallery.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,context);
  function render(){s=r=0;return context.exports.Gallery({initial,weddingId:"a".repeat(24)});}
  function walk(node){if(!node||typeof node!=="object")return[];if(Array.isArray(node))return node.flatMap(walk);return[node,...walk(node.props?.children)];}
  function select(){walk(render()).find(n=>n.type==="input"&&n.props.type==="file").props.onChange({target:{files:[{name:"photo.jpg",type:"image/jpeg",size:100}],value:""}});}
  async function submit(){const button=walk(render()).find(n=>n.type==="button"&&n.props.children.includes("Upload / check photos"));assert(button);await button.props.onClick();}
  return{select,submit,requests,uploads,states,render,async transfer(){const button=walk(render()).find(n=>n.type==="button"&&n.props.children.includes("Retry transfer"));assert(button);await button.props.onClick();}};
}
const intent={status:201,body:{data:{id:"b".repeat(24),upload:{url:"https://provider.test/upload",fields:{signature:"synthetic"}}}}};
const ready={status:200,body:{data:{ready:true,state:"finalized"}}};
test("lost completion and HTTP 429 retain the same intent without uploading the photo twice",async()=>{
  const h=harness([intent,new Error("Lost save response"),{status:429,body:{error:{message:"Wait"}}},ready]);h.select();await h.submit();await h.submit();await h.submit();
  assert.equal(h.uploads.length,1);assert.equal(h.requests.filter(r=>r.url==="/api/v1/media/intents").length,1);
  const completions=h.requests.filter(r=>r.url.endsWith("/complete"));assert.equal(completions.length,3);assert(completions.every(r=>r.url===completions[0].url&&r.body==="{}"));assert.equal(h.states[1][0].status,"Uploaded");
});
test("lost intent response retries the original immutable upload key and file metadata",async()=>{
  const h=harness([new Error("Lost intent response"),intent,ready]);h.select();await h.submit();await h.submit();
  const creates=h.requests.filter(r=>r.url==="/api/v1/media/intents");assert.equal(creates.length,2);assert.equal(creates[0].headers["Idempotency-Key"],creates[1].headers["Idempotency-Key"]);assert.equal(creates[0].body,creates[1].body);assert.equal(h.uploads.length,1);
});
test("expired or forbidden uploads stop retries and never report a saved photo",async()=>{
  const h=harness([intent,{status:409,body:{error:{message:"Upload expired"}}}]);h.select();await h.submit();const before=h.requests.length;await h.submit();assert.equal(h.states[1][0].blocked,true);assert.notEqual(h.states[1][0].status,"Uploaded");assert.equal(h.uploads.length,1);assert.equal(h.requests.length,before+1); // Only gallery refresh; no second create or finalize.
});
test("explicit transfer retry reauthorizes the original immutable intent",async()=>{
  const h=harness([intent,new Error("Interrupted"),{status:202,body:{data:{ready:false}}},intent,ready]);h.select();await h.submit();await h.transfer();
  const creates=h.requests.filter(r=>r.url==="/api/v1/media/intents");assert.equal(creates.length,2);
  assert.equal(creates[0].body,creates[1].body);assert.equal(creates[0].headers["Idempotency-Key"],creates[1].headers["Idempotency-Key"]);
  assert.equal(h.uploads.length,2);assert.equal(h.uploads[0],h.uploads[1]);assert.equal(h.states[1][0].status,"Uploaded");
});

test("explicit retry checks an already saved upload before retransmitting",async()=>{const h=harness([intent,new Error("Lost completion"),ready]);h.select();await h.submit();await h.transfer();assert.equal(h.uploads.length,1);assert.equal(h.requests.filter(r=>r.url==="/api/v1/media/intents").length,1);assert.equal(h.states[1][0].status,"Uploaded");});
