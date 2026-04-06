import asyncio
import json
from asyncio.subprocess import Process
from typing import Optional


class GameSession:
    def __init__(self):
        self._process: Optional[Process] = None
        self._lock = asyncio.Lock()
        self.is_running = False

    async def start(
        self,
        players: list[str],
        tribes: list[str],
        mode: str = "Capitals",
        seed: int = -1,
    ) -> dict:
        self._process = await asyncio.create_subprocess_exec(
            "java", "-cp", "out:lib/json.jar", "core.game.CLIRunner",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        response = await self._send(
            {"cmd": "init", "players": players, "tribes": tribes,
             "mode": mode, "seed": seed}
        )
        self.is_running = True
        return response

    async def _send(self, cmd: dict) -> dict:
        async with self._lock:
            self._process.stdin.write((json.dumps(cmd) + "\n").encode())
            await self._process.stdin.drain()
            raw = await self._process.stdout.readline()
            return json.loads(raw.decode())

    async def get_actions(self) -> dict:
        return await self._send({"cmd": "actions"})

    async def apply_action(self, action_id: int) -> dict:
        return await self._send({"cmd": "apply", "action_id": action_id})

    async def advance(self) -> dict:
        return await self._send({"cmd": "advance"})

    async def stop(self):
        if self._process:
            self._process.kill()
            await self._process.wait()
            self._process = None
        self.is_running = False
