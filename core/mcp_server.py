"""Local MCP stdio JSON-RPC adapter. Launch by a trusted local client only."""
import json
import sys
from core import Core, AuryqenError

TOOLS=[
 ('workspace_describe','Describe the authorized workspace',{'type':'object','properties':{},'additionalProperties':False}),
 ('capabilities_list','List available capabilities and grants',{'type':'object','properties':{},'additionalProperties':False}),
 ('capability_invoke','Invoke capability through the same audited execution engine',{'type':'object','properties':{'capability':{'type':'string'},'input':{'type':'object'}},'required':['capability','input'],'additionalProperties':False}),
 ('tasks_get','Fetch an execution record',{'type':'object','properties':{'id':{'type':'string'}},'required':['id'],'additionalProperties':False}),
 ('tasks_list','List recent task records',{'type':'object','properties':{},'additionalProperties':False}),
 ('events_read','Read recent execution events',{'type':'object','properties':{'task_id':{'type':'string'}},'additionalProperties':False}),
 ('memory_read','Read a workspace memory key',{'type':'object','properties':{'key':{'type':'string'}},'required':['key'],'additionalProperties':False}),
 ('memory_write','Request a memory write requiring separate human approval',{'type':'object','properties':{'key':{'type':'string'},'value':{'type':'string'}},'required':['key','value'],'additionalProperties':False}),
]

def tool_call(core,name,args):
    if not isinstance(args,dict):raise AuryqenError('Arguments must be an object')
    if name=='workspace_describe':return core.submit('mcp:local','workspace.describe',{},caller='mcp')
    if name=='capabilities_list':return core.capabilities('mcp:local')
    if name=='capability_invoke':return core.submit('mcp:local',args['capability'],args['input'],caller='mcp')
    if name=='tasks_get':return core.get_task(args['id'])
    if name=='tasks_list':return core.tasks()
    if name=='events_read':return core.events(task_id=args.get('task_id'))
    if name=='memory_read':return core.submit('mcp:local','memory.read',{'key':args['key']},caller='mcp')
    if name=='memory_write':return core.submit('mcp:local','memory.write',{'key':args['key'],'value':args['value']},caller='mcp')
    raise AuryqenError('Unknown MCP tool')

def dispatch(core,msg):
    method=msg.get('method');id=msg.get('id')
    if method=='notifications/initialized' or method=='notifications/cancelled':return None
    if id is None:return None
    try:
        if method=='initialize':
            result={'protocolVersion':'2025-06-18','capabilities':{'tools':{'listChanged':False}},'serverInfo':{'name':'auryqen-core','version':'0.2.0'},'instructions':'Local-only MCP. Write actions need approval from authenticated local owner in AURYQEN workspace.'}
        elif method=='ping':result={}
        elif method=='tools/list':result={'tools':[{'name':n,'description':d,'inputSchema':s} for n,d,s in TOOLS]}
        elif method=='tools/call':
            params=msg.get('params') or {};name=params.get('name');args=params.get('arguments') or {}
            output=tool_call(core,name,args)
            result={'content':[{'type':'text','text':json.dumps(output,ensure_ascii=False)}],'isError':False}
        else:return {'jsonrpc':'2.0','id':id,'error':{'code':-32601,'message':'Method not found'}}
        return {'jsonrpc':'2.0','id':id,'result':result}
    except Exception as ex:
        if method=='tools/call':return {'jsonrpc':'2.0','id':id,'result':{'content':[{'type':'text','text':str(ex)}],'isError':True}}
        return {'jsonrpc':'2.0','id':id,'error':{'code':-32603,'message':str(ex)}}

def main():
    core=Core()
    for raw in sys.stdin:
        try:
            msg=json.loads(raw)
            out=dispatch(core,msg)
            if out is not None:
                sys.stdout.write(json.dumps(out,ensure_ascii=False)+'\n');sys.stdout.flush()
        except Exception as ex:
            sys.stderr.write('AURYQEN MCP request error: '+type(ex).__name__+'\n');sys.stderr.flush()

if __name__=='__main__':main()