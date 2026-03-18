import json
import subprocess
from pathlib import Path
import time

analyzer = Path("neuromodule/submodules/stdA/AnalyzerA.py").resolve()
weights = Path("neuromodule/submodules/stdA/weights.pth").resolve()
img = Path(r"c:\Windows\Web\Wallpaper\Theme1\img1.jpg")

proc = subprocess.Popen(
    ["python", "-u", str(analyzer), "--mode", "run", "--keypoints", "6", "--weights", str(weights)],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    encoding="utf-8",
    cwd=str(analyzer.parent)
)

print("Started!")
for _ in range(2):
    line = proc.stdout.readline()
    print("STDOUT:", line.strip())

req = {"cmd": "analyze", "image_path": str(img)}
proc.stdin.write(json.dumps(req) + "\n")
proc.stdin.flush()

for _ in range(5):
    line = proc.stdout.readline()
    print("STDOUT:", line.strip())
    if "coords" in line or "error" in line:
        break

proc.terminate()
