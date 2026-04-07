import asyncio
from typing import Optional
from .game_session import GameSession


class GameLoop:
    def __init__(self, session: GameSession):
        self.session = session
        self._subscribers: set[asyncio.Queue] = set()
        self._human_queue: asyncio.Queue = asyncio.Queue()
        self._task: Optional[asyncio.Task] = None
        self.last_state: Optional[dict] = None

        self._paused: asyncio.Event = asyncio.Event()
        self._paused.set()          # starts unpaused (running)
        self._play_mode: Optional[str] = None   # None | "turn" | "tick"
        self._play_mode_start_tribe: int = -1
        self._play_mode_start_tick: int = -1

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    async def _broadcast(self, state: dict) -> None:
        self.last_state = state
        for q in list(self._subscribers):
            await q.put(state)

    async def submit_action(self, action_id: int) -> None:
        await self._human_queue.put(action_id)

    def pause(self) -> None:
        self._paused.clear()
        self._play_mode = None

    def resume(self) -> None:
        self._paused.set()

    def play_turn(self) -> None:
        if self.last_state:
            self._play_mode = "turn"
            self._play_mode_start_tribe = self.last_state.get("active_tribe", -1)
        self._paused.set()

    def play_tick(self) -> None:
        if self.last_state:
            self._play_mode = "tick"
            self._play_mode_start_tick = self.last_state.get("tick", -1)
        self._paused.set()

    async def _run(self, initial_state: dict) -> None:
        state = initial_state
        await self._broadcast(state)

        while not state.get("game_over"):
            await self._paused.wait()

            active_idx = state["active_tribe"]
            is_human = state["tribes"][active_idx]["is_human"]

            if is_human:
                action_id = await self._human_queue.get()
                response = await self.session.apply_action(action_id)
            else:
                await asyncio.sleep(0.4)
                response = await self.session.advance()

            state = response.get("state", state)
            if response.get("status") == "game_over":
                state = dict(state)
                state["game_over"] = True
                state["winner"] = response.get("winner", "unknown")

            await self._broadcast(state)

            if self._play_mode == "turn":
                if state.get("active_tribe") != self._play_mode_start_tribe:
                    self._paused.clear()
                    self._play_mode = None
            elif self._play_mode == "tick":
                if state.get("tick", -1) > self._play_mode_start_tick:
                    self._paused.clear()
                    self._play_mode = None

    def start(self, initial_state: dict) -> None:
        self._task = asyncio.create_task(self._run(initial_state))

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
