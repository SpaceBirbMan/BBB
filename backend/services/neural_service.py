"""
Neural service: interfaces with multiple neural modules in ANZ/modules
via subprocess JSON stdin/stdout protocol.
"""
import json
import os
import subprocess
import sys
import threading
import queue
import time
from pathlib import Path
from typing import List, Optional, Dict

from models.schemas import Point


# Paths relative to this file's location
_BACKEND_DIR = Path(__file__).parent.parent
_MODULES_DIR = _BACKEND_DIR.parent / "ANZ" / "modules"
_LOG_FILE = _MODULES_DIR / "module_interactions.log"

ENABLE_MODULE_LOGGING = True

# Global orchestrators mapping: { "ModuleName": handle }
_orchestrators: Dict[str, dict] = {}
_init_lock = threading.Lock()


def _log_interaction(module_name: str, direction: str, message: str):
    if not ENABLE_MODULE_LOGGING:
        return
    log_msg = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [{module_name}] {direction}: {message}\n"
    print(log_msg.strip())
    try:
        if not _MODULES_DIR.exists():
            _MODULES_DIR.mkdir(parents=True, exist_ok=True)
        # Clear log on startup... wait, we actually just append here, but "лог перезаписывать" suggests we should rewrite it.
        # But we don't want to rewrite on EVERY log line. We will rewrite it at startup only.
        with open(_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_msg)
    except Exception as e:
        print(f"Log write error: {e}")


def _stream_reader(stream, q: queue.Queue):
    try:
        for line in stream:
            stripped = line.strip()
            if stripped:
                q.put(stripped)
    except Exception:
        pass


