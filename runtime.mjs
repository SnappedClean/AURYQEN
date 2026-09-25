// AURYQEN public browser runtime. Dependency-free, local-first, no remote credentials.
export const BUILTINS = Object.freeze([
  {id:'text.trim',name:'Trim text',group:'Text',detail:'Remove leading and trailing whitespace.'},
  {id:'text.collapse',name:'Collapse whitespace',group:'Text',detail:'Normalize repeated whitespace to one space.'},
  {id:'text.lower',name:'Lowercase',group:'Text',detail:'Convert text to lowercase.'},
  {id:'text.upper',name:'Uppercase',group:'Text',detail:'Convert text to uppercase.'},
  {id:'text.slug',name:'Create slug',group:'Text',detail:'Produce a URL-friendly identifier.'},
  {id:'text.words',name:'Word count',group:'Analysis',detail:'Return a numeric count of words.'},
  {id:'json.pretty',name:'Format JSON',group:'Data',detail:'Parse and format JSON; invalid JSON fails.'},
  {id:'memory.read',name:'Read memory',group:'Memory',detail:'Read a key from this browser workspace.'},
  {id:'memory.write',name:'Write memory',group:'Memory',detail:'Persist a key/value in this browser after authorization.'},
  {id:'time.wait',name:'Wait',group:'Execution',detail:'Perform a real, bounded asynchronous wait.'}
]);
export const DOMAINS = [
  {id:'engine',name:'Execution Engine',role:'Orders work, dispatches capabilities, records runs and handles failures.',details:['Graph validation and topological sorting','Typed output checks','Run snapshots and replay','Execution event emission']},
  {id:'models',name:'AI Models',role:'A future model router with local and remote adapters. No model is connected in this public build.',details:['Provider-agnostic interface','Context assembly','Tool proposals require authorization','Server-side secrets only']},
  {id:'memory',name:'Memory',role:'Persists this browser workspace and retrieves its keyed state.',details:['Origin-scoped localStorage','Explicit memory read/write','Exportable workspace snapshot','No remote synchronization']},
  {id:'capabilities',name:'Capabilities',role:'Executes built-in operations and approved bounded transformation recipes.',details:['Typed capability registry','Fixed allowlisted recipe instructions','No arbitrary code execution','Explicit publication gate']},
  {id:'permissions',name:'Permissions',role:'Enforces local workspace grants before run, write and publication.',details:['Policy checks on every protected invocation','Denied operations emit events','Local controls are not multi-user authentication','Server must enforce its own policies']},
  {id:'events',name:'Event System',role:'Records actual execution, memory, approval and failure events.',details:['Append-only bounded browser event log','Subscriber notifications','Run and node correlation','No remote queues or webhooks yet']},
  {id:'interfaces',name:'Interfaces',role:'Exposes the same runtime to the visual workbench, inspector and controls.',details:['Interactive architecture map','Graph execution and replay','Capability forge and trace','Browser workspace export']}
];
const STORAGE_KEY = 'auryqen-public-workspace-v1';
const DEFAULT_GRAPH = {
 name:'First capability graph',
 nodes:[
  {id:'n1',capability:'text.trim',x:20,y:104,params:{}},
  {id:'n2',capability:'text.collapse',x:255,y:104,params:{}},
  {id:'n3',capability:'text.words',x:505,y:35,params:{}},
  {id:'n4',capability:'text.slug',x:505,y:165,params:{}}
 ],
 edges:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n2',to:'n4'}]
};
const baseState=()=>({
 version:1,grants:{'workflow.run':true,'memory.read':true,'memory.write':false,'recipe.publish':false},
 memory:{},recipes:{},graph:clone(DEFAULT_GRAPH),runs:[],events:[],sequence:0
});
const clone=x=>JSON.parse(JSON.stringify(x));
const slug=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const text=x=>{if(typeof x!=='string')throw Error('This capability requires text input.');if(x.length>10000)throw Error('Input exceeds 10,000 characters.');return x};
const recipeOps = ['trim','collapse','lower','upper','slug','prefix','suffix'];
export function createMemoryStorage(){
 const data=new Map();
 return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
}
export function createRuntime(storage=globalThis.localStorage,onChange=()=>{}){
 let state;
 try{
   const raw=storage.getItem(STORAGE_KEY);
   const parsed=raw?JSON.parse(raw):null;
   state=parsed&&parsed.version===1&&parsed.grants&&parsed.graph&&parsed.memory&&parsed.recipes&&Array.isArray(parsed.runs)&&Array.isArray(parsed.events)?parsed:baseState();
 }catch{state=baseState()}
 const save=()=>{storage.setItem(STORAGE_KEY,JSON.stringify(state));onChange(clone(state))};
 const event=(type,payload={})=>{
   const entry={seq:++state.sequence,time:new Date().toISOString(),type,...clone(payload)};
   state.events.push(entry);
   if(state.events.length>250)state.events=state.events.slice(-250);
   save();return entry;
 };
 const guard=action=>{
   if(state.grants[action]!==true){event('policy.denied',{action,reason:'Local grant is disabled'});throw Error('Permission denied: '+action+'. Enable it in Access.')}
   event('policy.allowed',{action});
 };
 const capabilities=()=>[...BUILTINS,...Object.entries(state.recipes).filter(([,r])=>r.status==='approved').map(([id,r])=>({id,name:r.name,group:'Forge',detail:r.steps.map(s=>s.op).join(' → ')}))];
 const recipeRun=(steps,input)=>{
   let value=text(input);
   for(const step of steps){
     switch(step.op){
       case 'trim':value=value.trim();break;
       case 'collapse':value=value.replace(/\s+/g,' ');break;
       case 'lower':value=value.toLowerCase();break;
       case 'upper':value=value.toUpperCase();break;
       case 'slug':value=slug(value);break;
       case 'prefix':value=step.value+value;break;
       case 'suffix':value=value+step.value;break;
       default:throw Error('Unrecognized recipe operation');
     }
   }
   return value;
 };
 async function invoke(id,input,params={},runId=null,nodeId=null){
   const identity={runId,nodeId,capability:id};
   if(id==='memory.write'||id==='memory.read')guard(id);
   const recipe=state.recipes[id];
   if(recipe){
     if(recipe.status!=='approved')throw Error('Capability is not approved: '+id);
     return recipeRun(recipe.steps,input);
   }
   if(!BUILTINS.some(x=>x.id===id))throw Error('Unknown capability: '+id);
   switch(id){
     case 'text.trim':return text(input).trim();
     case 'text.collapse':return text(input).replace(/\s+/g,' ');
     case 'text.lower':return text(input).toLowerCase();
     case 'text.upper':return text(input).toUpperCase();
     case 'text.slug':return slug(text(input));
     case 'text.words':return (text(input).trim().match(/\S+/g)||[]).length;
     case 'json.pretty':return JSON.stringify(JSON.parse(text(input)),null,2);
     case 'memory.read':{
       const key=text(params.key||input).trim();
       if(!key||key.length>100)throw Error('Memory key must be 1–100 characters.');
       const value=Object.prototype.hasOwnProperty.call(state.memory,key)?state.memory[key]:null;
       event('memory.read',{...identity,key,found:value!==null});
       return value===null?'':value;
     }
     case 'memory.write':{
       const key=text(params.key||'').trim();
       if(!key||key.length>100||['__proto__','prototype','constructor'].includes(key))throw Error('Supply a valid memory key (1–100 characters).');
       const value=text(input);
       state.memory[key]=value;
       event('memory.written',{...identity,key,length:value.length});
       return value;
     }
     case 'time.wait':{
       const ms=Number(params.ms===undefined?350:params.ms);
       if(!Number.isInteger(ms)||ms<0||ms>2500)throw Error('Wait must be 0–2500 milliseconds.');
       await new Promise(resolve=>setTimeout(resolve,ms));
       return text(input);
     }
   }
 }
 function validateGraph(graph){
   if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||graph.nodes.length<1||graph.nodes.length>30||graph.edges.length>60)throw Error('Graph must have 1–30 nodes and at most 60 edges.');
   const nodes=new Map();
   for(const n of graph.nodes){
     if(!n||typeof n.id!=='string'||!/^[\w-]{1,40}$/.test(n.id)||nodes.has(n.id))throw Error('Node IDs must be unique and valid.');
     if(typeof n.capability!=='string'||!capabilities().some(c=>c.id===n.capability))throw Error('Unavailable capability on node '+n.id);
     nodes.set(n.id,n);
   }
   const incoming=new Map([...nodes.keys()].map(k=>[k,0])),adj=new Map([...nodes.keys()].map(k=>[k,[]]));
   for(const edge of graph.edges){
     if(!nodes.has(edge.from)||!nodes.has(edge.to)||edge.from===edge.to)throw Error('Invalid edge reference.');
     if(adj.get(edge.from).includes(edge.to))throw Error('Duplicate edge.');
     adj.get(edge.from).push(edge.to);incoming.set(edge.to,incoming.get(edge.to)+1);
     if(incoming.get(edge.to)>1)throw Error('Multiple inputs are not supported yet.');
   }
   const queue=[...incoming].filter(([,v])=>v===0).map(([k])=>k),order=[];
   while(queue.length){const id=queue.shift();order.push(id);for(const to of adj.get(id)){incoming.set(to,incoming.get(to)-1);if(incoming.get(to)===0)queue.push(to)}}
   if(order.length!==nodes.size)throw Error('Graph contains a cycle.');
   return order;
 }
 function setGraph(graph){
   validateGraph(graph);state.graph=clone(graph);event('graph.saved',{nodes:graph.nodes.length,edges:graph.edges.length});return snapshot();
 }
 async function runGraph(graph,input){
   guard('workflow.run');
   text(input);
   const order=validateGraph(graph),runId='run-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
   const run={id:runId,time:new Date().toISOString(),status:'running',input,graph:clone(graph),outputs:{},error:null};
   state.runs.unshift(run);state.runs=state.runs.slice(0,35);
   event('run.started',{runId,nodes:order.length});
   const previous=new Map(graph.edges.map(e=>[e.to,e.from]));
   try{
     for(const nodeId of order){
       const node=graph.nodes.find(n=>n.id===nodeId),source=previous.get(nodeId);
       const value=source===undefined?input:run.outputs[source];
       event('node.started',{runId,nodeId,capability:node.capability});
       const result=await invoke(node.capability,value,node.params||{},runId,nodeId);
       run.outputs[nodeId]=result;
       event('node.completed',{runId,nodeId,result:clone(result)});
     }
     run.status='completed';event('run.completed',{runId,outputs:clone(run.outputs)});
   }catch(err){run.status='failed';run.error=String(err.message||err);event('run.failed',{runId,error:run.error})}
   save();return clone(run);
 }
 async function replay(id){
   const old=state.runs.find(r=>r.id===id);
   if(!old)throw Error('Run not found.');
   event('run.replay.requested',{sourceRunId:id});return runGraph(old.graph,old.input);
 }
 function setGrant(id,allowed){
   if(!Object.prototype.hasOwnProperty.call(state.grants,id))throw Error('Unknown policy');
   state.grants[id]=Boolean(allowed);
   event('policy.changed',{action:id,allowed:Boolean(allowed)});
 }
 function writeMemory(key,value){return invoke('memory.write',value,{key})}
 function readMemory(key){return invoke('memory.read',key,{key})}
 function publishRecipe({name,steps,input,expected}){
   guard('recipe.publish');
   if(typeof name!=='string'||name.trim().length<3||name.length>60)throw Error('Recipe name must be 3–60 characters.');
   if(!Array.isArray(steps)||steps.length<1||steps.length>12)throw Error('Recipe requires 1–12 operations.');
   for(const s of steps){
     if(!s||!recipeOps.includes(s.op))throw Error('Unsupported recipe instruction.');
     if(['prefix','suffix'].includes(s.op)&&(typeof s.value!=='string'||s.value.length>100))throw Error('Prefix/suffix must have a string value of at most 100 characters.');
   }
   const actual=recipeRun(steps,input);
   if(actual!==expected){event('recipe.test.failed',{name:name.trim(),actual});throw Error('Recipe test failed. Actual output: '+actual)}
   const id='recipe.'+slug(name);
   if(id==='recipe.'||state.recipes[id])throw Error('A recipe with that name already exists.');
   const record={name:name.trim(),steps:clone(steps),status:'approved',created:new Date().toISOString(),test:{input,expected}};
   state.recipes[id]=record;event('recipe.published',{id,name:record.name});return id;
 }
 function exportState(){event('workspace.exported');return JSON.stringify(snapshot(),null,2)}
 function snapshot(){return clone(state)}
 return {snapshot,capabilities,invoke,validateGraph,setGraph,runGraph,replay,setGrant,writeMemory,readMemory,publishRecipe,exportState};
}