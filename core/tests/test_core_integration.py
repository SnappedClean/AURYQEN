import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from core import Core, AuryqenError
from mcp_server import dispatch
from model_adapter import chat


class CoreIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)/'allowed'
        self.root.mkdir()
        (self.root/'example.txt').write_text('real project data')
        self.db = Path(self.temp.name)/'runtime.db'
        self.core = Core(db_path=self.db, allowed_root=self.root)

    def test_ui_and_mcp_share_execution_records(self):
        ui = self.core.submit('owner','directory.inspect',{'path':'.'},caller='ui')
        mcp = dispatch(self.core,{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'capability_invoke','arguments':{'capability':'directory.inspect','input':{'path':'.'}}}})
        result = json.loads(mcp['result']['content'][0]['text'])
        self.assertEqual(ui['status'],'completed')
        self.assertEqual(result['status'],'completed')
        self.assertEqual(ui['result'],result['result'])
        self.assertNotEqual(ui['id'],result['id'])
        self.assertEqual({row['caller'] for row in self.core.tasks()}, {'ui','mcp'})
        self.assertTrue(any(x['type']=='task.completed' and x['task_id']==result['id'] for x in self.core.events()))

    def test_no_access_outside_allowlist_even_symlink(self):
        outside = Path(self.temp.name)/'outside'
        outside.mkdir()
        (self.root/'escape').symlink_to(outside, target_is_directory=True)
        with self.assertRaises(AuryqenError): self.core.submit('owner','directory.inspect',{'path':'escape'})
        with self.assertRaises(AuryqenError): self.core.submit('owner','directory.inspect',{'path':'../outside'})
        with self.assertRaises(AuryqenError): self.core.submit('owner','directory.inspect',{'path':str(self.root)})

    def test_grants_are_checked_at_invocation_boundary(self):
        self.core.set_grant('mcp:local','directory.inspect',False)
        result = dispatch(self.core,{'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'capability_invoke','arguments':{'capability':'directory.inspect','input':{}}}})
        item = json.loads(result['result']['content'][0]['text'])
        self.assertEqual(item['status'],'rejected')
        self.assertTrue(any(e['type']=='policy.rejected' for e in self.core.events(task_id=item['id'])))

    def test_approval_gate_is_separate_from_mcp(self):
        reply=dispatch(self.core,{'jsonrpc':'2.0','id':4,'method':'tools/call','params':{'name':'memory_write','arguments':{'key':'project','value':'auryqen'}}})
        item=json.loads(reply['result']['content'][0]['text'])
        self.assertEqual(item['status'],'pending_approval')
        self.assertEqual(self.core.submit('owner','memory.read',{'key':'project'})['result']['found'],False)
        approval=self.core.approvals()[0]
        with self.assertRaises(AuryqenError):self.core.resolve_approval(approval['id'],True,actor='mcp:local')
        finished=self.core.resolve_approval(approval['id'],True,actor='owner')
        self.assertEqual(finished['status'],'completed')
        self.assertEqual(Core(db_path=self.db,allowed_root=self.root).submit('owner','memory.read',{'key':'project'})['result']['value'],'auryqen')

    def test_mcp_initialization_and_tools(self):
        init=dispatch(self.core,{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18'}})
        self.assertEqual(init['result']['protocolVersion'],'2025-06-18')
        names={x['name'] for x in dispatch(self.core,{'jsonrpc':'2.0','id':2,'method':'tools/list'})['result']['tools']}
        self.assertIn('capability_invoke',names)
        self.assertIn('memory_write',names)

    def test_chat_unconfigured_saves_user_message_without_fake_reply(self):
        chatid=self.core.create_conversation('Test')
        with patch.dict(os.environ, {'AURYQEN_MODEL_URL':'','AURYQEN_MODEL_ID':''}):
            result=chat(self.core,chatid,'What can you do?')
        self.assertFalse(result['connected'])
        self.assertEqual([m['role'] for m in self.core.messages(chatid)],['user'])

    def test_model_tool_proposal_goes_through_same_core(self):
        chatid=self.core.create_conversation('Test')
        class StubAdapter:
            def __init__(self):self.calls=0
            def reply(self,messages,tools):
                self.calls+=1
                if self.calls==1:
                    return {'content':'','tool_calls':[{'id':'call1','function':{'name':'auryqen_invoke','arguments':json.dumps({'capability':'text.normalize','input':{'text':'  HEY  WORLD '}})}}], 'usage':None}
                return {'content':'Task finished','tool_calls':[],'usage':None}
        result=chat(self.core,chatid,'Normalize text',StubAdapter())
        self.assertTrue(result['connected'])
        self.assertEqual(result['message'],'Task finished')
        self.assertEqual(self.core.tasks()[0]['caller'],'model')
        self.assertEqual(self.core.tasks()[0]['result']['text'],'hey world')
        self.assertEqual([m['role'] for m in self.core.messages(chatid)],['user','tool','assistant'])

    def test_persistence_on_restart(self):
        finished=self.core.submit('owner','text.normalize',{'text':'  HELLO   WORLD '})
        after=Core(db_path=self.db,allowed_root=self.root)
        self.assertEqual(after.get_task(finished['id'])['result'],{'text':'hello world'})
        self.assertTrue(after.events(task_id=finished['id']))

if __name__=='__main__':unittest.main()

class ProcessIntegration(unittest.TestCase):
    def test_stdio_json_rpc_round_trip(self):
        import subprocess,sys
        with tempfile.TemporaryDirectory() as d:
            env=dict(os.environ,AURYQEN_DB=str(Path(d)/'core.db'),AURYQEN_ALLOWED_ROOT=d)
            requests='\n'.join(json.dumps(x) for x in [
                {'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18'}},
                {'jsonrpc':'2.0','method':'notifications/initialized'},
                {'jsonrpc':'2.0','id':2,'method':'tools/list'},
                {'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'capability_invoke','arguments':{'capability':'text.normalize','input':{'text':'  REAL    WORK  '}}}},
            ])+'\n'
            out=subprocess.run([sys.executable,'mcp_server.py'],input=requests,text=True,capture_output=True,cwd=Path(__file__).resolve().parents[1],env=env,timeout=10,check=True)
            messages=[json.loads(line) for line in out.stdout.splitlines()]
            self.assertEqual([m['id'] for m in messages],[1,2,3])
            invoked=json.loads(messages[-1]['result']['content'][0]['text'])
            self.assertEqual(invoked['status'],'completed')
            self.assertEqual(invoked['result']['text'],'real work')
            self.assertIn('capability_invoke',{tool['name'] for tool in messages[1]['result']['tools']})