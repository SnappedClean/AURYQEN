// Public GitHub-backed cloud jobs and a transparent, manually reviewed ChatGPT relay.
// Never accepts or stores API keys. Issue contents and comments are PUBLIC.
const REPO = 'SnappedClean/AURYQEN';
const API = 'https://api.github.com/repos/' + REPO;
const TASK = '<!-- AURYQEN-CLOUD-TASK-V1 -->';
const RESULT = '<!-- AURYQEN-CLOUD-RESULT-V1 -->';
const RELAY = '<!-- AURYQEN-ECHO-RELAY-V1 -->';
const TICKS = String.fromCharCode(96).repeat(3);
const CAPABILITIES = [
  ['text.normalize','Normalize text'],
  ['text.upper','Uppercase text'],
  ['text.wordCount','Count words'],
  ['text.slug','Create slug'],
  ['json.pretty','Format JSON']
];
const safe = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const message = error => error?.message || String(error);
const issueLink = (title,body) => 'https://github.com/'+REPO+'/issues/new?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(body);
async function request(url) {
  const response=await fetch(url,{headers:{Accept:'application/vnd.github+json'}});
  if (!response.ok) throw Error(response.status===403?'GitHub public API rate limit reached. Try again later.':'GitHub returned HTTP '+response.status);
  return response.json();
}
function parseResult(body) {
  if (typeof body!=='string' || !body.startsWith(RESULT)) return null;
  const lines=body.split('\n');
  if(lines[1]!==TICKS+'json' || lines[3]!==TICKS) return null;
  try {return JSON.parse(lines[2]);} catch {return null;}
}
export function createCloudPanel(notice) {
  let records=[],loading=false,error='',checked=false;
  function issueCard(row) {
    const issue=row.issue, isTask=issue.body?.startsWith(TASK), result=row.comments.map(c=>parseResult(c.body)).find(Boolean);
    const status=isTask?(result?.status || 'Waiting for cloud execution'):'Waiting for manual ChatGPT review';
    const detail=isTask
      ? (result?'<pre class="result '+(result.status==='failed'?'error':'')+'">'+safe(JSON.stringify(result,null,2))+'</pre>':'<p>When the GitHub Actions job finishes, its real result appears here. Refresh to check.</p>')
      : '<p>'+safe(issue.body.slice(RELAY.length).trim().slice(0,800))+'</p>';
    const comments=row.comments.filter(c=>!parseResult(c.body)).slice(-4).map(c=>'<div class="item"><small>GitHub comment from '+safe(c.user?.login||'unknown')+'</small><p>'+safe(String(c.body||'').slice(0,1200))+'</p></div>').join('');
    return '<article class="panel cloud-card"><div class="split"><span class="badge '+(result?.status==='failed'?'warn':'')+'">'+safe(status)+'</span><small>#'+Number(issue.number)+' · '+safe(issue.created_at?.slice(0,10))+'</small></div><h3>'+safe(issue.title)+'</h3>'+detail+(comments?'<div class="list section">'+comments+'</div>':'')+'<div class="toolbar section"><a href="'+safe(issue.html_url)+'" target="_blank" rel="noopener noreferrer">Open public GitHub thread ↗</a><button data-cloud="copy" data-issue="'+Number(issue.number)+'">Copy ChatGPT handoff</button></div></article>';
  }
  function feed() {
    if (loading) return '<p>Loading actual GitHub issues and results…</p>';
    if (error) return '<div class="note">'+safe(error)+'</div>';
    if (!checked) return '<p>Load the public cloud task history to inspect actual execution results.</p>';
    if (!records.length) return '<p>No Auryqen cloud tasks yet. Create one above to run a capability on GitHub infrastructure.</p>';
    return records.map(issueCard).join('');
  }
  function render() {
    return '<div class="grid2"><div class="panel"><span class="tiny">REMOTE EXECUTION / GITHUB ACTIONS</span><h2>Run an actual cloud task</h2><p>Runs on GitHub, not on your Mac. Submit a bounded task through your GitHub account; the workflow posts a verifiable result back to the issue.</p><div class="form"><div><label for="cloud-cap">Capability</label><select id="cloud-cap">'+CAPABILITIES.map(([id,name])=>'<option value="'+id+'">'+safe(name)+'</option>').join('')+'</select></div><div><label for="cloud-input">Public task input (max 2,000 characters)</label><textarea id="cloud-input" maxlength="2000" placeholder="Type text to process on the cloud runner"></textarea></div><button id="cloud-submit" class="primary" data-cloud="task">Create cloud execution ↗</button></div><div class="note section">This opens a prefilled GitHub issue. Review it and press Submit on GitHub. The task and result are public; never enter private information. Only issues authored by the repository owner are executed.</div></div>'+
    '<div class="panel"><span class="tiny">CHATGPT ↔ AURYQEN / TRANSPARENT RELAY</span><h2>Send a message for ChatGPT</h2><p>The GitHub inbox lets ChatGPT access a message when you ask me to check Auryqen here. This is a real shared record, <b>not</b> an automatic AI connection or an embedded model.</p><div class="form"><div><label for="cloud-message">Public message</label><textarea id="cloud-message" maxlength="2000" placeholder="Auryqen task for ChatGPT…"></textarea></div><button class="primary" data-cloud="relay">Create message thread ↗</button><button data-cloud="chatgpt">Open ChatGPT ↗</button></div><div class="note section">After submitting, say “check Auryqen inbox” in ChatGPT. I can use the connected GitHub tools to read and respond to the thread. Actual two-way automatic chat requires a hosted model service or supported remote MCP connection.</div></div></div>'+
    '<div class="panel section"><div class="heading"><div><h2>Live cloud task and message history</h2><p>Fetched from GitHub Issues; includes actual runner results and public thread replies.</p></div><button data-cloud="refresh">↻ Refresh from GitHub</button></div><div id="cloud-feed" class="cloud-feed">'+feed()+'</div><p class="muted">Cloud jobs and conversations in this section are public. The browser-only Workbench remains available independently.</p></div>';
  }
  async function refresh() {
    if(loading)return;
    loading=true;error='';
    const node=document.querySelector('#cloud-feed');if(node)node.innerHTML=feed();
    try {
      const issues=await request(API+'/issues?state=all&per_page=40');
      const matching=issues.filter(i=>!i.pull_request&&(i.body?.startsWith(TASK)||i.body?.startsWith(RELAY))).slice(0,8);
      records=await Promise.all(matching.map(async issue=>{
        try {return {issue,comments:await request(API+'/issues/'+issue.number+'/comments?per_page=30')};}
        catch(e) {return {issue,comments:[]};}
      }));
      checked=true;
    } catch(e) {error=message(e);}
    finally {loading=false;const target=document.querySelector('#cloud-feed');if(target)target.innerHTML=feed();}
  }
  async function action(button) {
    const kind=button.dataset.cloud;
    if(kind==='refresh') return refresh();
    if(kind==='chatgpt') {window.open('https://chatgpt.com/','_blank','noopener,noreferrer');return;}
    if(kind==='copy') {
      const number=Number(button.dataset.issue);
      const prompt='Check my public AURYQEN GitHub issue #'+number+' at https://github.com/'+REPO+'/issues/'+number+'. Read the task and comments, and respond using the connected GitHub tools. Do not claim automatic AI integration.';
      await navigator.clipboard.writeText(prompt);notice('ChatGPT handoff copied. Paste it into this conversation.');return;
    }
    if(kind==='task') {
      const capability=document.querySelector('#cloud-cap')?.value;
      const input=document.querySelector('#cloud-input')?.value||'';
      if(!CAPABILITIES.some(c=>c[0]===capability)||!input.trim()||input.length>2000)throw Error('Choose a capability and enter 1–2,000 characters');
      const body=TASK+'\n'+TICKS+'json\n'+JSON.stringify({version:1,capability,input})+'\n'+TICKS+'\n\nPublic AURYQEN capability execution. Do not add credentials or private data.';
      window.open(issueLink('[AURYQEN TASK] '+capability,body),'_blank','noopener,noreferrer');
      notice('GitHub issue composer opened. Submit the issue there, then refresh cloud history.');
      return;
    }
    if(kind==='relay') {
      const value=document.querySelector('#cloud-message')?.value.trim()||'';
      if(!value||value.length>2000)throw Error('Enter a message of 1–2,000 characters');
      const body=RELAY+'\n\n'+value+'\n\nPublic AURYQEN ChatGPT handoff. This is not an automatic AI conversation.';
      window.open(issueLink('[AURYQEN / CHATGPT] '+value.slice(0,65),body),'_blank','noopener,noreferrer');
      notice('GitHub message composer opened. Submit it and ask ChatGPT to check the Auryqen inbox.');
    }
  }
  return {render,refresh,action};
}
