from pathlib import Path
import shutil
support=Path.home()/'Library/Application Support'
for browser in ['Google/Chrome','Microsoft Edge']:
    (support/browser/'NativeMessagingHosts/se.atea.coachpilot.json').unlink(missing_ok=True)
shutil.rmtree(support/'Atea Coach Pilot',ignore_errors=True)
print('Mac-bryggan borttagen. Ta också bort tillägget i webbläsaren.')
