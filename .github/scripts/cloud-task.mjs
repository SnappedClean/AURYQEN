// Public, bounded cloud execution. No arbitrary code, external URLs, or credentials from issue bodies.
export const TASK_MARKER = '<!-- AURYQEN-CLOUD-TASK-V1 -->';
export const RESULT_MARKER = '<!-- AURYQEN-CLOUD-RESULT-V1 -->';
export const MAX_INPUT = 2000;
export const CLOUD_CAPABILITIES = Object.freeze([
  {id:'text.normalize',name:'Normalize text'},
  {id:'text.upper',name:'Uppercase text'},
  {id:'text.wordCount',name:'Count words'},
  {id:'text.slug',name:'Create slug'},
  {id:'json.pretty',name:'Format JSON'}
]);
export function parseTask(body) {
  if (typeof body !== 'string' || body.length > 10000 || !body.startsWith(TASK_MARKER)) throw Error('Not a bounded Auryqen task');
  const lines = body.split('\n');
  if (lines[1] !== '```json' || lines[3] !== '```') throw Error('Malformed task envelope');
  const task = JSON.parse(lines[2]);
  if (!task || typeof task !== 'object' || Array.isArray(task) || Object.keys(task).sort().join(',') !== 'capability,input,version' || task.version !== 1) throw Error('Invalid task contract');
  if (!CLOUD_CAPABILITIES.some(c => c.id === task.capability)) throw Error('Capability is not allowed on public cloud runner');
  if (typeof task.input !== 'string' || task.input.length > MAX_INPUT) throw Error('Input must be text up to 2000 characters');
  return task;
}
export function executeTask(task) {
  const value = task.input;
  switch(task.capability) {
    case 'text.normalize': return {text:value.trim().replace(/\s+/g,' ').toLowerCase()};
    case 'text.upper': return {text:value.toUpperCase()};
    case 'text.wordCount': return {count:value.trim() ? value.trim().split(/\s+/u).length : 0};
    case 'text.slug': return {slug:value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')};
    case 'json.pretty': return {json:JSON.stringify(JSON.parse(value),null,2)};
    default: throw Error('No implementation for capability');
  }
}
export function resultBody(record) {
  return RESULT_MARKER + '\n```json\n' + JSON.stringify(record) + '\n```\n';
}
async function main() {
  const fs = await import('node:fs/promises');
  const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
  const issue = event.issue;
  const repo = process.env.GITHUB_REPOSITORY;
  const owner = repo?.split('/')[0];
  if (!issue || !owner || issue.user?.login?.toLowerCase() !== owner.toLowerCase()) throw Error('Owner-authored tasks only');
  let record;
  try {
    const task = parseTask(issue.body);
    record = {version:1,status:'completed',capability:task.capability,result:executeTask(task),issue:issue.number};
  } catch (error) {
    record = {version:1,status:'failed',error:String(error.message||error).slice(0,200),issue:issue.number};
  }
  const response = await fetch('https://api.github.com/repos/'+repo+'/issues/'+issue.number+'/comments',{
    method:'POST',
    headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GITHUB_TOKEN,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
    body:JSON.stringify({body:resultBody(record)})
  });
  if (!response.ok) throw Error('GitHub comment failed: '+response.status);
  console.log('AURYQEN cloud task '+issue.number+': '+record.status);
}
if (process.argv[1] && import.meta.url === new URL('file://'+process.argv[1]).href) main().catch(e=>{console.error(e.message);process.exitCode=1});
