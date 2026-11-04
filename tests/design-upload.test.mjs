import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require=createRequire(import.meta.url),selection=require("../src/components/gallery/file-selection.ts");
function nodes(n,p){if(!n||typeof n!=="object")return[];if(Array.isArray(n))return n.flatMap(v=>nodes(v,p));return[...(p(n)?[n]:[]),...nodes(n.props?.children,p)];}
test("image uploads reject unsupported selections and retain immutable scope/key through 429 and uncertain completion",async()=>{
  const states=[],refs=[],requests=[],changes=[],busy=[];let s=0,r=0,transfers=0;
  class RequestError extends Error{constructor(message,status){super(message);this.status=status;}}
  const replies=[new RequestError("Rate limited",429),{id:"a".repeat(24),upload:{}},{ready:false},{ready:true,assetId:"c".repeat(24)}];
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useRef:v=>refs[r++]??(refs[r-1]={current:v}),useState(v){const i=s++;if(!(i in states))states[i]=v;return[states[i],v=>{states[i]=v;}];}};
  const context={React,exports:{},Error,crypto:{randomUUID:()=>"immutable-upload-key"},require(id){return id==="react"?React:id.includes("file-selection")?selection:{RequestError,async jsonRequest(url,method,body,key){requests.push({url,method,body,key});const next=replies.shift();if(next instanceof Error)throw next;return next;},async directUpload(){transfers++;throw Error("Lost upload response");}};}};
  runInNewContext(ts.transpileModule(readFileSync("src/components/designs/design-upload.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,context);
  function render(){s=0;r=0;return context.exports.DesignUpload({eventIds:["b".repeat(24)],disabled:false,onChange:id=>changes.push(id),onBusy:value=>busy.push(value)});}
  const picker=()=>nodes(render(),n=>n.type==="input")[0],button=()=>nodes(render(),n=>n.type==="button")[0];
  picker().props.onChange({target:{files:[{name:"card.svg",type:"image/svg+xml",size:50}],value:"card.svg"}});assert.equal(changes.length,0);assert.equal(button(),undefined);
  picker().props.onChange({target:{files:[{name:"card.png",type:"image/png",size:100}]}});assert.equal(changes.length,1);assert.equal(changes[0],undefined);
  await button().props.onClick();await button().props.onClick();assert.equal(changes.length,1);await button().props.onClick();
  const creates=requests.filter(r=>r.url==="/api/v1/media/intents");assert.equal(creates.length,2);assert(creates.every(r=>r.key==="immutable-upload-key"&&r.body.eventIds[0]==="b".repeat(24)&&r.body.purpose==="invitation"));assert.equal(transfers,1);assert.equal(changes.at(-1),"c".repeat(24));assert.equal(busy.at(-1),false);
});