def _start_module(script_path: Path) -> Optional[dict]:
    """Start a module script as a subprocess."""
    creationflags = 0
    if sys.platform == "win32":
        try:
            creationflags = subprocess.CREATE_NO_WINDOW
        except AttributeError:
            pass
            
    module_name = script_path.stem
    _log_interaction(module_name, "STARTING", str(script_path))

    proc = subprocess.Popen(
        [sys.executable, str(script_path), "--mode", "run"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        creationflags=creationflags,
        cwd=str(script_path.parent),
    )

    out_q: queue.Queue = queue.Queue()
    err_q: queue.Queue = queue.Queue()

    threading.Thread(target=_stream_reader, args=(proc.stdout, out_q), daemon=True).start()
    threading.Thread(target=_stream_reader, args=(proc.stderr, err_q), daemon=True).start()

    handle = {"proc": proc, "out_q": out_q, "err_q": err_q, "name": module_name}

    error_logs = []
    deadline = time.time() + 30.0
    while time.time() < deadline:
        try:
            line = out_q.get(timeout=0.2)
            _log_interaction(module_name, "STDOUT", line)
            
            try:
                msg = json.loads(line)
                if msg.get("status") in ("running", "ready"):
                    return handle
            except json.JSONDecodeError:
                pass
        except queue.Empty:
            while not err_q.empty():
                err_line = err_q.get_nowait()
                error_logs.append(err_line)
                _log_interaction(module_name, "STDERR", err_line)
                
            if proc.poll() is not None:
                _log_interaction(module_name, "ERROR", f"Process died. Code: {proc.returncode}")
                return None
            continue

    _log_interaction(module_name, "TIMEOUT", "Failed to start in time.")
    return None


def _send(handle: dict, message: dict, timeout: float = 60.0) -> Optional[dict]:
    """Send JSON command and await response."""
    module_name = handle["name"]
    try:
        proc = handle["proc"]
        if proc.poll() is not None:
            return None
            
        msg_str = json.dumps(message, ensure_ascii=False)
        _log_interaction(module_name, "REQ", msg_str)
        proc.stdin.write(msg_str + "\n")
        proc.stdin.flush()

        start = time.time()
        while time.time() - start < timeout:
            try:
                line = handle["out_q"].get(timeout=0.3)
                _log_interaction(module_name, "RES", line)
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    continue
            except queue.Empty:
                continue
        return None
    except Exception as e:
        _log_interaction(module_name, "EXC", str(e))
        return None


def ensure_orchestrators():
    """Ensure all orchestrators in ANZ/modules are running (called at app startup)."""
    global _orchestrators
    with _init_lock:
        if not _MODULES_DIR.exists():
            return
            
        for script_file in _MODULES_DIR.glob("*.py"):
            name = script_file.stem
            handle = _orchestrators.get(name)
            if handle is None or handle["proc"].poll() is not None:
                new_handle = _start_module(script_file)
                if new_handle:
                    _orchestrators[name] = new_handle


def stop_orchestrators():
    """Stop all orchestrators."""
    global _orchestrators
    for name, handle in _orchestrators.items():
        proc = handle["proc"]
        try:
            proc.stdin.write(json.dumps({"cmd": "stop"}) + "\n")
            proc.stdin.flush()
        except Exception:
            pass
        try:
            proc.terminate()
            proc.wait(timeout=3.0)
        except Exception:
            pass
    _orchestrators.clear()


def parse_coords(raw_coords: List[dict]) -> List[dict]:
    points = []
    
    for idx, item in enumerate(raw_coords):
        try:
            if isinstance(item, dict):
                name = item.get("name", f"pt_{idx}")
                x = float(item.get("x", 0))
                y = float(item.get("y", 0))
                points.append({"name": name, "x": x, "y": y})
            elif isinstance(item, str) and "--" in item:
                parts = item.split("--", 1)
                coord_str = parts[1].strip()
                coord_str = coord_str.replace("x:", '"x":').replace("y:", '"y":')
                coord_data = json.loads(coord_str)
                points.append({"name": f"pt_{idx}", "x": float(coord_data["x"]), "y": float(coord_data["y"])})
        except Exception:
            continue

    return points


def run_inference(image_path: str) -> List[Point]:
    global _orchestrators

    ensure_orchestrators()
    
    if not _orchestrators:
        return _demo_points()

    results_q = queue.Queue()
    
    def run_worker(name, handle):
        resp = _send(handle, {"cmd": "analyze", "image_path": image_path}, timeout=60.0)
        if resp and "coords" in resp:
            results_q.put((name, resp["coords"]))

    threads = []
    for name, handle in list(_orchestrators.items()):
        if handle["proc"].poll() is None:
            t = threading.Thread(target=run_worker, args=(name, handle))
            t.start()
            threads.append(t)
            
    for t in threads:
        t.join(timeout=65.0)

    name_to_coords = {}
    
    while not results_q.empty():
        _, coords_list = results_q.get()
        parsed = parse_coords(coords_list)
        for pt in parsed:
            name = pt["name"]
            if name not in name_to_coords:
                name_to_coords[name] = []
            name_to_coords[name].append((pt["x"], pt["y"]))

    if not name_to_coords:
        return _demo_points()

    final_points = []
    
    CORE_MAP = {
        "ТБ-Л": "p1",
        "ТБ-П": "p2",
        "ТН-Л": "p3",
        "ТН-П": "p4",
        "БВК-Л": "p5",
        "БВК-П": "p6",
    }
    
    used_pids = set()

    for name, coords_list in name_to_coords.items():
        valid_coords = [c for c in coords_list if not (round(c[0], 2) <= 15.0 and round(c[1], 2) <= 15.0)]
        for i, (px, py) in enumerate(valid_coords):
            pid = CORE_MAP.get(name, name)
            unique_pid = pid if i == 0 else f"{pid}_{i}"
            final_points.append(Point(id=unique_pid, name=name, x=round(px, 2), y=round(py, 2)))
            if unique_pid.startswith("p") and i == 0:
                used_pids.add(pid)
            
    core_ids = ["p1", "p2", "p3", "p4", "p5", "p6"]
    if len(used_pids) < 6:
        demos = _demo_points()
        for idx, cid in enumerate(core_ids):
            if cid not in used_pids:
                final_points.append(demos[idx])

    return final_points


def _demo_points() -> List[Point]:
    return [
        Point(id="p1", name="ТБ-Л", x=145, y=220),
        Point(id="p2", name="ТБ-П", x=367, y=218),
        Point(id="p3", name="ТН-Л", x=180, y=260),
        Point(id="p4", name="ТН-П", x=332, y=258),
        Point(id="p5", name="БВК-Л", x=195, y=195),
        Point(id="p6", name="БВК-П", x=317, y=193),
    ]

# Rewrite log file at startup block
if ENABLE_MODULE_LOGGING:
    try:
        if _MODULES_DIR.exists():
            with open(_LOG_FILE, "w", encoding="utf-8") as f:
                f.write(f"--- Log started at {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")
    except Exception:
        pass
