"""Resume the real photo-v2 experiment unattended, preserving final-test locks.

Run from the repository with .venv/Scripts/python.exe scripts/run_photo_training.py.
Original photographs and feature caches stay under ignored data/. Output logs
contain progress and aggregate research metrics, never user-uploaded images.
"""
from __future__ import annotations
import ctypes
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "data/photo-v2/training-state.json"
LOCK = ROOT / "data/photo-v2/training-process.lock"
MODEL = ROOT / "models/photo-v2"


def state(**value):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    temp = STATE.with_suffix(".tmp")
    temp.write_text(json.dumps({"pid": os.getpid(), "updated_unix": time.time(), **value}, indent=2) + "\n", encoding="utf-8")
    temp.replace(STATE)


def run(script, phase, *extra):
    command = [sys.executable, str(ROOT / "scripts" / script), phase, *extra]
    state(status="running", script=script, phase=phase, extra=list(extra))
    print(json.dumps({"phase": "start", "script": script, "step": phase, "extra": extra}), flush=True)
    environment = {**os.environ, "OMP_NUM_THREADS": "4", "MKL_NUM_THREADS": "4", "OPENBLAS_NUM_THREADS": "4", "PYTHONUNBUFFERED": "1"}
    subprocess.run(command, cwd=ROOT, env=environment, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wait-pid", type=int, help="Wait for an already-running owned extraction process before resuming the pipeline.")
    args = parser.parse_args()
    # A native file handle prevents a heartbeat/restart from launching a second
    # training job. Windows byte-range locking also releases on process death.
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    handle = LOCK.open("a+b")
    handle.seek(0); handle.write(b"0"); handle.flush(); handle.seek(0)
    if os.name == "nt":
        import msvcrt
        try: msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError: raise SystemExit("Another photo training pipeline already owns the lock.")
        # Keep this explicitly requested overnight computation awake while it
        # runs; do not change persistent Windows power settings or display state.
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)
    else:
        import fcntl
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    try:
        if args.wait_pid:
            if args.wait_pid <= 0: raise ValueError("Wait PID must be positive")
            state(status="waiting_feature_job", wait_pid=args.wait_pid)
            if os.name != "nt": raise RuntimeError("The wait-pid helper is Windows-only.")
            subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", f"Wait-Process -Id {args.wait_pid} -ErrorAction SilentlyContinue"], creationflags=subprocess.CREATE_NO_WINDOW, check=False)
        if (MODEL / "onnx-evaluation.json").exists() and (ROOT / "public/model-photo/manifest.json").exists():
            state(status="evaluation_complete", message="Artifacts already evaluated; website/browser integration still requires verification.")
            return
        test_opened = (MODEL / "test-lock.json").exists() or (MODEL / "categories-test-lock.json").exists()
        if not test_opened:
            for backbone in ["dinov2_vits14", "dinov2_vitb14"]:
                run("photo_model_train.py", "extract", "--backbone", backbone)
                if not (MODEL / (backbone + "-validation.json")).exists():
                    run("photo_model_train.py", "fit", "--backbone", backbone)
                if not (MODEL / ("categories-" + backbone + "-validation.json")).exists():
                    run("photo_categories_train.py", "fit", "--backbone", backbone)
            run("photo_categories_train.py", "lock")
            if not (MODEL / "export-lock.json").exists(): run("photo_model_export.py", "export")
        # Locked protocol and export must precede either task's shared holdout.
        if not (MODEL / "export-lock.json").exists() or not (MODEL / "categories-selection-lock.json").exists():
            raise RuntimeError("Selection/export lock missing; final test cannot be opened.")
        candidates = [json.loads((MODEL / (name + "-validation.json")).read_text(encoding="utf-8")) for name in ["dinov2_vits14", "dinov2_vitb14"]]
        selected = max(candidates, key=lambda row: (row["validation"]["macro_f1"], row["validation"]["balanced_accuracy"]))["backbone"]
        if not (MODEL / "evaluation.json").exists(): run("photo_model_train.py", "evaluate", "--backbone", selected)
        if not (MODEL / "categories-evaluation.json").exists(): run("photo_categories_train.py", "evaluate")
        if not (MODEL / "onnx-evaluation.json").exists(): run("photo_model_export.py", "evaluate")
        manifest = json.loads((ROOT / "public/model-photo/manifest.json").read_text(encoding="utf-8"))
        state(status="evaluation_complete", benchmark_passed=manifest["available"], message="Real training and final evaluation complete. Browser parity, documentation and website publication remain.")
    except Exception as exc:
        state(status="failed", error=str(exc))
        raise
    finally:
        if os.name == "nt": ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
        handle.close()


if __name__ == "__main__": main()
