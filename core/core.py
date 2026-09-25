"""AURYQEN public-source local core: one registry, policy boundary, task log and event store."""
from __future__ import annotations
import json
import os
import re
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from contextlib import contextmanager

MAX_TEXT = 10000
MAX_PAYLOAD = 30000
CAPABILITIES = {
    "workspace.describe": {"name": "Describe workspace", "description": "Describe the local capability runtime.", "kind": "read", "required": ["workspace.describe"]},
    "directory.inspect": {"name": "Inspect directory", "description": "List names and metadata under the configured allowed directory only.", "kind": "read", "required": ["directory.inspect"]},
    "text.normalize": {"name": "Normalize text", "description": "Trim, lowercase and collapse spaces.", "kind": "pure", "required": ["text.normalize"]},
    "memory.read": {"name": "Read memory", "description": "Read an exact workspace memory key.", "kind": "read", "required": ["memory.read"]},
    "memory.write": {"name": "Write memory", "description": "Persist a workspace memory value only after owner approval.", "kind": "write", "required": ["memory.write"], "approval": True},
}

def uid(prefix): return prefix + '_' + uuid.uuid4().hex[:20]
def now(): return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
def compact(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

class AuryqenError(ValueError): pass

class Core:
    def __init__(self, db_path=None, allowed_root=None):
        self.db_path = Path(db_path or os.environ.get('AURYQEN_DB', Path.home()/'.auryqen'/'core.db')).expanduser().resolve()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.root = Path(allowed_root or os.environ.get('AURYQEN_ALLOWED_ROOT', Path(__file__).resolve().parent)).expanduser().resolve()
        if not self.root.is_dir(): raise AuryqenError('Configured allowed root must exist and be a directory')
        self._lock = threading.RLock()
        self._init()

    @contextmanager
    def tx(self):
        with self._lock:
            c = sqlite3.connect(str(self.db_path), timeout=10)
            c.row_factory = sqlite3.Row
            c.execute('PRAGMA foreign_keys=ON')
            try:
                yield c
                c.commit()
            except Exception:
                c.rollback(); raise
            finally:
                c.close()

    def _init(self):
        with self.tx() as c:
            c.execute('PRAGMA journal_mode=WAL')
            c.executescript('''
              CREATE TABLE IF NOT EXISTS grants(principal TEXT NOT NULL, capability TEXT NOT NULL, PRIMARY KEY(principal,capability));
              CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,principal TEXT NOT NULL,caller TEXT NOT NULL,capability TEXT NOT NULL,input_json TEXT NOT NULL,status TEXT NOT NULL,result_json TEXT,error TEXT,conversation_id TEXT,created TEXT NOT NULL,updated TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id), status TEXT NOT NULL, created TEXT NOT NULL, resolved TEXT);
              CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, type TEXT NOT NULL, payload_json TEXT NOT NULL, created TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS memory(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, title TEXT NOT NULL, created TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id), role TEXT NOT NULL,content TEXT NOT NULL,task_id TEXT,created TEXT NOT NULL);
            ''')
            # These are least-privilege *local owner and attached MCP client* defaults.
            for principal in ('owner', 'mcp:local'):
                for capability in CAPABILITIES:
                    c.execute('INSERT OR IGNORE INTO grants VALUES (?,?)',(principal,capability))
            c.execute("UPDATE tasks SET status='interrupted', updated=? WHERE status IN ('running','queued')",(now(),))

    def _emit(self,c,event_type,task_id=None,payload=None):
        c.execute('INSERT INTO events(task_id,type,payload_json,created) VALUES (?,?,?,?)',(task_id,event_type,compact(payload or {}),now()))

    def _validate(self,cap,payload):
        if cap not in CAPABILITIES: raise AuryqenError('Unknown capability: '+str(cap))
        if not isinstance(payload,dict) or len(compact(payload))>MAX_PAYLOAD: raise AuryqenError('Expected bounded JSON object')
        if cap=='directory.inspect':
            if set(payload)-{'path'}: raise AuryqenError('Unexpected directory input field')
            path=payload.get('path','.')
            if not isinstance(path,str) or len(path)>1000 or not path: raise AuryqenError('Invalid directory path')
            if Path(path).is_absolute(): raise AuryqenError('Use a path relative to the allowed root')
            target=(self.root/path).resolve(strict=True)
            if not target.is_relative_to(self.root) or not target.is_dir():raise AuryqenError('Directory is outside the allowed root or is not a directory')
        elif cap=='text.normalize':
            if set(payload)!={'text'} or not isinstance(payload['text'],str) or len(payload['text'])>MAX_TEXT:raise AuryqenError('text.normalize requires text up to 10,000 characters')
        elif cap in ('memory.read','memory.write'):
            required={'key','value'} if cap=='memory.write' else {'key'}
            if set(payload)!=required:raise AuryqenError('Invalid memory fields')
            key=payload['key']
            if not isinstance(key,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,100}',key):raise AuryqenError('Memory key must be 1–100 letters, digits, dots, hyphens or underscores')
            if cap=='memory.write' and (not isinstance(payload['value'],str) or len(payload['value'])>MAX_TEXT):raise AuryqenError('Memory value must be text up to 10,000 characters')
        elif payload:raise AuryqenError('This capability has no input parameters')

    def submit(self,principal,capability,payload=None,caller='api',conversation_id=None):
        payload=payload if payload is not None else {}
        self._validate(capability,payload)
        if not isinstance(principal,str) or not re.fullmatch(r'[A-Za-z0-9:._-]{1,80}',principal):raise AuryqenError('Invalid principal')
        if not isinstance(caller,str) or len(caller)>100:raise AuryqenError('Invalid caller')
        if conversation_id is not None and not self.conversation_exists(conversation_id):raise AuryqenError('Unknown conversation')
        id=uid('task');stamp=now()
        with self.tx() as c:
            c.execute('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?)',(id,principal,caller,capability,compact(payload),'created',None,None,conversation_id,stamp,stamp))
            self._emit(c,'task.created',id,{'capability':capability,'principal':principal,'caller':caller})
            row=c.execute('SELECT 1 FROM grants WHERE principal=? AND capability=?',(principal,capability)).fetchone()
            if not row:
                c.execute("UPDATE tasks SET status='rejected',error=?,updated=? WHERE id=?",('Missing capability grant',now(),id))
                self._emit(c,'policy.rejected',id,{'principal':principal,'capability':capability})
                execute=False
            else:
                self._emit(c,'policy.allowed',id,{'principal':principal,'capability':capability})
                if CAPABILITIES[capability].get('approval'):
                    approval=uid('approval')
                    c.execute('INSERT INTO approvals VALUES (?,?,?,?,?)',(approval,id,'pending',stamp,None))
                    c.execute("UPDATE tasks SET status='pending_approval',updated=? WHERE id=?",(now(),id))
                    self._emit(c,'approval.requested',id,{'approval_id':approval,'capability':capability})
                    execute=False
                else:
                    c.execute("UPDATE tasks SET status='queued',updated=? WHERE id=?",(now(),id))
                    self._emit(c,'task.queued',id)
                    execute=True
        return self._execute(id) if execute else self.get_task(id)

    def _execute(self,id):
        with self.tx() as c:
            task=c.execute('SELECT * FROM tasks WHERE id=?',(id,)).fetchone()
            if not task or task['status']!='queued':raise AuryqenError('Task cannot execute in its current state')
            c.execute("UPDATE tasks SET status='running',updated=? WHERE id=?",(now(),id))
            self._emit(c,'task.started',id,{'capability':task['capability']})
        try:
            cap=task['capability'];payload=json.loads(task['input_json'])
            if cap=='workspace.describe':
                result={'name':'AURYQEN Local Core','mode':'local','capabilities':list(CAPABILITIES),'root':str(self.root),'database':'SQLite','model':('configured' if os.environ.get('AURYQEN_MODEL_URL') and os.environ.get('AURYQEN_MODEL_ID') else 'unconfigured')}
            elif cap=='directory.inspect':
                target=(self.root/payload.get('path','.')).resolve(strict=True)
                if not target.is_relative_to(self.root) or not target.is_dir():raise AuryqenError('Directory is no longer authorized')
                items=[]
                for p in sorted(target.iterdir(),key=lambda q:q.name.lower())[:100]:
                    try:
                        real=p.resolve();is_safe=real.is_relative_to(self.root)
                        if not is_safe:continue
                        items.append({'name':p.name,'kind':'directory' if p.is_dir() else 'file' if p.is_file() else 'other','size':p.stat().st_size if p.is_file() else None})
                    except OSError:continue
                result={'path':str(target.relative_to(self.root)) if target!=self.root else '.','entries':items,'truncated':len(list(target.iterdir()))>100}
            elif cap=='text.normalize':result={'text':' '.join(payload['text'].split()).lower()}
            elif cap=='memory.read':
                with self.tx() as c:row=c.execute('SELECT value FROM memory WHERE key=?',(payload['key'],)).fetchone()
                result={'key':payload['key'],'found':row is not None,'value':row['value'] if row else None}
            elif cap=='memory.write':
                with self.tx() as c:c.execute('INSERT INTO memory VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated',(payload['key'],payload['value'],now()))
                result={'key':payload['key'],'saved':True}
            else:raise AuryqenError('No implementation')
            with self.tx() as c:
                c.execute("UPDATE tasks SET status='completed',result_json=?,updated=? WHERE id=?",(compact(result),now(),id))
                self._emit(c,'task.completed',id,{'result':result})
        except Exception as ex:
            with self.tx() as c:
                c.execute("UPDATE tasks SET status='failed',error=?,updated=? WHERE id=?",(str(ex)[:500],now(),id))
                self._emit(c,'task.failed',id,{'error':str(ex)[:500]})
        return self.get_task(id)

    def resolve_approval(self,approval_id,allow,actor='owner'):
        if actor!='owner': raise AuryqenError('Only the authenticated local owner can resolve approvals')
        with self.tx() as c:
            approval=c.execute('SELECT * FROM approvals WHERE id=?',(approval_id,)).fetchone()
            if not approval or approval['status']!='pending':raise AuryqenError('Approval not found or already resolved')
            id=approval['task_id'];decision='approved' if allow else 'denied'
            c.execute('UPDATE approvals SET status=?,resolved=? WHERE id=?',(decision,now(),approval_id))
            c.execute('UPDATE tasks SET status=?,updated=? WHERE id=?',('queued' if allow else 'rejected',now(),id))
            self._emit(c,'approval.'+decision,id,{'approval_id':approval_id,'actor':actor})
            if allow:self._emit(c,'task.queued',id)
        return self._execute(id) if allow else self.get_task(id)

    def get_task(self,id):
        with self.tx() as c:r=c.execute('SELECT * FROM tasks WHERE id=?',(id,)).fetchone()
        if not r:return None
        item=dict(r);item['input']=json.loads(item.pop('input_json'));item['result']=json.loads(item.pop('result_json')) if item['result_json'] is not None else None
        return item

    def tasks(self,limit=40):
        with self.tx() as c:ids=[r['id'] for r in c.execute('SELECT id FROM tasks ORDER BY rowid DESC LIMIT ?',(min(100,max(1,int(limit))),))]
        return [self.get_task(i) for i in ids]

    def approvals(self):
        with self.tx() as c:return [dict(r) for r in c.execute("SELECT * FROM approvals WHERE status='pending' ORDER BY rowid DESC")]

    def events(self,limit=80,task_id=None):
        with self.tx() as c:
            if task_id:records=c.execute('SELECT * FROM events WHERE task_id=? ORDER BY seq DESC LIMIT ?',(task_id,min(250,max(1,int(limit))))).fetchall()
            else:records=c.execute('SELECT * FROM events ORDER BY seq DESC LIMIT ?',(min(250,max(1,int(limit))),)).fetchall()
        return [{**dict(r),'payload':json.loads(r['payload_json'])} for r in reversed(records)]

    def capabilities(self,principal='owner'):
        with self.tx() as c:grants={r[0] for r in c.execute('SELECT capability FROM grants WHERE principal=?',(principal,))}
        return [{'id':id,**v,'granted':id in grants} for id,v in CAPABILITIES.items()]

    def set_grant(self,principal,capability,allowed,actor='owner'):
        if actor!='owner' or capability not in CAPABILITIES:raise AuryqenError('Only owner can change known grants')
        with self.tx() as c:
            if allowed:c.execute('INSERT OR IGNORE INTO grants VALUES (?,?)',(principal,capability))
            else:c.execute('DELETE FROM grants WHERE principal=? AND capability=?',(principal,capability))
            self._emit(c,'policy.changed',None,{'principal':principal,'capability':capability,'allowed':bool(allowed)})

    def create_conversation(self,title='New conversation'):
        if not isinstance(title,str) or len(title)>120:raise AuryqenError('Invalid title')
        id=uid('chat');stamp=now()
        with self.tx() as c:c.execute('INSERT INTO conversations VALUES (?,?,?)',(id,title or 'New conversation',stamp))
        return id

    def conversation_exists(self,id):
        with self.tx() as c:return c.execute('SELECT 1 FROM conversations WHERE id=?',(id,)).fetchone() is not None

    def add_message(self,conversation_id,role,content,task_id=None):
        if role not in ('user','assistant','tool','system') or not isinstance(content,str) or len(content)>MAX_TEXT:raise AuryqenError('Invalid message')
        with self.tx() as c:
            if not c.execute('SELECT 1 FROM conversations WHERE id=?',(conversation_id,)).fetchone():raise AuryqenError('Unknown conversation')
            id=uid('msg');c.execute('INSERT INTO messages VALUES (?,?,?,?,?,?)',(id,conversation_id,role,content,task_id,now()))
        return id

    def conversations(self):
        with self.tx() as c:return [dict(r) for r in c.execute('SELECT * FROM conversations ORDER BY rowid DESC LIMIT 40')]

    def messages(self,conversation_id):
        with self.tx() as c:return [dict(r) for r in c.execute('SELECT * FROM messages WHERE conversation_id=? ORDER BY rowid LIMIT 100',(conversation_id,))]

    def state(self):return {'mode':'local','model_connected':bool(os.environ.get('AURYQEN_MODEL_URL') and os.environ.get('AURYQEN_MODEL_ID')),'capabilities':self.capabilities(),'tasks':self.tasks(),'approvals':self.approvals(),'events':self.events(),'conversations':self.conversations()}