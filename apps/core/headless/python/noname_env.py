from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import threading
from collections import deque
from pathlib import Path
from typing import Any

import numpy as np

try:
    import gymnasium as gym
    from gymnasium import spaces
except Exception as e:  # pragma: no cover
    raise RuntimeError("gymnasium is required. Install with: pip install gymnasium") from e


PMAX = 8
HMAX = 20
BMAX = 30
ACTION_DIM = HMAX + PMAX + BMAX + 2
OBS_DIM = PMAX * 5 + HMAX * 3 + 2


class NonameEnv(gym.Env[np.ndarray, int]):
    metadata = {"render_modes": []}

    def __init__(
        self,
        repo_root: str | os.PathLike[str],
        mode: str = "single",
        single_mode: str = "normal",
        seat: int = 0,
        seed: int = 0,
        debug: bool = False,
    ) -> None:
        super().__init__()
        self.repo_root = Path(repo_root).resolve()
        self.core_dir = self.repo_root / "apps" / "core"
        self.mode = mode
        self.single_mode = single_mode
        self.seat = seat
        self.base_seed = int(seed)
        self.debug = debug

        self.action_space = spaces.Discrete(ACTION_DIM)
        self.observation_space = spaces.Box(
            low=-1e9, high=1e9, shape=(OBS_DIM,), dtype=np.float32
        )

        self._proc: subprocess.Popen[str] | None = None
        self._stderr_thread: threading.Thread | None = None
        self._stderr_stop = threading.Event()
        self._stderr_tail: deque[str] = deque(maxlen=120)
        self._stdout_queue: "queue.Queue[str]" = queue.Queue()
        self._stdout_thread: threading.Thread | None = None
        self._stdout_stop = threading.Event()
        self._last_mask = np.zeros(ACTION_DIM, dtype=np.bool_)
        self._episode_seed = self.base_seed

    def _build_cmd(self) -> tuple[list[str], dict[str, str], Path]:
        env = os.environ.copy()
        env["TSX_TSCONFIG"] = str(self.core_dir / "tsconfig.json")
        if self.debug:
            env["NONAME_HEADLESS_DEBUG"] = "1"
        else:
            env.pop("NONAME_HEADLESS_DEBUG", None)

        pnpm = shutil.which("pnpm")
        if pnpm:
            return (
                [pnpm, "tsx", "headless/rl_server.ts"],
                env,
                self.core_dir,
            )

        loader = self.repo_root / "node_modules" / "tsx" / "dist" / "loader.mjs"
        if loader.exists():
            node = shutil.which("node")
            if not node:
                raise RuntimeError("node is required but not found in PATH")
            return (
                [node, "--import", loader.as_uri(), "headless/rl_server.ts"],
                env,
                self.core_dir,
            )

        raise RuntimeError(
            "Cannot launch rl_server: neither pnpm nor node_modules/tsx/dist/loader.mjs is available"
        )

    def _drain_stderr(self) -> None:
        assert self._proc is not None and self._proc.stderr is not None
        while not self._stderr_stop.is_set():
            line = self._proc.stderr.readline()
            if line == "":
                return
            self._stderr_tail.append(line.rstrip("\n"))

    def _drain_stdout(self) -> None:
        assert self._proc is not None and self._proc.stdout is not None
        while not self._stdout_stop.is_set():
            line = self._proc.stdout.readline()
            if line == "":
                return
            self._stdout_queue.put(line.rstrip("\n"))

    def _start(self, seed: int) -> None:
        cmd, env, cwd = self._build_cmd()
        self._proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        self._stderr_stop.clear()
        self._stdout_stop.clear()
        self._stderr_tail.clear()
        self._stderr_thread = threading.Thread(target=self._drain_stderr, daemon=True)
        self._stderr_thread.start()
        self._stdout_thread = threading.Thread(target=self._drain_stdout, daemon=True)
        self._stdout_thread.start()

        hello = {
            "cmd": "hello",
            "seed": int(seed),
            "mode": self.mode,
            "single_mode": self.single_mode,
            "seat": int(self.seat),
        }
        self._write_json(hello)

    def _write_json(self, msg: dict[str, Any]) -> None:
        if self._proc is None or self._proc.stdin is None:
            raise RuntimeError("Node process is not running")
        self._proc.stdin.write(json.dumps(msg, ensure_ascii=False) + "\n")
        self._proc.stdin.flush()

    def _read_json(self, timeout_s: float = 30.0) -> dict[str, Any]:
        if self._proc is None:
            raise RuntimeError("Node process is not running")
        try:
            line = self._stdout_queue.get(timeout=timeout_s)
        except queue.Empty as e:
            err = "\n".join(self._stderr_tail)
            raise RuntimeError(f"Timeout waiting Node response.\nStderr tail:\n{err}") from e
        try:
            return json.loads(line)
        except Exception as e:
            err = "\n".join(self._stderr_tail)
            raise RuntimeError(f"Invalid JSON from Node: {line}\nStderr tail:\n{err}") from e

    def _decode_step(self, msg: dict[str, Any]) -> tuple[np.ndarray, float, bool]:
        obs = np.asarray(msg.get("obs", []), dtype=np.float32)
        if obs.shape != (OBS_DIM,):
            fixed = np.zeros((OBS_DIM,), dtype=np.float32)
            n = min(OBS_DIM, obs.size)
            if n > 0:
                fixed[:n] = obs.reshape(-1)[:n]
            obs = fixed
        mask = np.asarray(msg.get("mask", []), dtype=np.bool_)
        if mask.shape != (ACTION_DIM,):
            fixed_mask = np.zeros((ACTION_DIM,), dtype=np.bool_)
            n = min(ACTION_DIM, mask.size)
            if n > 0:
                fixed_mask[:n] = mask.reshape(-1)[:n]
            mask = fixed_mask
        self._last_mask = mask
        reward = float(msg.get("reward", 0.0))
        done = bool(msg.get("done", False))
        return obs, reward, done

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        del options
        self.close()
        self._episode_seed = self.base_seed if seed is None else int(seed)
        self._start(self._episode_seed)
        obs, _, done = self._decode_step(self._read_json(timeout_s=40.0))
        info = {"action_mask": self._last_mask.copy()}
        if done:
            self._episode_seed += 1
            self.close()
            self._start(self._episode_seed)
            obs, _, _ = self._decode_step(self._read_json(timeout_s=40.0))
            info = {"action_mask": self._last_mask.copy()}
        return obs, info

    def step(self, action: int):
        if self._proc is None:
            raise RuntimeError("Environment is closed; call reset() first")
        action_i = int(action)
        if action_i < 0 or action_i >= ACTION_DIM:
            raise ValueError(f"action out of range: {action_i}")
        self._write_json({"cmd": "step", "action": action_i})
        obs, reward, done = self._decode_step(self._read_json(timeout_s=40.0))
        terminated = done
        truncated = False
        info = {"action_mask": self._last_mask.copy()}
        if done:
            self.close()
        return obs, reward, terminated, truncated, info

    def action_masks(self) -> np.ndarray:
        return self._last_mask.copy()

    def get_snapshot(self) -> dict[str, Any]:
        if self._proc is None:
            raise RuntimeError("Environment is closed; call reset() first")
        self._write_json({"cmd": "snapshot"})
        msg = self._read_json(timeout_s=10.0)
        snap = msg.get("snapshot")
        if not isinstance(snap, dict):
            raise RuntimeError(f"snapshot unavailable: {msg}")
        return snap

    def close(self) -> None:
        if self._proc is not None:
            try:
                if self._proc.poll() is None:
                    self._proc.kill()
            except Exception:
                pass
            self._proc = None

        self._stderr_stop.set()
        self._stdout_stop.set()
        self._stderr_thread = None
        self._stdout_thread = None
