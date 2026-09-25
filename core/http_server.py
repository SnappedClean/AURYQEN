"""Loopback-only AURYQEN control surface. No public CORS or remote access."""
import json
import mimetypes
import os
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from core import Core, AuryqenError
from model_adapter import chat

HOST='127.0.0.1'
PORT=int(os.environ.get('AURYQEN_PORT','8765'))
ROOT=Path(__file__).parent/'ui'
MAX_BODY=40000

class Handler(BaseHTTPRequestHandler):
    server_version='AuryqenLocal/0.2'
    def log_message(self,fmt,*args):pass
    def _headers(self,status,kind,length):
        self.send_response(status)
        self.send_header('Content-Type',kind)
        self.send_header('Content-Length',str(length))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
    def _send(self,data,status=200):
        raw=json.dumps(data,ensure_ascii=False).encode()
        self._headers(status,'application/json; charset=utf-8',len(raw));self.wfile.write(raw)
    def _allowed(self):
        return self.headers.get('Host') in (f'127.0.0.1:{PORT}',f'localhost:{PORT}')
    def _authorized(self):
        return self.headers.get('X-Auryqen-Session')==self.server.session and self.headers.get('Origin') in (None,f'http://127.0.0.1:{PORT}',f'http://localhost:{PORT}')
    def do_GET(self):
        if not self._allowed():return self._send({'error':'Invalid host'},403)
        p=urlparse(self.path).path
        if p.startswith('/api/'):
            if not self._authorized():return self._send({'error':'Authentication required'},403)
            core=self.server.core
            try:
                if p=='/api/state':return self._send(core.state())
                if p=='/api/tasks':return self._send(core.tasks())
                if p.startswith('/api/tasks/'):
                    task=core.get_task(p.split('/')[-1]);return self._send(task,200 if task else 404)
                if p=='/api/events':return self._send(core.events())
                if p=='/api/conversations':return self._send(core.conversations())
                if p.startswith('/api/messages/'):
                    return self._send(core.messages(p.split('/')[-1]))
                return self._send({'error':'Not found'},404)
            except Exception as ex:return self._send({'error':str(ex)},400)
        if p=='/' or p=='/index.html':
            raw=(ROOT/'index.html').read_text().replace('SESSION_TOKEN_PLACEHOLDER',self.server.session).encode()
            self._headers(200,'text/html; charset=utf-8',len(raw));return self.wfile.write(raw)
        files={'/app.js':'app.js','/style.css':'style.css'}
        if p not in files:return self._send({'error':'Not found'},404)
        file=ROOT/files[p];raw=file.read_bytes();kind='text/javascript' if p.endswith('.js') else 'text/css'
        self._headers(200,kind+'; charset=utf-8',len(raw));self.wfile.write(raw)
    def do_POST(self):
        if not self._allowed() or not self._authorized():return self._send({'error':'Local authenticated access required'},403)
        if not self.headers.get('Content-Type','').startswith('application/json'):return self._send({'error':'Expected JSON'},415)
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<=0 or size>MAX_BODY:raise AuryqenError('Request body must be 1–40,000 bytes')
            b=json.loads(self.rfile.read(size))
            if not isinstance(b,dict):raise AuryqenError('Expected JSON object')
            c=self.server.core;p=urlparse(self.path).path
            if p=='/api/tasks':return self._send(c.submit('owner',b['capability'],b.get('input',{}),caller='ui',conversation_id=b.get('conversation_id')))
            if p=='/api/conversations':return self._send({'id':c.create_conversation(b.get('title','New conversation'))})
            if p=='/api/chat':return self._send(chat(c,b['conversation_id'],b['message']))
            if p=='/api/approvals/resolve':return self._send(c.resolve_approval(b['id'],b['allow'] is True,actor='owner'))
            if p=='/api/grants':
                c.set_grant(b['principal'],b['capability'],b['allowed'] is True,actor='owner');return self._send({'ok':True})
            return self._send({'error':'Not found'},404)
        except (ValueError,KeyError,TypeError,OverflowError) as ex:return self._send({'error':str(ex)},400)
        except Exception:return self._send({'error':'Unexpected internal error'},500)

def serve():
    core=Core()
    server=ThreadingHTTPServer((HOST,PORT),Handler)
    server.core=core;server.session=secrets.token_urlsafe(32)
    print(f'AURYQEN local workspace: http://{HOST}:{PORT}/',flush=True)
    print('This server is loopback-only; do not expose it to the internet.',flush=True)
    try:server.serve_forever()
    finally:server.server_close()

if __name__=='__main__':serve()