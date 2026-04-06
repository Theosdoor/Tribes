# Tribes Web Interface Design

**Date:** 2026-04-06
**Status:** Approved

## Goal

Enable playing and watching Tribes games in a browser over an SSH connection, with no local installs and no admin privileges on the server. Python (uv/FastAPI) serves the web layer; Java handles all game logic.

## Architecture

```
Browser  ←→  FastAPI (Python/uv)  ←→  Java subprocess (stdin/stdout JSON)
              │
              ├── WebSocket /ws       push board state after every move
              ├── POST /game/start    spawn Java, init game
              ├── GET  /game/actions  legal actions for current human turn
              ├── POST /game/action   submit human action by ID
              ├── POST /game/stop     kill subprocess
              └── Static /           serves HTML/JS/CSS frontend
```

Three processes: browser, Python server, Java game. Python orchestrates — it spawns Java, drives the AI game loop, and is the sole interface the browser sees. Java has no knowledge of the web layer.

## Java changes — `CLIRunner.java`

A new headless entry point alongside `Play.java` and `Tournament.java`, compiled into the same `out/` directory. Communicates via a newline-delimited JSON protocol on stdin/stdout.

**Commands (Python → Java via stdin):**

```json
{"cmd": "init", "players": ["HUMAN", "MCTS"], "tribes": ["Xin Xi", "Imperius"], "mode": "Capitals", "seed": -1}
{"cmd": "actions"}
{"cmd": "apply", "action_id": 3}
{"cmd": "advance"}
```

- `init` — set up a new game with given config
- `actions` — return list of legal actions for the current active tribe
- `apply` — apply a human-chosen action by its index in the actions list
- `advance` — run the current AI agent's `act()` once, apply that single action, return new state. Python calls this repeatedly until `active_tribe` changes, broadcasting each intermediate state for a live feel

**Replies (Java → Python via stdout):**

```json
{"status": "ok", "state": {...}}
{"status": "ok", "actions": [...]}
{"status": "game_over", "winner": "Xin Xi", "state": {...}}
{"status": "error", "message": "..."}
```

**State JSON structure:**
- `tick` — current turn number
- `active_tribe` — index of tribe whose turn it is
- `board` — 2D array of tiles, each with: `terrain`, `resource` (nullable), `building` (nullable), `unit` (nullable: `{type, tribe, hp, max_hp, moved, attacked}`)
- `tribes` — array of `{name, stars, cities, techs_researched, is_human, is_alive}`
- `game_mode` — `"Capitals"` or `"Score"`

## Python project — `web/`

uv project at repo root `web/`. VS Code port forwarding exposes the uvicorn port to the browser.

```
web/
├── pyproject.toml       # deps: fastapi, uvicorn[standard]
├── main.py              # FastAPI app, routes, WebSocket endpoint
├── game_session.py      # Java subprocess lifecycle, stdin/stdout JSON protocol
├── game_loop.py         # asyncio task: drives AI turns, broadcasts state via WS
└── static/
    ├── index.html
    ├── game.js
    └── style.css
```

**`game_session.py`** owns the subprocess. Uses `asyncio.subprocess` with a lock to serialise stdin/stdout access. Exposes async methods: `init()`, `get_actions()`, `apply_action(id)`, `advance()`.

**`game_loop.py`** runs as a background `asyncio` task once a game starts:
1. Check whose turn it is from the latest state
2. If AI turn: call `advance()`, broadcast new state to all WebSocket clients, repeat
3. If human turn: pause and wait for a `/game/action` POST, then resume
4. If `game_over`: broadcast final state with winner, stop task

**WebSocket** at `/ws` — clients subscribe and receive every state update as JSON. No client-to-server messages over WebSocket (actions go via REST).

## Frontend

Single-page app, no framework, served as static files by FastAPI.

**Setup view** (shown before game starts):
- Dropdowns to select player type (Human / MCTS / RHEA / RANDOM / etc.) and tribe for each slot (2–4 players)
- Game mode selector (Capitals / Score)
- Start button → POST `/game/start`

**Game view** (shown once game is running):
- Board: rendered on HTML canvas or CSS grid — decided during implementation with `/frontend-design`
- Tribe info panel: stars, cities, researched techs, whose turn it is
- Action panel (human turns only): scrollable list of available actions, each clickable → POST `/game/action`
- Status bar: turn number, "AI thinking..." indicator during AI turns, winner announcement on game over

WebSocket drives all live updates — the JS client re-renders the board and panels on every received state message.

## Running

```bash
# 1. Compile Java (once, or after Java changes)
javac -cp lib/json.jar -sourcepath src -d out $(find src -name "*.java")

# 2. Start Python server
cd web
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

VS Code detects port 8000 and offers to forward it. Open in browser.

## Future extensions (out of scope for this spec)

- Game configuration stored per-session (not global `play.json`)
- Stats dashboard (win rates, score history, tech progression)
- Tournament runner UI
- Replay viewer
- Agent parameter tuning from the UI
