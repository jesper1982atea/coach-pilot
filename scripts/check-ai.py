import json, struct, subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
for request in [{'action':'status'},{'action':'answer','context':'Med MDM kan organisationer installera appar och konfigurera enheter trådlöst.','question':'Vad kan MDM göra?'}]:
    body=json.dumps(request).encode()
    try:
        result=subprocess.run([str(root/'native/bin/CoachBridge')],input=struct.pack('<I',len(body))+body,capture_output=True,check=True,timeout=90)
        length=struct.unpack('<I',result.stdout[:4])[0]
        reply=json.loads(result.stdout[4:4+length])
        print(request['action'].upper()+': '+('OK' if reply['ok'] else 'FEL'))
        print(reply.get('text') or reply.get('error') or reply.get('message'))
    except Exception as error: print('Självtestet misslyckades: '+str(error))
