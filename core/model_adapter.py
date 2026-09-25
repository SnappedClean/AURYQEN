"""Provider-neutral model interface. No inference is claimed without actual provider response."""
import json
import os
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from core import AuryqenError

class ModelAdapter:
    def reply(self, messages, tools):
        raise NotImplementedError

class OpenAICompatibleAdapter(ModelAdapter):
    def __init__(self,url,model,api_key=None):
        parsed=urlparse(url)
        if parsed.scheme!='https' and not (parsed.scheme=='http' and parsed.hostname in ('localhost','127.0.0.1','::1')):
            raise AuryqenError('Model endpoint must use HTTPS or local loopback HTTP')
        if parsed.username or parsed.password or parsed.query or not parsed.netloc:raise AuryqenError('Invalid model endpoint')
        self.url=url.rstrip('/');self.model=model;self.api_key=api_key
    def reply(self,messages,tools):
        payload=json.dumps({'model':self.model,'messages':messages,'tools':tools,'tool_choice':'auto','stream':False}).encode()
        headers={'Content-Type':'application/json'}
        if self.api_key:headers['Authorization']='Bearer '+self.api_key
        req=Request(self.url+'/chat/completions',payload,headers,method='POST')
        try:
            with urlopen(req,timeout=45) as response:data=json.loads(response.read(500000).decode())
            message=data['choices'][0]['message']
            return {'content':message.get('content') or '', 'tool_calls':message.get('tool_calls') or [], 'usage':data.get('usage')}
        except Exception as ex:
            raise AuryqenError('Model request failed: '+type(ex).__name__) from ex

def from_environment():
    url=os.environ.get('AURYQEN_MODEL_URL');model=os.environ.get('AURYQEN_MODEL_ID')
    if not (url and model):return None
    return OpenAICompatibleAdapter(url,model,os.environ.get('AURYQEN_MODEL_API_KEY'))

TOOL_SCHEMA={'type':'function','function':{'name':'auryqen_invoke','description':'Invoke an authorized AURYQEN capability. A write may require approval by the owner.','parameters':{'type':'object','properties':{'capability':{'type':'string'},'input':{'type':'object'}},'required':['capability','input'],'additionalProperties':False}}}

def chat(core,conversation_id,user_text,adapter=None):
    if not isinstance(user_text,str) or not user_text.strip() or len(user_text)>10000:raise AuryqenError('Message must contain 1–10,000 characters')
    if not core.conversation_exists(conversation_id):raise AuryqenError('Unknown conversation')
    core.add_message(conversation_id,'user',user_text)
    adapter=adapter if adapter is not None else from_environment()
    if adapter is None:return {'connected':False,'message':'No model is configured. Your message was saved; connect an authorized provider to receive an AI response.','conversation_id':conversation_id}
    # Deliberately small tool loop, sharing Core.submit with local UI and MCP.
    messages=[{'role':m['role'],'content':m['content']} for m in core.messages(conversation_id) if m['role'] in ('user','assistant')][-30:]
    for _ in range(3):
        response=adapter.reply(messages,[TOOL_SCHEMA]);calls=response['tool_calls']
        if not calls:
            answer=response['content']
            if not isinstance(answer,str):raise AuryqenError('Provider did not return a textual reply')
            core.add_message(conversation_id,'assistant',answer)
            return {'connected':True,'message':answer,'conversation_id':conversation_id,'usage':response.get('usage')}
        # The provider's proposed call is never trusted or allowed to approve itself.
        messages.append({'role':'assistant','content':response['content'],'tool_calls':calls})
        for call in calls[:4]:
            name=call.get('function',{}).get('name')
            if name!='auryqen_invoke':raise AuryqenError('Model requested unsupported tool')
            try:
                args=json.loads(call['function']['arguments'])
                if set(args)!={'capability','input'}:raise AuryqenError('Invalid tool arguments')
                task=core.submit('owner',args['capability'],args['input'],caller='model',conversation_id=conversation_id)
                outcome={'task_id':task['id'],'status':task['status'],'result':task['result'],'error':task['error']}
                core.add_message(conversation_id,'tool',json.dumps(outcome),task_id=task['id'])
            except Exception as ex:outcome={'error':str(ex)}
            messages.append({'role':'tool','tool_call_id':call.get('id',''), 'content':json.dumps(outcome)})
            if outcome.get('status')=='pending_approval':return {'connected':True,'message':'This action is awaiting your approval in AURYQEN. No write has been performed.','conversation_id':conversation_id,'pending_task':outcome['task_id']}
    raise AuryqenError('Model tool-call limit reached; no completion was fabricated')