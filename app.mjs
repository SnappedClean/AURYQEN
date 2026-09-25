import {createRuntime,DOMAINS} from './runtime.mjs';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opt=(value,label,selected=false)=>'<option value="'+esc(value)+'"'+(selected?' selected':'')+'>'+esc(label)+'</option>';
let page='workbench',selectedNode='n1',selectedDomain='engine',draftInput='   Build something REAL with Auryqen!   ',lastRun=null,memoryResult='',busy=false;
let runtime,state;
function notice(message,error=false){const box=$('#toast');box.textContent=message;box.className=error?'error':'';box.style.display='block';clearTimeout(notice.timer);notice.timer=setTimeout(()=>box.style.display='none',4200)}
try{runtime=createRuntime(window.localStorage,()=>{state=runtime.snapshot();render()});state=runtime.snapshot()}catch(e){$('#content').textContent='Browser storage is unavailable. Allow site storage or use a normal browser tab: '+e.message;throw e}
const counts=()=>({capabilities:runtime.capabilities().length,runs:state.runs.length,memory:Object.keys(state.memory).length,events:state.events.length});
function banner(k,title,desc){return '<div class="hero"><div class="eyebrow">'+esc(k)+'</div><h1>'+esc(title)+'</h1><p>'+esc(desc)+'</p><span class="badge">Local runtime · browser persistent</span></div>'}
function stats(){const c=counts();return '<div class="stats">'+[['Capabilities',c.capabilities,'Executable operations'],['Executions',c.runs,'Recorded runs'],['Memory keys',c.memory,'Persisted locally'],['Events',c.events,'Actual event records']].map(row=>'<div class="stat"><small>'+row[0]+'</small><strong>'+row[1]+'</strong><p>'+row[2]+'</p></div>').join('')+'</div>'}
function events(limit=8){const ev=state.events.slice(-limit).reverse();return ev.length?'<div class="trace">'+ev.map(e=>'<div class="event"><span>#'+e.seq+'</span><span>'+esc(e.type)+'</span><span>'+esc(e.nodeId||e.action||e.capability||e.key||e.runId||e.error||e.id||'—')+'</span></div>').join('')+'</div>':'<p>No events recorded yet. Run a graph to generate them.</p>'}
function workbench(){
 const graph=state.graph,options=runtime.capabilities(),node=graph.nodes.find(n=>n.id===selectedNode)||graph.nodes[0];
 if(node)selectedNode=node.id;
 const path=graph.edges.map(edge=>{const a=graph.nodes.find(n=>n.id===edge.from),b=graph.nodes.find(n=>n.id===edge.to);if(!a||!b)return '';return '<path class="wire" d="M'+(Number(a.x)+190)+' '+(Number(a.y)+40)+' C'+(Number(a.x)+226)+' '+(Number(a.y)+40)+' '+(Number(b.x)-34)+' '+(Number(b.y)+40)+' '+Number(b.x)+' '+(Number(b.y)+40)+'"/>'}).join('');
 const nodes=graph.nodes.map(n=>{const cap=options.find(c=>c.id===n.capability);return '<button class="node '+(n.id===selectedNode?'selected':'')+'" data-node="'+esc(n.id)+'" style="left:'+Math.max(0,Math.min(590,Number(n.x)||0))+'px;top:'+Math.max(0,Math.min(220,Number(n.y)||0))+'px"><span class="port left"></span><span class="sub">'+esc(n.id)+'</span><strong>'+esc(cap?.name||n.capability)+'</strong><small>'+esc(n.capability)+'</small><span class="port right"></span></button>'}).join('');
 const choices=graph.nodes.map(n=>opt(n.id,n.id+' · '+n.capability)).join('');
 const nodeChoices=options.map(c=>opt(c.id,c.name+' ('+c.id+')',node&&node.capability===c.id)).join('');
 const results=lastRun?JSON.stringify({run:lastRun.id,status:lastRun.status,outputs:lastRun.outputs,error:lastRun.error},null,2):'No result yet. Run the graph to execute every connected capability.';
 return banner('01 / EXECUTION WORKBENCH','Make capabilities do work.','This is an executable directed graph. Edit nodes and connections, run real transformations, then inspect recorded outputs and events.')+stats()+
 '<div class="heading"><div><h2>Live capability graph</h2><p>Nodes are executed in dependency order. Branches reuse actual upstream results.</p></div><div class="toolbar"><button id="run" class="primary" '+(busy?'disabled':'')+'>'+(busy?'Running…':'▶ Run graph')+'</button><button id="replay" '+(!lastRun||busy?'disabled':'')+'>↺ Replay run</button></div></div>'+
 '<div class="grid2"><div class="panel"><div class="canvas"><div class="scene"><svg viewBox="0 0 790 315" aria-label="Graph edges">'+path+'</svg>'+nodes+'</div></div><div class="form section"><div><label for="input">Workflow input</label><textarea id="input" maxlength="10000">'+esc(draftInput)+'</textarea></div><div class="row"><select id="add-cap" aria-label="Capability to add">'+options.map(c=>opt(c.id,c.name)).join('')+'</select><button id="add-node">+ Add node</button></div><div class="row"><select id="edge-from" aria-label="Connect from">'+choices+'</select><select id="edge-to" aria-label="Connect to">'+choices+'</select><button id="add-edge">Connect</button></div><div class="split">'+graph.edges.map(e=>'<button class="smallbtn" data-remove-edge="'+esc(e.from+'|'+e.to)+'">× '+esc(e.from)+' → '+esc(e.to)+'</button>').join('')+'</div></div></div>'+
 '<div class="panel"><h3>Selected node / '+esc(node?.id||'—')+'</h3><p>Inspect and configure a real capability invocation.</p><div class="form"><div><label for="edit-cap">Capability</label><select id="edit-cap">'+nodeChoices+'</select></div><div><label for="param-key">Memory key (memory capabilities)</label><input id="param-key" value="'+esc(node?.params?.key||'')+'" placeholder="e.g. project-name"></div><div><label for="param-ms">Wait milliseconds (0–2500)</label><input id="param-ms" type="number" min="0" max="2500" value="'+esc(node?.params?.ms??350)+'"></div><div class="row"><button id="save-node">Save node</button><button id="delete-node" class="danger">Delete node</button></div></div><div class="section"><h3>Current result</h3><pre class="result '+(lastRun?.status==='failed'?'error':'')+'">'+esc(results)+'</pre></div></div></div>'+
 '<div class="grid2 section"><div class="panel"><h3>Recent execution events</h3>'+events(9)+'</div><div class="panel"><h3>Run history</h3><div class="list">'+(state.runs.slice(0,5).map(r=>'<button class="item" data-history="'+esc(r.id)+'"><b>'+esc(r.id)+'</b><small>'+esc(r.status)+' · '+esc(r.time)+' · '+r.graph.nodes.length+' nodes</small></button>').join('')||'<p>No runs yet.</p>')+'</div></div></div>';
}
function architecture(){
 const d=DOMAINS.find(d=>d.id===selectedDomain)||DOMAINS[0],c=counts();
 const metrics={engine:c.runs+' runs',models:'0 connected models',memory:c.memory+' stored keys',capabilities:c.capabilities+' runnable capabilities',permissions:Object.values(state.grants).filter(Boolean).length+' enabled grants',events:c.events+' events',interfaces:'7 active views'};
 return banner('02 / SYSTEM MAP','One architecture. Many capabilities.','Explore each domain and inspect its current working status. The metrics below are read from this browser runtime, not simulated data.')+
 '<div class="architecture"><div class="panel"><div class="architecture-map">'+DOMAINS.map(x=>'<button class="'+(x.id==='engine'?'core ':'')+(selectedDomain===x.id?'active':'')+'" data-domain="'+x.id+'">'+esc(x.name)+'<small>'+esc(metrics[x.id])+'</small></button>').join('')+'</div><p style="font-size:11px">Select a component to inspect it. All operational domains are coordinated by the execution engine; model integration is not configured.</p></div>'+
 '<div class="panel"><span class="tiny">SELECTED DOMAIN</span><h2>'+esc(d.name)+'</h2><p>'+esc(d.role)+'</p><h3>Subsystem responsibilities</h3><div class="list">'+d.details.map((x,i)=>'<div class="item"><b>'+String(i+1).padStart(2,'0')+' / '+esc(x)+'</b></div>').join('')+'</div><div class="section"><span class="badge">'+esc(metrics[d.id])+'</span></div><div class="section"><button data-view="workbench" class="primary">Open live execution ↗</button></div></div></div>';
}
function capabilities(){
 const caps=runtime.capabilities();
 return banner('03 / CAPABILITY REGISTRY','Build reusable actions.','The Forge creates bounded transformation recipes. A recipe must pass its exact-output test and have publication permission before becoming executable.')+
 '<div class="grid2"><div class="panel"><div class="heading"><h2>Registered capabilities</h2><span class="badge">'+caps.length+' executable</span></div><div class="list">'+caps.map(c=>'<div class="item"><b>'+esc(c.name)+'</b><small>'+esc(c.id)+' · '+esc(c.group)+' · '+esc(c.detail)+'</small></div>').join('')+'</div></div><div class="panel"><h2>Capability Forge</h2><p>Compose approved instructions only. No arbitrary JavaScript or Python execution.</p><div class="form"><div><label for="recipe-name">New capability name</label><input id="recipe-name" value="Headline formatter" maxlength="60"></div><div><label for="recipe-steps">Recipe operations (JSON)</label><textarea id="recipe-steps" style="min-height:138px">[\n  {"op":"trim"},\n  {"op":"collapse"},\n  {"op":"upper"}\n]</textarea></div><div><label for="recipe-input">Test input</label><input id="recipe-input" value="  hello   auryqen  "></div><div><label for="recipe-expected">Exact expected output</label><input id="recipe-expected" value="HELLO AURYQEN"></div><button id="publish" class="primary">Test & approve capability</button></div><div class="note section">To publish, enable <b>recipe.publish</b> under Permissions. Prefix and suffix instructions may include a string "value" (maximum 100 characters). Each recipe contains 1–12 operations.</div></div></div>';
}
function memory(){
 const keys=Object.entries(state.memory);
 return banner('04 / MEMORY','Store state. Retrieve context.','This is real local browser persistence, scoped to this site and browser profile. It is not a shared database, encrypted vault, or remote memory service.')+
 '<div class="grid2"><div class="panel"><h2>Workspace memory</h2><div class="list">'+(keys.map(([k,v])=>'<div class="kv"><strong>'+esc(k)+'</strong><code>'+esc(String(v).slice(0,100))+'</code></div>').join('')||'<p>No saved memory yet.</p>')+'</div></div><div class="panel"><h2>Memory operations</h2><div class="form"><div><label for="memory-key">Key</label><input id="memory-key" placeholder="project-goal" maxlength="100"></div><div><label for="memory-value">Value</label><textarea id="memory-value" maxlength="10000" placeholder="Auryqen capability architecture"></textarea></div><div class="row"><button id="memory-save" class="primary">Write memory</button><button id="memory-read">Read key</button></div></div><div class="section"><h3>Read result</h3><pre class="result">'+esc(memoryResult||'No key read yet.')+'</pre></div><div class="note section">Memory writing is denied until you explicitly grant <b>memory.write</b> in Permissions. Do not enter secrets into public-site browser storage.</div></div></div>';
}
function eventView(){
 return banner('05 / EVENT FABRIC','Inspect what actually happened.','Every run, node completion, memory operation, policy decision, and capability publication emits a recorded event.')+
 '<div class="panel"><div class="heading"><h2>Execution and policy history</h2><span class="badge">'+state.events.length+' retained / last 250</span></div>'+events(250)+'</div>';
}
function access(){
 const explain={'workflow.run':'Permit execution of capability graphs.','memory.read':'Permit lookup of local workspace memory.','memory.write':'Permit changes to local workspace memory.','recipe.publish':'Permit registration of tested transformation recipes.'};
 return banner('06 / TRUST PLANE','Authority precedes action.','These are enforced local workspace grants. They demonstrate a policy boundary but do not constitute identity verification or multi-user security.')+
 '<div class="grid2"><div class="panel"><h2>Local operation grants</h2><div class="section">'+Object.entries(state.grants).map(([id,on])=>'<label class="toggle-row"><span><strong>'+esc(id)+'</strong><small>'+esc(explain[id])+'</small></span><input type="checkbox" data-grant="'+esc(id)+'" '+(on?'checked':'')+' aria-label="Allow '+esc(id)+'"></label>').join('')+'</div></div><div class="panel"><h2>Policy event stream</h2><p>Try denying workflow.run and executing a graph, or enabling memory.write before saving a value. Denials are recorded.</p>'+events(12)+'<div class="note section">A public browser cannot protect against its own user or developer tools. Never treat these toggles as remote access control. A real deployed backend must authenticate requests and enforce authorization independently.</div></div></div>';
}
function models(){
 return banner('07 / MODEL LAYER','Model-independent by design.','The AI adapter is intentionally unconfigured in this public build. No key collection, imaginary inference, or hidden third-party account is involved.')+
 '<div class="grid3">'+[['Local inference','Not connected','A future private/local model worker can implement the model contract.'],['Remote inference','Not connected','Provider credentials must stay on a private server, never in GitHub Pages JavaScript.'],['Tool proposals','Architecture defined','Model-suggested actions must go through the engine and permission checks.']].map(x=>'<div class="panel"><span class="badge warn">'+x[1]+'</span><h2>'+x[0]+'</h2><p>'+x[2]+'</p></div>').join('')+'</div><div class="panel section"><h2>What works right now</h2><p>Graphs execute deterministic operations, memory is persisted, new recipes can be tested and approved, and the event stream is real. Connecting an LLM or a multi-user hosted runtime is a separate integration milestone—not a claim made by this website.</p><button data-view="workbench" class="primary">Run the engine</button></div>';
}
function render(){
 if(!state)return;
 $('#crumb').textContent=page.toUpperCase();
 document.querySelectorAll('.nav [data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===page);b.setAttribute('aria-current',b.dataset.view===page?'page':'false')});
 $('#content').innerHTML=({workbench,architecture,capabilities,memory,events:eventView,access,models}[page]||workbench)();
}
function act(fn){try{const result=fn();if(result&&typeof result.then==='function')return result.catch(e=>notice(String(e.message||e),true));return result}catch(e){notice(String(e.message||e),true)}}
async function run(replay=false){
 if(busy)return;busy=true;render();
 try{lastRun=replay&&lastRun?await runtime.replay(lastRun.id):await runtime.runGraph(state.graph,draftInput);notice(lastRun.status==='completed'?'Execution completed: '+lastRun.id:'Execution failed: '+lastRun.error,lastRun.status!=='completed')}
 catch(e){notice(e.message,true)}finally{busy=false;state=runtime.snapshot();render()}
}
document.querySelectorAll('.nav [data-view]').forEach(b=>b.addEventListener('click',()=>{page=b.dataset.view;render()}));
$('#content').addEventListener('input',e=>{if(e.target.id==='input')draftInput=e.target.value});
$('#content').addEventListener('change',e=>{if(e.target.dataset.grant)act(()=>runtime.setGrant(e.target.dataset.grant,e.target.checked))});
$('#content').addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.view){page=b.dataset.view;render();return}
 if(b.dataset.domain){selectedDomain=b.dataset.domain;render();return}
 if(b.dataset.node){selectedNode=b.dataset.node;render();return}
 if(b.dataset.history){lastRun=state.runs.find(r=>r.id===b.dataset.history);render();return}
 if(b.dataset.removeEdge){act(()=>{const [from,to]=b.dataset.removeEdge.split('|'),g=structuredClone(state.graph);g.edges=g.edges.filter(x=>x.from!==from||x.to!==to);runtime.setGraph(g)});return}
 switch(b.id){
  case 'run':run();break;
  case 'replay':run(true);break;
  case 'add-node':act(()=>{const g=structuredClone(state.graph),id='n'+Math.max(0,...g.nodes.map(n=>Number(n.id.slice(1))||0).filter(Number.isFinite))+1;g.nodes.push({id,capability:$('#add-cap').value,x:20+235*((g.nodes.length-1)%3),y:30+120*(Math.floor((g.nodes.length-1)/3)%2),params:{}});runtime.setGraph(g);selectedNode=id;render()});break;
  case 'add-edge':act(()=>{const g=structuredClone(state.graph);g.edges.push({from:$('#edge-from').value,to:$('#edge-to').value});runtime.setGraph(g)});break;
  case 'delete-node':act(()=>{const g=structuredClone(state.graph);if(g.nodes.length<2)throw Error('Keep at least one node.');g.nodes=g.nodes.filter(n=>n.id!==selectedNode);g.edges=g.edges.filter(x=>x.from!==selectedNode&&x.to!==selectedNode);runtime.setGraph(g);selectedNode=g.nodes[0].id;render()});break;
  case 'save-node':act(()=>{const g=structuredClone(state.graph),n=g.nodes.find(n=>n.id===selectedNode);n.capability=$('#edit-cap').value;n.params={key:$('#param-key').value,ms:Number($('#param-ms').value)};runtime.setGraph(g);notice('Node configuration saved')});break;
  case 'publish':act(()=>{const id=runtime.publishRecipe({name:$('#recipe-name').value,steps:JSON.parse($('#recipe-steps').value),input:$('#recipe-input').value,expected:$('#recipe-expected').value});notice('Approved and registered '+id)});break;
  case 'memory-save':act(async()=>{await runtime.writeMemory($('#memory-key').value,$('#memory-value').value);notice('Memory persisted locally')});break;
  case 'memory-read':act(async()=>{const key=$('#memory-key').value;memoryResult=JSON.stringify({key,value:await runtime.readMemory(key)},null,2);render()});break;
 }
});
$('#export').addEventListener('click',()=>act(()=>{const data=runtime.exportState(),blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='auryqen-workspace.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Workspace JSON exported')}));
render();