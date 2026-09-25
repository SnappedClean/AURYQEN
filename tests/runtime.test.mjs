import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createMemoryStorage} from '../runtime.mjs';

test('real graph execution produces branched outputs and recorded events',async()=>{
 const rt=createRuntime(createMemoryStorage());
 const run=await rt.runGraph(rt.snapshot().graph,'   Hello    Auryqen   ');
 assert.equal(run.status,'completed');
 assert.equal(run.outputs.n3,2);
 assert.equal(run.outputs.n4,'hello-auryqen');
 assert.ok(rt.snapshot().events.some(e=>e.type==='node.completed'));
});
test('graph validation rejects cycles, duplicate edges and multiple inputs',()=>{
 const rt=createRuntime(createMemoryStorage());
 const a={id:'a',capability:'text.trim'},b={id:'b',capability:'text.upper'},c={id:'c',capability:'text.slug'};
 assert.throws(()=>rt.validateGraph({nodes:[a,b],edges:[{from:'a',to:'b'},{from:'b',to:'a'}]}),/cycle/);
 assert.throws(()=>rt.validateGraph({nodes:[a,b],edges:[{from:'a',to:'b'},{from:'a',to:'b'}]}),/Duplicate/);
 assert.throws(()=>rt.validateGraph({nodes:[a,b,c],edges:[{from:'a',to:'c'},{from:'b',to:'c'}]}),/Multiple inputs/);
});
test('memory grants are enforced and data persists on new runtime instances',async()=>{
 const store=createMemoryStorage(),rt=createRuntime(store);
 await assert.rejects(rt.writeMemory('project','auryqen'),/Permission denied/);
 assert.ok(rt.snapshot().events.some(e=>e.type==='policy.denied'));
 rt.setGrant('memory.write',true);
 await rt.writeMemory('project','auryqen');
 assert.equal(await createRuntime(store).readMemory('project'),'auryqen');
});
test('workflow execution is denied by policy',async()=>{
 const rt=createRuntime(createMemoryStorage());
 rt.setGrant('workflow.run',false);
 await assert.rejects(rt.runGraph(rt.snapshot().graph,'hello'),/Permission denied/);
 assert.equal(rt.snapshot().runs.length,0);
});
test('recipe creation requires approval, exact test, and allowlisted instructions',async()=>{
 const rt=createRuntime(createMemoryStorage());
 const spec={name:'Headline formatter',steps:[{op:'trim'},{op:'upper'}],input:' hi ',expected:'HI'};
 assert.throws(()=>rt.publishRecipe(spec),/Permission denied/);
 rt.setGrant('recipe.publish',true);
 assert.throws(()=>rt.publishRecipe({...spec,expected:'WRONG'}),/test failed/);
 assert.throws(()=>rt.publishRecipe({...spec,steps:[{op:'eval'}]}),/Unsupported/);
 const id=rt.publishRecipe(spec);
 assert.equal(await rt.invoke(id,' ready '),'READY');
 assert.throws(()=>rt.publishRecipe(spec),/already exists/);
});
test('replay creates a distinct run using saved graph snapshot',async()=>{
 const rt=createRuntime(createMemoryStorage());
 const initial=await rt.runGraph(rt.snapshot().graph,'once');
 const g=rt.snapshot().graph;g.nodes[0].capability='text.upper';rt.setGraph(g);
 const replay=await rt.replay(initial.id);
 assert.equal(replay.status,'completed');
 assert.notEqual(replay.id,initial.id);
 assert.deepEqual(replay.outputs,initial.outputs);
});
test('invalid JSON produces a failed execution and audit event',async()=>{
 const rt=createRuntime(createMemoryStorage());
 const result=await rt.runGraph({name:'json',nodes:[{id:'parse',capability:'json.pretty',params:{}}],edges:[]},'{broken');
 assert.equal(result.status,'failed');
 assert.ok(rt.snapshot().events.some(e=>e.type==='run.failed'&&e.runId===result.id));
});