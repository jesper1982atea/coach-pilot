import json,struct,subprocess
from pathlib import Path
binary=Path(__file__).resolve().parent.parent/'native/bin/CoachBridge'
def frame(obj):
    raw=json.dumps(obj).encode();return struct.pack('<I',len(raw))+raw
p=subprocess.run([str(binary)],input=frame({'action':'status'})+frame({'action':'invalid'}),capture_output=True,timeout=45,check=True)
data=p.stdout;results=[]
while data:
    assert len(data)>=4
    n=struct.unpack('<I',data[:4])[0];assert len(data)>=n+4
    results.append(json.loads(data[4:4+n]));data=data[4+n:]
assert len(results)==2,results
assert isinstance(results[0]['ok'],bool)
assert results[1]['ok'] is False
assert results[1]['error']=='Okänd åtgärd'
print(json.dumps(results,ensure_ascii=False,indent=2))
# Truncated and oversized input must terminate, never allocate unbounded data.
for payload in [struct.pack('<I',100)+b'{}',struct.pack('<I',1000000)]:
    subprocess.run([str(binary)],input=payload,capture_output=True,timeout=10,check=True)
print('Native framing, status and invalid requests: PASS')
