from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from noname_env import ACTION_DIM, NonameEnv


def pick_action(mask: np.ndarray) -> int:
    legal = np.flatnonzero(mask)
    if legal.size > 0:
        return int(np.random.choice(legal))
    return ACTION_DIM - 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=str, default=str(Path(__file__).resolve().parents[4]))
    parser.add_argument("--episodes", type=int, default=2)
    parser.add_argument("--max-steps", type=int, default=300)
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--mode", type=str, default="single")
    parser.add_argument("--single-mode", type=str, default="normal")
    parser.add_argument("--seat", type=int, default=0)
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--show-snapshot", action="store_true")
    args = parser.parse_args()

    np.random.seed(args.seed)
    env = NonameEnv(
        repo_root=args.repo_root,
        mode=args.mode,
        single_mode=args.single_mode,
        seat=args.seat,
        seed=args.seed,
        debug=args.debug,
    )
    try:
        for ep in range(args.episodes):
            obs, info = env.reset(seed=args.seed + ep)
            total_reward = 0.0
            steps = 0
            done = False
            while not done and steps < args.max_steps:
                mask = info["action_mask"]
                action = pick_action(mask)
                obs, reward, terminated, truncated, info = env.step(action)
                del obs
                if args.show_snapshot and steps == 0:
                    snap = env.get_snapshot()
                    print(
                        "snapshot:",
                        "event=",
                        snap.get("event"),
                        "me=",
                        snap.get("mePlayerId"),
                        "players=",
                        len(snap.get("players", [])),
                    )
                total_reward += reward
                steps += 1
                done = terminated or truncated
            print(f"episode={ep} steps={steps} done={done} reward={total_reward:.3f}")
    finally:
        env.close()


if __name__ == "__main__":
    main()
