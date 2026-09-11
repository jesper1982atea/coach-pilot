"""Package a built extension and Mac bridge; run on Apple Silicon macOS 26+."""
from pathlib import Path
import json, shutil, plistlib, subprocess, hashlib, zipfile
root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'dist/manifest.json').read_text());version=manifest['version']
build=root/'build';app=build/'Coach Pilot Setup.app';contents=app/'Contents';res=contents/'Resources';payload=res/'Payload'
if app.exists():shutil.rmtree(app)
(contents/'MacOS').mkdir(parents=True);payload.mkdir(parents=True)
shutil.copytree(root/'dist',payload/'extension')
shutil.copy2(root/'native/bin/CoachBridge',payload/'CoachBridge')
for name in ['Startguide.html','AppIcon.icns']:shutil.copy2(root/'installer/assets'/name,res/name)
# Version labels in the templates are substituted for each release.
source=(root/'installer/SetupApp.swift').read_text().replace('0.5.0',version)
(build/'SetupApp.swift').write_text(source)
guide=(res/'Startguide.html').read_text().replace('KOLLEGAPILOT 0.5.0','KOLLEGAPILOT '+version).replace('Coach Pilot 0.5.0 ·','Coach Pilot '+version+' ·')
(res/'Startguide.html').write_text(guide)
info={'CFBundleDisplayName':'Coach Pilot Setup','CFBundleExecutable':'CoachPilotSetup','CFBundleIconFile':'AppIcon','CFBundleIdentifier':'se.atea.coachpilot.setup','CFBundleName':'Coach Pilot Setup','CFBundlePackageType':'APPL','CFBundleShortVersionString':version,'CFBundleVersion':version,'LSMinimumSystemVersion':'26.0','NSHighResolutionCapable':True}
(contents/'Info.plist').write_bytes(plistlib.dumps(info))
subprocess.run(['xcrun','swiftc','-parse-as-library','-O','-module-cache-path',str((root/'.swift-cache').resolve()),'-target','arm64-apple-macosx26.0',str(root/'installer/InstallerCore.swift'),str(build/'SetupApp.swift'),'-o',str(contents/'MacOS/CoachPilotSetup')],check=True)
(payload/'checksums.json').write_text(json.dumps({str(f.relative_to(payload)):hashlib.sha256(f.read_bytes()).hexdigest() for f in payload.rglob('*') if f.is_file()},indent=2))
subprocess.run(['codesign','--force','--sign','-','--timestamp=none',str(app)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
archive=build/f'Coach-Pilot-Kollegapaket-{version}.zip';prefix='Coach Pilot – Kollegapilot/'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for f in app.rglob('*'):
  if f.is_file():z.write(f,prefix+'Coach Pilot Setup.app/'+str(f.relative_to(app)))
 z.write(res/'Startguide.html',prefix+'START HÄR.html')
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
(build/'SHA256SUMS.txt').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
print(archive)
