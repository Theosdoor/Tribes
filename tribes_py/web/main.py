from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .game_loop import GameLoop
from .game_session import GameSession

# Resolve static directory relative to this file
_HERE = Path(__file__).resolve().parent
_STATIC = _HERE / "static"

app = FastAPI(title="Tribes")
app.mount("/static", StaticFiles(directory=str(_STATIC)), name="static")

session: GameSession = GameSession()
game_loop: Optional[GameLoop] = None


class StartRequest(BaseModel):
    players: list[str]
    tribes: list[str]
    mode: str = "Capitals"
    seed: int = -1


class ActionRequest(BaseModel):
    action_id: int


@app.get("/")
async def index():
    return FileResponse(_STATIC / "index.html")


@app.post("/game/start")
async def start_game(req: StartRequest):
    global game_loop
    if game_loop:
        await game_loop.stop()
        game_loop = None
    await session.stop()

    response = await session.start(req.players, req.tribes, req.mode, req.seed)
    if response.get("status") not in ("ok", "game_over"):
        raise HTTPException(status_code=400, detail=response.get("message", "Java error"))

    game_loop = GameLoop(session)
    game_loop.start(response["state"])
    return {"status": "ok"}


@app.get("/game/actions")
async def get_actions():
    if not session.is_running:
        raise HTTPException(status_code=400, detail="No game running")
    return await session.get_actions()


@app.post("/game/action")
async def submit_action(req: ActionRequest):
    if not game_loop:
        raise HTTPException(status_code=400, detail="No game running")
    await game_loop.submit_action(req.action_id)
    return {"status": "ok"}


@app.post("/game/stop")
async def stop_game():
    global game_loop
    if game_loop:
        await game_loop.stop()
        game_loop = None
    await session.stop()
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    if not game_loop:
        await ws.close(code=1008)
        return
    if game_loop.last_state:
        await ws.send_json(game_loop.last_state)
    queue = game_loop.subscribe()
    try:
        while True:
            state = await queue.get()
            await ws.send_json(state)
    except WebSocketDisconnect:
        pass
    finally:
        game_loop.unsubscribe(queue)
