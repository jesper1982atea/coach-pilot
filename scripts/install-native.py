from pathlib import Path
import json, shutil
root=Path(__file__).resolve().parent.parent
key=json.loads((root/'public/key.json').read_text())
support=Path.home()/'Library/Application Support'
folder=support/'Atea Coach Pilot'
folder.mkdir(parents=True,exist_ok=True)
exe=folder/'CoachBridge'
shutil.copy2(root/'native/bin/CoachBridge',exe)
exe.chmod(0o755)
manifest={'name':'se.atea.coachpilot','description':'Lokal Apple Intelligence för Coach Pilot','path':str(exe),'type':'stdio','allowed_origins':[f"chrome-extension://{key['id']}/"]}
for browser in ['Google/Chrome','Microsoft Edge']:
    dest=support/browser/'NativeMessagingHosts'
    dest.mkdir(parents=True,exist_ok=True)
    (dest/'se.atea.coachpilot.json').write_text(json.dumps(manifest,indent=2))
print('Mac-brygga installerad. Endast detta tillägg får ansluta: '+key['id'])
