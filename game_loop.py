import asyncio
from typing import Optional
from game_session import GameSession


class GameLoop:
    def __init__(self, session: GameSession):
        self.session = session
        self._subscribers: set[asyncio.Queue] = set()
        self._human_queue: asyncio.Queue = asyncio.Queue()
        self._task: Optional[asyncio.Task] = None
        self.last_state: Optional[dict] = None

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

    async def _run(self, initial_state: dict) -> None:
        state = initial_state
        await self._broadcast(state)

        while not state.get("game_over"):
            active_idx = state["active_tribe"]
            is_human = state["tribes"][active_idx]["is_human"]

            if is_human:
                action_id = await self._human_queue.get()
                response = await self.session.apply_action(action_id)
            else:
                await asyncio.sleep(0.4)   # pace AI moves for the browser
                response = await self.session.advance()

            state = response.get("state", state)
            if response.get("status") == "game_over":
                state = dict(state)
                state["game_over"] = True
                state["winner"] = response.get("winner", "unknown")

            await self._broadcast(state)

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
