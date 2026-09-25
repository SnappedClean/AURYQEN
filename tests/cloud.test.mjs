import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTask,executeTask,resultBody,TASK_MARKER,RESULT_MARKER} from '../.github/scripts/cloud-task.mjs';
const envelope=(capability,input)=>TASK_MARKER+'\n'+String.fromCharCode(96).repeat(3)+'json\n'+JSON.stringify({version:1,capability,input})+'\n'+String.fromCharCode(96).repeat(3)+'\n';
test('owner cloud task contract normalizes actual text',()=>{
 const task=parseTask(envelope('text.normalize','   HELLO   AURYQEN  '));
 assert.deepEqual(executeTask(task),{text:'hello auryqen'});
});
test('each cloud capability executes a real deterministic operation',()=>{
 assert.deepEqual(executeTask(parseTask(envelope('text.upper','aBc'))),{text:'ABC'});
 assert.deepEqual(executeTask(parseTask(envelope('text.wordCount','  one  two\nthree '))),{count:3});
 assert.deepEqual(executeTask(parseTask(envelope('text.slug','  Café Auryqen!  '))),{slug:'cafe-auryqen'});
 assert.deepEqual(executeTask(parseTask(envelope('json.pretty','{"a":1}'))),{json:'{\n  "a": 1\n}'});
});
test('public cloud runner rejects unsupported actions and oversized or invalid input',()=>{
 assert.throws(()=>parseTask(envelope('code.execute','rm -rf /')),/not allowed/);
 assert.throws(()=>parseTask(envelope('text.normalize','a'.repeat(2001))),/2000/);
 assert.throws(()=>parseTask('not a task'),/Not a bounded/);
 assert.throws(()=>parseTask(envelope('text.normalize','a').replace('"version":1','"version":2')),/Invalid task contract/);
 assert.throws(()=>executeTask(parseTask(envelope('json.pretty','not JSON'))),SyntaxError);
});
test('result envelope contains real output and an explicit status',()=>{
 const result={version:1,status:'completed',capability:'text.wordCount',result:{count:2},issue:9};
 const body=resultBody(result);
 assert.ok(body.startsWith(RESULT_MARKER));
 assert.deepEqual(JSON.parse(body.split('\n')[2]),result);
});
