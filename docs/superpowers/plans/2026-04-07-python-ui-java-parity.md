# Python UI — Java Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Python browser UI to full feature parity with the Java Swing UI: map interaction, tile info, tech tree, game controls, action log, pan/zoom, dialogs.

**Architecture:** Java CLIRunner enriches state/action JSON → Python game_loop gains pause/play-mode → Frontend is split into focused JS modules (state, canvas, panels, tech-tree, dialogs) loaded in order via sequential `<script>` tags in index.html; all modules share global scope. DOMPurify is used for all innerHTML assignments with dynamic data.

**Tech Stack:** Java 8 (CLIRunner), Python 3.12 / FastAPI / asyncio, Vanilla JS / HTML5 Canvas, DOMPurify (XSS sanitisation), pytest (tests)

**Spec:** `docs/superpowers/specs/2026-04-07-python-ui-java-parity-design.md`

---

## File Map

**New files:**
- `tribes_py/web/static/state.js` — module state globals, `buildActionMap()`, `submitAction()`
- `tribes_py/web/static/canvas.js` — board rendering, pan/zoom, click handling, highlights, animations
- `tribes_py/web/static/panels.js` — `renderLeftPanel()`, right-panel buttons, action log
- `tribes_py/web/static/tech-tree.js` — `TECH_TREE` / `TECH_UNLOCKS` constants, tech modal
- `tribes_py/web/static/dialogs.js` — `showDialog()`, all dialogs, game control button wiring

**Modified files:**
- `src/core/game/CLIRunner.java` — enriched serializers
- `tribes_py/web/game_loop.py` — pause / play-mode
- `tribes_py/web/main.py` — 4 new endpoints
- `tribes_py/web/static/game.js` — refactored to delegate to new modules
- `tribes_py/web/static/index.html` — DOMPurify CDN, new `<script>` tags, layout additions
- `tribes_py/web/static/style.css` — styles for panels, modal, log, controls
- `tests/test_api.py` — tests for 4 new endpoints

---

## Task 1: CLIRunner — enrich state serialization

Add unit combat stats, city details, tribe production/agent/techs, `leveling_up` flag, and `last_action` to every state response.

**Files:**
- Modify: `src/core/game/CLIRunner.java`

- [ ] **Step 1: Add imports at top of CLIRunner.java (after existing imports)**

```java
import core.TechnologyTree;
import core.actors.City;
```

- [ ] **Step 2: Add `lastActionDesc` instance variable**

After the `private boolean[] isHuman;` declaration, add:

```java
private String lastActionDesc = null;
```

- [ ] **Step 3: Replace `serializeUnit()`**

```java
private JSONObject serializeUnit(Unit unit) {
    JSONObject u = new JSONObject();
    u.put("type",       unit.getType().toString());
    u.put("tribe_id",   unit.getTribeId());
    u.put("hp",         unit.getCurrentHP());
    u.put("max_hp",     unit.getMaxHP());
    Vector2d pos = unit.getPosition();
    u.put("x",          pos.x);
    u.put("y",          pos.y);
    u.put("is_veteran", unit.isVeteran());
    u.put("can_move",   unit.canMove());
    u.put("can_attack", unit.canAttack());
    u.put("atk",        unit.ATK);
    u.put("def",        unit.DEF);
    u.put("mov",        unit.MOV);
    u.put("range",      unit.RANGE);
    u.put("kills",      unit.getKills());
    u.put("status",     unit.getStatus().toString());
    return u;
}
```

- [ ] **Step 4: Update `serializeBoard()` — add city sub-object to tiles**

Replace the existing `tile.put("city_id", board.getCityIdAt(x, y));` line with:

```java
int cityId = board.getCityIdAt(x, y);
tile.put("city_id", cityId);
if (cityId >= 0) {
    City c = (City) board.getActor(cityId);
    if (c != null) {
        JSONObject cityJson = new JSONObject();
        cityJson.put("is_capital",   c.isCapital());
        cityJson.put("production",   c.getProduction());
        cityJson.put("points_worth", c.getPointsWorth());
        tile.put("city", cityJson);
    }
}
```

- [ ] **Step 5: Replace `serializeTribes()`**

```java
private JSONArray serializeTribes() {
    Tribe[] tribes = gs.getTribes();
    JSONArray arr = new JSONArray();
    for (int i = 0; i < tribes.length; i++) {
        Tribe t = tribes[i];
        JSONObject tj = new JSONObject();
        tj.put("id",             i);
        tj.put("name",           t.getType().toString());
        tj.put("stars",          t.getStars());
        tj.put("num_cities",     t.getNumCities());
        tj.put("is_human",       isHuman[i]);
        tj.put("winner",         t.getWinner().toString());
        tj.put("score",          t.getScore());
        tj.put("num_techs",      countResearchedTechs(t));
        tj.put("max_production", t.getMaxProduction(gs));
        tj.put("agent_type",     isHuman[i] ? "HUMAN" : agents[i].getClass().getSimpleName());
        TechnologyTree tt = t.getTechTree();
        JSONArray techArr = new JSONArray();
        for (Types.TECHNOLOGY tech : Types.TECHNOLOGY.values()) {
            if (tt.isResearched(tech)) techArr.put(tech.toString());
        }
        tj.put("techs", techArr);
        arr.put(tj);
    }
    return arr;
}
```

- [ ] **Step 6: Update `serializeState()` — add `leveling_up` and `last_action`**

After `state.put("tribes", serializeTribes());`, add:

```java
state.put("leveling_up", gs.isLevelingUp());
state.put("last_action", lastActionDesc != null ? lastActionDesc : JSONObject.NULL);
```

- [ ] **Step 7: Record last action in `applyAndRespond()`**

At the top of `applyAndRespond(Action action)`, before `gs.advance(action, true);`, add:

```java
lastActionDesc = action.toString();
```

- [ ] **Step 8: Compile and smoke test**

```bash
javac -cp lib/json.jar -sourcepath src -d out $(find src -name "*.java")
echo '{"cmd":"init","players":["RANDOM","RANDOM"],"tribes":["Bardur","Imperius"],"mode":"Capitals","seed":42}' \
  | java -cp out:lib/json.jar core.game.CLIRunner
```

Expected: JSON with `"status":"ok"`, state containing `"leveling_up":false`, `"last_action":null`, tribes with `"techs":[]`, `"max_production":N`, `"agent_type":"RandomAgent"`, and board tiles with `"city":{...}` on city tiles.

- [ ] **Step 9: Commit**

```bash
rtk git add src/core/game/CLIRunner.java
rtk git commit -m "feat(java): enrich state serialization with unit stats, city details, tribe techs"
```

---

## Task 2: CLIRunner — enrich action serialization

Add positional/target data to every serialized action.

**Files:**
- Modify: `src/core/game/CLIRunner.java`

- [ ] **Step 1: Add imports (skip any already present)**

```java
import core.actions.cityactions.CityAction;
import core.actions.unitactions.Attack;
import core.actions.unitactions.Convert;
import core.actions.unitactions.Move;
import core.actions.unitactions.UnitAction;
import core.actions.tribeactions.BuildRoad;
import core.actions.tribeactions.DeclareWar;
import core.actions.tribeactions.ResearchTech;
import core.actions.tribeactions.SendStars;
```

- [ ] **Step 2: Replace `serializeActions()`**

```java
private JSONArray serializeActions() {
    ArrayList<Action> actions = gs.getAllAvailableActions();
    JSONArray arr = new JSONArray();
    for (int i = 0; i < actions.size(); i++) {
        Action a = actions.get(i);
        JSONObject aj = new JSONObject();
        aj.put("id",          i);
        aj.put("type",        a.getActionType().toString());
        aj.put("description", a.toString());

        // Unit origin position (all unit actions)
        if (a instanceof UnitAction) {
            Unit unit = (Unit) gs.getActor(((UnitAction) a).getUnitId());
            if (unit != null) {
                aj.put("unit_x", unit.getPosition().x);
                aj.put("unit_y", unit.getPosition().y);
            }
        }

        // Target position by action type
        switch (a.getActionType()) {
            case MOVE: {
                Vector2d dest = ((Move) a).getDestination();
                aj.put("target_x", dest.x);
                aj.put("target_y", dest.y);
                break;
            }
            case ATTACK: {
                Unit target = (Unit) gs.getActor(((Attack) a).getTargetId());
                if (target != null) {
                    aj.put("target_x", target.getPosition().x);
                    aj.put("target_y", target.getPosition().y);
                }
                break;
            }
            case CONVERT: {
                Unit target = (Unit) gs.getActor(((Convert) a).getTargetId());
                if (target != null) {
                    aj.put("target_x", target.getPosition().x);
                    aj.put("target_y", target.getPosition().y);
                }
                break;
            }
            case HEAL_OTHERS:
            case CAPTURE:
            case EXAMINE:
            case RECOVER:
            case MAKE_VETERAN:
            case DISBAND:
            case UPGRADE_BOAT:
            case UPGRADE_SHIP: {
                // target tile is the unit's own position
                if (a instanceof UnitAction) {
                    Unit unit = (Unit) gs.getActor(((UnitAction) a).getUnitId());
                    if (unit != null) {
                        aj.put("target_x", unit.getPosition().x);
                        aj.put("target_y", unit.getPosition().y);
                    }
                }
                break;
            }
            case SPAWN:
            case BUILD:
            case RESOURCE_GATHERING:
            case BURN_FOREST:
            case CLEAR_FOREST:
            case GROW_FOREST:
            case DESTROY: {
                CityAction ca = (CityAction) a;
                aj.put("city_id", ca.getCityId());
                Vector2d tp = ca.getTargetPos();
                if (tp != null) {
                    aj.put("target_x", tp.x);
                    aj.put("target_y", tp.y);
                }
                break;
            }
            case LEVEL_UP: {
                aj.put("city_id", ((CityAction) a).getCityId());
                break;
            }
            case RESEARCH_TECH: {
                aj.put("tech", ((ResearchTech) a).getTech().toString());
                break;
            }
            case SEND_STARS: {
                SendStars ss = (SendStars) a;
                aj.put("target_tribe_id", ss.getTargetID());
                aj.put("stars",           ss.getNumStars());
                break;
            }
            case DECLARE_WAR: {
                aj.put("target_tribe_id", ((DeclareWar) a).getTargetID());
                break;
            }
            case BUILD_ROAD: {
                Vector2d pos = ((BuildRoad) a).getPosition();
                aj.put("target_x", pos.x);
                aj.put("target_y", pos.y);
                break;
            }
            default:
                break;
        }
        arr.put(aj);
    }
    return arr;
}
```

- [ ] **Step 3: Compile**

```bash
javac -cp lib/json.jar -sourcepath src -d out $(find src -name "*.java")
```

Expected: no errors.

- [ ] **Step 4: Smoke test actions**

```bash
(echo '{"cmd":"init","players":["HUMAN","RANDOM"],"tribes":["Bardur","Imperius"],"mode":"Capitals","seed":42}'; \
 echo '{"cmd":"actions"}') | java -cp out:lib/json.jar core.game.CLIRunner
```

Expected: MOVE actions have `unit_x`, `unit_y`, `target_x`, `target_y`; END_TURN has only `id`, `type`, `description`.

- [ ] **Step 5: Commit**

```bash
rtk git add src/core/game/CLIRunner.java
rtk git commit -m "feat(java): enrich action serialization with positions and target data"
```

---

## Task 3: Python — game_loop pause and play-mode

**Files:**
- Modify: `tribes_py/web/game_loop.py`
- Modify: `tests/test_game_session.py`

- [ ] **Step 1: Write failing tests — append to `tests/test_game_session.py`**

```python
@pytest.mark.asyncio
async def test_pause_and_resume():
    from tribes_py.web.game_loop import GameLoop
    loop = GameLoop(MagicMock())
    assert loop._paused.is_set()   # starts running
    loop.pause()
    assert not loop._paused.is_set()
    loop.resume()
    assert loop._paused.is_set()


@pytest.mark.asyncio
async def test_play_turn_sets_mode():
    from tribes_py.web.game_loop import GameLoop
    loop = GameLoop(MagicMock())
    loop.last_state = {"tick": 0, "active_tribe": 1, "game_over": False}
    loop.play_turn()
    assert loop._play_mode == "turn"
    assert loop._play_mode_start_tribe == 1
    assert loop._paused.is_set()


@pytest.mark.asyncio
async def test_play_tick_sets_mode():
    from tribes_py.web.game_loop import GameLoop
    loop = GameLoop(MagicMock())
    loop.last_state = {"tick": 3, "active_tribe": 0, "game_over": False}
    loop.play_tick()
    assert loop._play_mode == "tick"
    assert loop._play_mode_start_tick == 3
    assert loop._paused.is_set()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_game_session.py::test_pause_and_resume \
  tests/test_game_session.py::test_play_turn_sets_mode \
  tests/test_game_session.py::test_play_tick_sets_mode -v
```

Expected: `AttributeError` — `GameLoop` has no `_paused`.

- [ ] **Step 3: Replace `tribes_py/web/game_loop.py`**

```python
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
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_game_session.py -v
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
rtk git add tribes_py/web/game_loop.py tests/test_game_session.py
rtk git commit -m "feat(python): add pause/play-mode controls to GameLoop"
```

---

## Task 4: Python — new API endpoints

**Files:**
- Modify: `tribes_py/web/main.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write failing tests — append to `tests/test_api.py`**

```python
@pytest.fixture
def client_with_controls():
    from unittest.mock import patch
    mock_session = MagicMock()
    mock_session.is_running = True
    mock_session.stop = AsyncMock()
    mock_loop = MagicMock()
    mock_loop.stop = AsyncMock()
    mock_loop.last_state = FAKE_STATE
    mock_loop.submit_action = AsyncMock()
    mock_loop.pause = MagicMock()
    mock_loop.resume = MagicMock()
    mock_loop.play_turn = MagicMock()
    mock_loop.play_tick = MagicMock()
    with patch("tribes_py.web.main.session", mock_session), \
         patch("tribes_py.web.main.game_loop", mock_loop):
        from fastapi.testclient import TestClient
        from tribes_py.web.main import app
        yield TestClient(app), mock_loop


def test_pause(client_with_controls):
    client, loop = client_with_controls
    r = client.post("/game/pause")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    loop.pause.assert_called_once()


def test_resume(client_with_controls):
    client, loop = client_with_controls
    r = client.post("/game/resume")
    assert r.status_code == 200
    loop.resume.assert_called_once()


def test_play_turn(client_with_controls):
    client, loop = client_with_controls
    r = client.post("/game/play-turn")
    assert r.status_code == 200
    loop.play_turn.assert_called_once()


def test_play_tick(client_with_controls):
    client, loop = client_with_controls
    r = client.post("/game/play-tick")
    assert r.status_code == 200
    loop.play_tick.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_api.py::test_pause tests/test_api.py::test_resume \
  tests/test_api.py::test_play_turn tests/test_api.py::test_play_tick -v
```

Expected: `404 Not Found`.

- [ ] **Step 3: Add 4 endpoints to `tribes_py/web/main.py` after `stop_game`**

```python
@app.post("/game/pause")
async def pause_game():
    if not game_loop:
        raise HTTPException(status_code=400, detail="No game running")
    game_loop.pause()
    return {"status": "ok"}


@app.post("/game/resume")
async def resume_game():
    if not game_loop:
        raise HTTPException(status_code=400, detail="No game running")
    game_loop.resume()
    return {"status": "ok"}


@app.post("/game/play-turn")
async def play_turn():
    if not game_loop:
        raise HTTPException(status_code=400, detail="No game running")
    game_loop.play_turn()
    return {"status": "ok"}


@app.post("/game/play-tick")
async def play_tick():
    if not game_loop:
        raise HTTPException(status_code=400, detail="No game running")
    game_loop.play_tick()
    return {"status": "ok"}
```

- [ ] **Step 4: Run all tests**

```bash
python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
rtk git add tribes_py/web/main.py tests/test_api.py
rtk git commit -m "feat(python): add pause/resume/play-turn/play-tick endpoints"
```

---

## Task 5: Frontend — file structure and index.html

Create 5 new JS module stubs, add DOMPurify CDN, update index.html layout with game controls and right panel structure.

**Files:**
- Create: `tribes_py/web/static/state.js`
- Create: `tribes_py/web/static/canvas.js`
- Create: `tribes_py/web/static/panels.js`
- Create: `tribes_py/web/static/tech-tree.js`
- Create: `tribes_py/web/static/dialogs.js`
- Modify: `tribes_py/web/static/index.html`

- [ ] **Step 1: Create stub files (one command)**

```bash
for f in state canvas panels tech-tree dialogs; do
  echo "// $f module" > tribes_py/web/static/$f.js
done
```

- [ ] **Step 2: Replace `tribes_py/web/static/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TRIBES :: Tactical Command</title>
    <link rel="stylesheet" href="/static/style.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Outfit:wght@300;500;700&display=swap" rel="stylesheet">
    <!-- XSS sanitisation for all innerHTML assignments -->
    <script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"></script>
</head>
<body>
    <!-- Setup View -->
    <div id="setup-view" class="view active">
        <div class="setup-container">
            <header class="setup-header">
                <h1 class="title">TRIBES</h1>
                <div class="subtitle">Tactical Command Interface</div>
            </header>
            <div class="setup-content">
                <div class="config-panel">
                    <div class="section-header">DEPLOYMENT CONFIGURATION</div>
                    <div id="players-container" class="players-grid"></div>
                    <button id="add-player-btn" class="btn-secondary">+ ADD COMBATANT</button>
                    <div class="game-mode-section">
                        <label class="input-label">MISSION OBJECTIVE</label>
                        <select id="game-mode" class="select-input">
                            <option value="Capitals">Capitals Elimination</option>
                            <option value="Score">Score Superiority</option>
                        </select>
                    </div>
                    <button id="start-game-btn" class="btn-primary">INITIATE ENGAGEMENT</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Game View -->
    <div id="game-view" class="view">
        <div class="game-container">
            <!-- Status Bar -->
            <div class="status-bar">
                <div class="status-left">
                    <span class="status-label">TURN</span>
                    <span id="turn-display" class="status-value">0</span>
                </div>
                <div class="status-center" id="status-message">
                    <span class="status-indicator"></span>
                    <span id="status-text">AWAITING ORDERS</span>
                </div>
                <div class="status-right game-controls">
                    <span class="status-label">MODE</span>
                    <span id="mode-display" class="status-value">CAPITALS</span>
                    <div class="controls-divider"></div>
                    <button id="btn-pause"     class="btn-control" title="Pause / Resume">&#9646;&#9646;</button>
                    <button id="btn-play-turn" class="btn-control" title="Play one tribe turn">&#9654;</button>
                    <button id="btn-play-tick" class="btn-control" title="Play full tick">&#9193;</button>
                    <button id="btn-quit"      class="btn-control btn-danger" title="Quit game">&#10005;</button>
                </div>
            </div>

            <!-- Main Game Area -->
            <div class="game-content">
                <!-- Left Panel: swappable (tribes / tile / tribe-tech) -->
                <div class="side-panel left-panel" id="left-panel">
                    <div id="left-panel-header" class="panel-header">
                        <span id="left-panel-title">COMBATANTS</span>
                        <button id="left-panel-close" class="panel-close-btn" style="display:none">&#10005;</button>
                    </div>
                    <div id="left-panel-content"></div>
                </div>

                <!-- Center: Canvas Board -->
                <div class="canvas-container">
                    <canvas id="game-board"></canvas>
                </div>

                <!-- Right Panel: tribe action buttons + action log -->
                <div class="side-panel right-panel">
                    <div class="panel-header">ORDERS</div>
                    <div id="tribe-actions" class="tribe-actions-section"></div>
                    <div class="panel-header panel-header-sub">ACTION LOG</div>
                    <ul id="action-log" class="action-log-list"></ul>
                </div>
            </div>
        </div>

        <!-- Game Over Overlay -->
        <div id="game-over-overlay" class="overlay">
            <div class="overlay-content">
                <div class="overlay-status">ENGAGEMENT CONCLUDED</div>
                <div id="winner-display" class="overlay-winner"></div>
                <button id="new-game-btn" class="btn-primary">NEW DEPLOYMENT</button>
            </div>
        </div>
    </div>

    <!-- Modal container (managed by dialogs.js) -->
    <div id="modal-overlay" class="modal-overlay" style="display:none">
        <div id="modal-box" class="modal-box"></div>
    </div>

    <!-- Load order: state → tech-tree → game (constants/images) → canvas → panels → dialogs -->
    <script src="/static/state.js"></script>
    <script src="/static/tech-tree.js"></script>
    <script src="/static/game.js"></script>
    <script src="/static/canvas.js"></script>
    <script src="/static/panels.js"></script>
    <script src="/static/dialogs.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify page loads**

```bash
python -m uvicorn tribes_py.web.main:app --reload
```

Open in browser, check console. Expected: no JS errors, setup view visible, DOMPurify loaded.

- [ ] **Step 4: Commit**

```bash
rtk git add tribes_py/web/static/state.js tribes_py/web/static/canvas.js \
  tribes_py/web/static/panels.js tribes_py/web/static/tech-tree.js \
  tribes_py/web/static/dialogs.js tribes_py/web/static/index.html
rtk git commit -m "feat(frontend): add JS module stubs and update index.html structure"
```

---

## Task 6: Frontend — state.js

**Files:**
- Modify: `tribes_py/web/static/state.js`

- [ ] **Step 1: Write `state.js`**

```js
// ============================================
// STATE — module globals, buildActionMap, submitAction
// ============================================

let currentState   = null;
let currentActions = [];        // flat array from /game/actions

let selectedTile    = null;     // {x, y} or null
let unitActionMap   = new Map();// "tx,ty" → Action  (unit actions by target tile)
let tileActionList  = [];       // city/tile actions targeting selectedTile

let panOffset = { x: 0, y: 0 };
let tileSize  = 48;
const TILE_SIZE_MIN  = 24;
const TILE_SIZE_MAX  = 80;
const PAN_THRESHOLD  = 4;       // px; smaller motion treated as click

let dragStart  = null;
let isDragging = false;

const UNIT_ACTION_TYPES = new Set([
    'MOVE','ATTACK','CAPTURE','CONVERT','EXAMINE',
    'HEAL_OTHERS','RECOVER','MAKE_VETERAN','DISBAND',
    'UPGRADE_BOAT','UPGRADE_SHIP',
]);
const CITY_ACTION_TYPES = new Set([
    'SPAWN','BUILD','RESOURCE_GATHERING',
    'BURN_FOREST','CLEAR_FOREST','GROW_FOREST','DESTROY','LEVEL_UP',
]);

/**
 * Build unitActionMap and tileActionList from currentActions for a selected tile.
 * @param {number} x  @param {number} y
 */
function buildActionMap(x, y) {
    unitActionMap  = new Map();
    tileActionList = [];
    for (const a of currentActions) {
        if (UNIT_ACTION_TYPES.has(a.type) && a.unit_x === x && a.unit_y === y) {
            const key = `${a.target_x},${a.target_y}`;
            if (!unitActionMap.has(key)) unitActionMap.set(key, a);
        }
        if (CITY_ACTION_TYPES.has(a.type) && a.target_x === x && a.target_y === y) {
            tileActionList.push(a);
        }
    }
}

/**
 * Submit action by id. Logs it, clears selection, posts to server.
 * @param {number} actionId  @param {string} description  @param {boolean} [isAI=false]
 */
async function submitAction(actionId, description, isAI = false) {
    appendActionLog(description, isAI);
    clearSelection();
    try {
        await fetch('/game/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action_id: actionId }),
        });
    } catch (err) {
        console.error('submitAction error:', err);
    }
}

function clearSelection() {
    selectedTile   = null;
    unitActionMap  = new Map();
    tileActionList = [];
}

async function refreshActions() {
    try {
        const r = await fetch('/game/actions');
        const data = await r.json();
        currentActions = data.actions || [];
    } catch {
        currentActions = [];
    }
}
```

- [ ] **Step 2: Verify no console errors on page load**

- [ ] **Step 3: Commit**

```bash
rtk git add tribes_py/web/static/state.js
rtk git commit -m "feat(frontend): state.js — module globals, buildActionMap, submitAction"
```

---

## Task 7: Frontend — canvas.js

Move board rendering from `game.js` into `canvas.js`. Add pan/zoom, click handling, and highlights.

**Files:**
- Modify: `tribes_py/web/static/canvas.js`
- Modify: `tribes_py/web/static/game.js`

- [ ] **Step 1: Write `canvas.js`**

```js
// ============================================
// CANVAS — rendering, pan/zoom, click, highlights, animations
// ============================================

const HIGHLIGHT_COLORS = {
    MOVE:               'rgba(52,152,219,0.45)',
    ATTACK:             'rgba(231,76,60,0.45)',
    CONVERT:            'rgba(231,76,60,0.45)',
    HEAL_OTHERS:        'rgba(46,204,113,0.45)',
    CAPTURE:            'rgba(52,152,219,0.45)',
    EXAMINE:            'rgba(52,152,219,0.45)',
    RECOVER:            'rgba(46,204,113,0.45)',
    SPAWN:              'rgba(241,196,15,0.45)',
    BUILD:              'rgba(241,196,15,0.45)',
    RESOURCE_GATHERING: 'rgba(241,196,15,0.45)',
    BURN_FOREST:        'rgba(241,196,15,0.45)',
    CLEAR_FOREST:       'rgba(241,196,15,0.45)',
    GROW_FOREST:        'rgba(241,196,15,0.45)',
    DESTROY:            'rgba(241,196,15,0.45)',
    BUILD_ROAD:         'rgba(26,188,156,0.45)',
    LEVEL_UP:           'rgba(155,89,182,0.45)',
    DEFAULT:            'rgba(255,255,255,0.25)',
};

let pendingAnimation = null; // {x, y, color, expiresAt}

function renderBoard(board, tribes) {
    const canvas = document.getElementById('game-board');
    const ctx    = canvas.getContext('2d');
    const size   = board.length;
    canvas.width  = size * tileSize;
    canvas.height = size * tileSize;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);

    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
            drawTile(ctx, x, y, board[y][x]);

    // Unit-action highlights
    for (const [key, action] of unitActionMap) {
        const [tx, ty] = key.split(',').map(Number);
        ctx.fillStyle = HIGHLIGHT_COLORS[action.type] || HIGHLIGHT_COLORS.DEFAULT;
        ctx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
    }

    // Selected tile outline
    if (selectedTile) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            selectedTile.x * tileSize + 1, selectedTile.y * tileSize + 1,
            tileSize - 2, tileSize - 2
        );
    }

    // Animation flash
    if (pendingAnimation && Date.now() < pendingAnimation.expiresAt) {
        ctx.fillStyle = pendingAnimation.color;
        ctx.fillRect(pendingAnimation.x * tileSize, pendingAnimation.y * tileSize, tileSize, tileSize);
        requestAnimationFrame(() => renderBoard(board, tribes));
    }

    ctx.restore();
}

function drawTile(ctx, x, y, tile) {
    const img = getTerrainImage(tile.terrain);
    if (img) {
        ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize);
    } else {
        ctx.fillStyle = TERRAIN_COLORS[tile.terrain] || TERRAIN_COLORS['PLAIN'];
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);

    if (tile.resource) {
        const ri = getResourceImage(tile.resource);
        if (ri) ctx.drawImage(ri, x * tileSize + 4, y * tileSize + 2, tileSize * 0.4, tileSize * 0.4);
        else     drawTileLabel(ctx, x, y, tile.resource, '#ffffff', 10);
    } else if (tile.building) {
        const bi = getBuildingImage(tile.building);
        if (bi) {
            const sz = tileSize * 0.6;
            ctx.drawImage(bi, x * tileSize + (tileSize - sz) / 2, y * tileSize + (tileSize - sz) / 2, sz, sz);
        } else {
            drawTileLabel(ctx, x, y, tile.building.slice(0, 3), '#000', 10);
        }
    }

    if (tile.city_id >= 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
    if (tile.unit) drawUnit(ctx, x, y, tile.unit);
}

function drawTileLabel(ctx, x, y, text, color, fontSize) {
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x * tileSize + tileSize / 2, y * tileSize + 2);
}

function drawUnit(ctx, x, y, unit) {
    const cx = x * tileSize + tileSize / 2;
    const cy = y * tileSize + tileSize / 2;
    const exhausted = !unit.can_move && !unit.can_attack;
    const img = getUnitImage(unit.type, unit.tribe_id, exhausted);

    if (img) {
        const sz = tileSize * 0.8;
        ctx.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz);
        if (unit.is_veteran) {
            ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, sz / 2 + 2, 0, Math.PI * 2); ctx.stroke();
        }
    } else {
        ctx.fillStyle = TRIBE_COLORS[unit.tribe_id] || '#888';
        ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
        if (unit.is_veteran) {
            ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(UNIT_LABELS[unit.type] || unit.type.slice(0, 2), cx, cy);
    }

    const bw = 30, bh = 4, ratio = unit.hp / unit.max_hp;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx - bw / 2, y * tileSize + tileSize - 10, bw, bh);
    ctx.fillStyle = ratio > 0.5 ? '#2ecc71' : ratio > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(cx - bw / 2, y * tileSize + tileSize - 10, bw * ratio, bh);
}

// ── Event handlers ────────────────────────────────────────────────────────────

function initCanvasEvents() {
    const canvas = document.getElementById('game-board');

    canvas.addEventListener('mousedown', e => {
        dragStart  = { x: e.clientX, y: e.clientY };
        isDragging = false;
    });

    canvas.addEventListener('mousemove', e => {
        if (!dragStart) return;
        const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
        if (Math.sqrt(dx * dx + dy * dy) > PAN_THRESHOLD) {
            isDragging = true;
            panOffset  = { x: panOffset.x + dx, y: panOffset.y + dy };
            dragStart  = { x: e.clientX, y: e.clientY };
            if (currentState) renderBoard(currentState.board, currentState.tribes);
        }
    });

    canvas.addEventListener('mouseup', e => {
        if (!isDragging && dragStart) handleCanvasClick(e);
        dragStart = null; isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => { dragStart = null; isDragging = false; });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        tileSize = Math.max(TILE_SIZE_MIN, Math.min(TILE_SIZE_MAX, tileSize + (e.deltaY > 0 ? -4 : 4)));
        if (currentState) renderBoard(currentState.board, currentState.tribes);
    }, { passive: false });
}

function handleCanvasClick(e) {
    if (!currentState) return;
    const rect = document.getElementById('game-board').getBoundingClientRect();
    const tx = Math.floor((e.clientX - rect.left - panOffset.x) / tileSize);
    const ty = Math.floor((e.clientY - rect.top  - panOffset.y) / tileSize);
    const sz = currentState.board.length;
    if (tx < 0 || ty < 0 || tx >= sz || ty >= sz) return;

    if (selectedTile && unitActionMap.has(`${tx},${ty}`)) {
        const a = unitActionMap.get(`${tx},${ty}`);
        submitAction(a.id, a.description);
        return;
    }
    selectTile(tx, ty);
}

function selectTile(x, y) {
    selectedTile = { x, y };
    buildActionMap(x, y);
    renderLeftPanel('tile', { x, y, tile: currentState.board[y][x] });
    renderBoard(currentState.board, currentState.tribes);
}

// ── Animations ────────────────────────────────────────────────────────────────

function flashTile(x, y, actionType) {
    pendingAnimation = {
        x, y,
        color: HIGHLIGHT_COLORS[actionType] || HIGHLIGHT_COLORS.DEFAULT,
        expiresAt: Date.now() + 400,
    };
}
```

- [ ] **Step 2: Remove old functions from `game.js`**

Delete `renderBoard`, `drawLabel`, `drawUnit` from `game.js` (all now in `canvas.js`).

In `game.js` DOMContentLoaded, add after `initSetup()`:
```js
initCanvasEvents();
```

- [ ] **Step 3: Manual test**

Start a HUMAN vs RANDOM game. Verify board renders, drag pans, scroll zooms, tile click shows white outline.

- [ ] **Step 4: Commit**

```bash
rtk git add tribes_py/web/static/canvas.js tribes_py/web/static/game.js
rtk git commit -m "feat(frontend): canvas.js with rendering, pan/zoom, click and highlights"
```

---

## Task 8: Frontend — panels.js

Three-mode left panel and right panel tribe action buttons + action log.

**Files:**
- Modify: `tribes_py/web/static/panels.js`
- Modify: `tribes_py/web/static/game.js`

- [ ] **Step 1: Write `panels.js`**

```js
// ============================================
// PANELS — left panel (tribes / tile / tribe-tech), right panel
// ============================================

const VETERAN_KILLS = 3;   // matches TribesConfig.java
const ACTION_LOG_MAX = 50;

// ── Left panel ────────────────────────────────────────────────────────────────

function renderLeftPanel(mode, data) {
    const title   = document.getElementById('left-panel-title');
    const content = document.getElementById('left-panel-content');
    const closeBtn = document.getElementById('left-panel-close');

    content.textContent = '';   // clear safely

    if (mode === 'tribes') {
        title.textContent        = 'COMBATANTS';
        closeBtn.style.display   = 'none';
        if (!currentState) return;
        currentState.tribes.forEach((tribe, idx) => {
            const card = document.createElement('div');
            card.className = `tribe-card ${idx === currentState.active_tribe ? 'active' : ''}`;
            card.style.borderLeftColor = TRIBE_COLORS[idx];

            const name  = document.createElement('div');
            name.className = 'tribe-name';
            name.textContent = tribe.name;

            const agent = document.createElement('div');
            agent.className = 'tribe-agent';
            agent.textContent = tribe.agent_type || '';

            const stats = document.createElement('div');
            stats.className = 'tribe-stats';
            [
                `\u2B50 ${tribe.stars}+${tribe.max_production || 0}`,
                `\uD83C\uDFD9 ${tribe.num_cities}`,
                `\uD83D\uDD2C ${tribe.num_techs}`,
                `\uD83D\uDCCA ${tribe.score}`,
            ].forEach(txt => {
                const s = document.createElement('div');
                s.className = 'tribe-stat';
                s.textContent = txt;
                stats.appendChild(s);
            });

            card.appendChild(name);
            card.appendChild(agent);
            card.appendChild(stats);
            card.addEventListener('click', () => renderLeftPanel('tribe-tech', { tribe }));
            content.appendChild(card);
        });

    } else if (mode === 'tile') {
        const { x, y, tile } = data;
        title.textContent      = `TILE (${x}, ${y})`;
        closeBtn.style.display = 'inline';

        const info = document.createElement('div');
        info.className = 'tile-info';
        appendTileInfo(info, tile, x, y);
        content.appendChild(info);

        if (tileActionList.length > 0) {
            const sec = document.createElement('div');
            sec.className = 'tile-actions';
            tileActionList.forEach(a => {
                const btn = document.createElement('button');
                btn.className = 'action-btn tile-action-btn';
                btn.textContent = a.description;
                btn.addEventListener('click', () => {
                    if (a.type === 'DISBAND') confirmDisband(() => submitAction(a.id, a.description));
                    else submitAction(a.id, a.description);
                });
                sec.appendChild(btn);
            });
            content.appendChild(sec);
        }

    } else if (mode === 'tribe-tech') {
        const { tribe } = data;
        title.textContent      = `${tribe.name} TECHS`;
        closeBtn.style.display = 'inline';
        const ul = document.createElement('ul');
        ul.className = 'tribe-tech-list';
        const techs = tribe.techs || [];
        if (techs.length === 0) {
            const li = document.createElement('li');
            li.className = 'tribe-tech-item muted';
            li.textContent = 'No technologies researched';
            ul.appendChild(li);
        } else {
            techs.forEach(t => {
                const li = document.createElement('li');
                li.className = 'tribe-tech-item';
                li.textContent = t;
                ul.appendChild(li);
            });
        }
        content.appendChild(ul);
    }
}

function appendTileInfo(container, tile, x, y) {
    const header = document.createElement('div');
    header.className = 'tile-info-header';
    const list = document.createElement('ul');
    list.className = 'tile-info-list';

    if (tile.unit) {
        const u = tile.unit;
        const tribeName = (currentState.tribes[u.tribe_id] || {}).name || '';
        header.textContent = `${tribeName} ${u.type}`;
        [
            `HP: ${u.hp} / ${u.max_hp}`,
            `ATK: ${u.atk ?? '?'}  DEF: ${u.def ?? '?'}`,
            `MOV: ${u.mov ?? '?'}  RNG: ${u.range ?? '?'}`,
            u.is_veteran ? 'Veteran' : `Kills: ${Math.min(u.kills ?? 0, VETERAN_KILLS)} / ${VETERAN_KILLS}`,
            `Status: ${u.status || '?'}`,
        ].forEach(txt => {
            const li = document.createElement('li'); li.textContent = txt; list.appendChild(li);
        });
    } else if (tile.terrain === 'CITY' && tile.city) {
        const c = tile.city;
        header.textContent = `City ${tile.city_id}`;
        [
            `Capital: ${c.is_capital ? 'Yes' : 'No'}`,
            `Production: ${c.production}`,
            `Points: ${c.points_worth}`,
        ].forEach(txt => {
            const li = document.createElement('li'); li.textContent = txt; list.appendChild(li);
        });
    } else {
        const parts = [tile.terrain];
        if (tile.resource) parts.push(tile.resource);
        if (tile.building) parts.push(tile.building);
        header.textContent = parts.join(', ');
    }

    container.appendChild(header);
    container.appendChild(list);
}

// ── Right panel ───────────────────────────────────────────────────────────────

function updateTribeActionButtons() {
    const container = document.getElementById('tribe-actions');
    container.textContent = '';
    if (!currentState) return;
    const tribe = currentState.tribes[currentState.active_tribe];
    if (!tribe || !tribe.is_human) return;

    const hasType = t => currentActions.some(a => a.type === t);

    const defs = [
        { label: 'END TURN',      type: 'END_TURN',      onClick: () => {
            const a = currentActions.find(x => x.type === 'END_TURN');
            if (a) submitAction(a.id, a.description);
        }},
        { label: 'RESEARCH TECH', type: 'RESEARCH_TECH', onClick: openTechModal },
        { label: 'BUILD ROAD',    type: 'BUILD_ROAD',    onClick: activateBuildRoad },
        { label: 'SEND STARS',    type: 'SEND_STARS',    onClick: openSendStarsDialog },
        { label: 'DECLARE WAR',   type: 'DECLARE_WAR',   onClick: openDeclareWarDialog },
    ];

    defs.forEach(def => {
        if (!hasType(def.type)) return;
        const btn = document.createElement('button');
        btn.className = 'action-btn tribe-action-btn';
        btn.textContent = def.label;
        btn.addEventListener('click', def.onClick);
        container.appendChild(btn);
    });
}

function activateBuildRoad() {
    unitActionMap = new Map();
    currentActions.filter(a => a.type === 'BUILD_ROAD')
        .forEach(a => unitActionMap.set(`${a.target_x},${a.target_y}`, a));
    if (currentState) renderBoard(currentState.board, currentState.tribes);
}

// ── Action log ────────────────────────────────────────────────────────────────

function appendActionLog(description, isAI) {
    const list = document.getElementById('action-log');
    if (!list) return;
    const tick = currentState ? currentState.tick : '?';
    const li   = document.createElement('li');
    li.className  = `action-log-item ${isAI ? 'action-log-ai' : 'action-log-human'}`;
    li.textContent = `[T${tick}] ${description}`;
    list.insertBefore(li, list.firstChild);
    while (list.children.length > ACTION_LOG_MAX) list.removeChild(list.lastChild);
}
```

- [ ] **Step 2: Update `game.js` to use panels**

Remove old `renderTribes` function from `game.js`.

In `renderGameState`, replace:
```js
renderTribes(state.tribes, state.active_tribe);
```
with:
```js
if (!selectedTile) renderLeftPanel('tribes');
updateTribeActionButtons();
```

Replace the old `fetchActions()` / `clearActions()` calls:
- On human turn (was `fetchActions()`): `refreshActions().then(() => { updateTribeActionButtons(); });`
- Remove `clearActions()`.

Add left-panel close handler in DOMContentLoaded:
```js
document.getElementById('left-panel-close').addEventListener('click', () => {
    clearSelection();
    renderLeftPanel('tribes');
    if (currentState) renderBoard(currentState.board, currentState.tribes);
});
```

Also remove old `fetchActions`, `displayActions`, `clearActions` functions.

- [ ] **Step 3: Manual test**

HUMAN vs RANDOM game:
- Tribe cards show agent type and `+N` production
- Clicking a tile shows unit/city/terrain info in left panel; X restores tribe list
- Clicking a tribe card shows its techs
- Right panel shows END TURN and other relevant buttons

- [ ] **Step 4: Commit**

```bash
rtk git add tribes_py/web/static/panels.js tribes_py/web/static/game.js
rtk git commit -m "feat(frontend): panels.js with 3-mode left panel, tribe buttons, action log"
```

---

## Task 9: Frontend — tech-tree.js

Static tech tree constants and research modal.

**Files:**
- Modify: `tribes_py/web/static/tech-tree.js`

- [ ] **Step 1: Write `tech-tree.js`**

```js
// ============================================
// TECH TREE — static data (from Types.java) and modal
// ============================================

// TECH_BASE_COST = 4; approximate cost = 4 + tier * numCities
// PHILOSOPHY gives 20% discount (TribesConfig.TECH_DISCOUNT_VALUE = 0.2)

const TECH_TREE = {
    CLIMBING:     { tier: 1, parent: null },
    FISHING:      { tier: 1, parent: null },
    HUNTING:      { tier: 1, parent: null },
    ORGANIZATION: { tier: 1, parent: null },
    RIDING:       { tier: 1, parent: null },
    ARCHERY:      { tier: 2, parent: 'HUNTING' },
    FARMING:      { tier: 2, parent: 'ORGANIZATION' },
    FORESTRY:     { tier: 2, parent: 'HUNTING' },
    FREE_SPIRIT:  { tier: 2, parent: 'RIDING' },
    MEDITATION:   { tier: 2, parent: 'CLIMBING' },
    MINING:       { tier: 2, parent: 'CLIMBING' },
    ROADS:        { tier: 2, parent: 'RIDING' },
    SAILING:      { tier: 2, parent: 'FISHING' },
    SHIELDS:      { tier: 2, parent: 'ORGANIZATION' },
    WHALING:      { tier: 2, parent: 'FISHING' },
    AQUATISM:     { tier: 3, parent: 'WHALING' },
    CHIVALRY:     { tier: 3, parent: 'FREE_SPIRIT' },
    CONSTRUCTION: { tier: 3, parent: 'FARMING' },
    MATHEMATICS:  { tier: 3, parent: 'FORESTRY' },
    NAVIGATION:   { tier: 3, parent: 'SAILING' },
    SMITHERY:     { tier: 3, parent: 'MINING' },
    SPIRITUALISM: { tier: 3, parent: 'ARCHERY' },
    TRADE:        { tier: 3, parent: 'ROADS' },
    PHILOSOPHY:   { tier: 3, parent: 'MEDITATION' },
};

const TECH_UNLOCKS = {
    CLIMBING:     ['Action: CLIMB_MOUNTAIN'],
    FISHING:      ['Gather: FISH'],
    HUNTING:      ['Gather: ANIMAL'],
    ORGANIZATION: ['Gather: FRUIT'],
    RIDING:       ['Spawn: RIDER'],
    ARCHERY:      ['Spawn: ARCHER'],
    FARMING:      ['Build: FARM', 'Gather: CROPS'],
    FORESTRY:     ['Build: LUMBER_HUT', 'Action: CLEAR_FOREST'],
    FREE_SPIRIT:  ['Build: TEMPLE', 'Action: DISBAND'],
    MEDITATION:   ['Build: MOUNTAIN_TEMPLE', 'Monument: ALTAR_OF_PEACE'],
    MINING:       ['Build: MINE', 'Gather: ORE'],
    ROADS:        ['Action: BUILD_ROAD', 'Monument: GRAND_BAZAR'],
    SAILING:      ['Build: PORT', 'Spawn: BOAT, SHIP', 'Action: UPGRADE_BOAT'],
    SHIELDS:      ['Spawn: DEFENDER'],
    WHALING:      ['Gather: WHALES'],
    AQUATISM:     ['Build: WATER_TEMPLE'],
    CHIVALRY:     ['Spawn: KNIGHT', 'Action: BURN_FOREST'],
    CONSTRUCTION: ['Build: WINDMILL', 'Action: DESTROY'],
    MATHEMATICS:  ['Build: SAWMILL', 'Spawn: CATAPULT'],
    NAVIGATION:   ['Spawn: BATTLESHIP', 'Action: UPGRADE_SHIP', 'Monument: EYE_OF_GOD'],
    SMITHERY:     ['Build: FORGE', 'Spawn: SWORDMAN'],
    SPIRITUALISM: ['Build: FOREST_TEMPLE', 'Action: GROW_FOREST'],
    TRADE:        ['Build: CUSTOMS_HOUSE', 'Monument: EMPERORS_TOMB'],
    PHILOSOPHY:   ['Spawn: MIND_BENDER', 'Monument: TOWER_OF_WISDOM', '20% discount on future techs'],
};

/**
 * Returns Map<techName, 'researched'|'affordable'|'prereq'|'locked'>
 * 'affordable' = has a RESEARCH_TECH action in currentActions (backend confirms prereq + stars)
 */
function computeTechStatuses() {
    if (!currentState) return new Map();
    const tribe       = currentState.tribes[currentState.active_tribe];
    const researched  = new Set(tribe.techs || []);
    const researchable = new Set(
        currentActions.filter(a => a.type === 'RESEARCH_TECH').map(a => a.tech)
    );
    return new Map(Object.keys(TECH_TREE).map(name => {
        const node = TECH_TREE[name];
        let status;
        if      (researched.has(name))    status = 'researched';
        else if (researchable.has(name))  status = 'affordable';
        else if (!node.parent || researched.has(node.parent)) status = 'prereq';
        else    status = 'locked';
        return [name, status];
    }));
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openTechModal() {
    const statuses = computeTechStatuses();
    const tribe    = currentState ? currentState.tribes[currentState.active_tribe] : null;
    const numCities = tribe ? tribe.num_cities : 0;

    const layout = document.createElement('div');
    layout.className = 'tech-modal-layout';

    [1, 2, 3].forEach(tier => {
        const col = document.createElement('div');
        col.className = 'tech-tier-col';
        const lbl = document.createElement('div');
        lbl.className = 'tech-tier-label';
        lbl.textContent = `TIER ${tier}`;
        col.appendChild(lbl);

        Object.entries(TECH_TREE)
            .filter(([, n]) => n.tier === tier)
            .forEach(([name]) => {
                const status = statuses.get(name) || 'locked';
                const node = document.createElement('div');
                node.className = `tech-node tech-${status}`;
                node.dataset.tech = name;
                node.textContent = name.replace(/_/g, ' ');
                node.addEventListener('click', () => renderTechDetail(name, statuses, numCities));
                col.appendChild(node);
            });
        layout.appendChild(col);
    });

    const detail = document.createElement('div');
    detail.id = 'tech-detail';
    detail.className = 'tech-detail';

    const bodyEl = document.createElement('div');
    bodyEl.appendChild(layout);
    bodyEl.appendChild(detail);

    showDialog('TECHNOLOGY TREE', bodyEl, [
        { label: 'CLOSE', className: 'btn-secondary', onClick: closeDialog },
    ]);
}

function renderTechDetail(techName, statuses, numCities) {
    const detail = document.getElementById('tech-detail');
    if (!detail) return;
    detail.textContent = '';

    const status  = statuses.get(techName) || 'locked';
    const unlocks = TECH_UNLOCKS[techName] || [];
    const cost    = 4 + TECH_TREE[techName].tier * numCities;

    const nameEl = document.createElement('div');
    nameEl.className = 'tech-detail-name';
    nameEl.textContent = techName.replace(/_/g, ' ');

    const costEl = document.createElement('div');
    costEl.className = 'tech-detail-cost';
    costEl.textContent = `~${cost} stars`;

    const ul = document.createElement('ul');
    ul.className = 'tech-detail-unlocks';
    unlocks.forEach(u => { const li = document.createElement('li'); li.textContent = u; ul.appendChild(li); });

    detail.appendChild(nameEl);
    detail.appendChild(costEl);
    detail.appendChild(ul);

    if (status === 'affordable') {
        const btn = document.createElement('button');
        btn.className = 'btn-primary';
        btn.textContent = 'RESEARCH';
        btn.addEventListener('click', () => {
            const a = currentActions.find(x => x.type === 'RESEARCH_TECH' && x.tech === techName);
            if (a) { submitAction(a.id, a.description); closeDialog(); }
        });
        detail.appendChild(btn);
    } else {
        const lbl = document.createElement('div');
        lbl.className = `tech-status-label tech-${status}`;
        lbl.textContent = status.toUpperCase();
        detail.appendChild(lbl);
    }
}
```

- [ ] **Step 2: Manual test**

Click RESEARCH TECH button in-game. Verify modal opens, tiers visible, clicking a tech shows info, researching works.

- [ ] **Step 3: Commit**

```bash
rtk git add tribes_py/web/static/tech-tree.js
rtk git commit -m "feat(frontend): tech-tree.js with constants and research modal"
```

---

## Task 10: Frontend — dialogs.js

`showDialog` helper, all dialogs, game controls wiring.

**Files:**
- Modify: `tribes_py/web/static/dialogs.js`
- Modify: `tribes_py/web/static/game.js`

- [ ] **Step 1: Write `dialogs.js`**

```js
// ============================================
// DIALOGS — showDialog helper and all dialog functions
// ============================================

/**
 * Show a modal dialog. `body` may be a string (used as textContent) or a DOM Element.
 * Buttons: [{label, className, onClick}]
 */
function showDialog(title, body, buttons) {
    const overlay = document.getElementById('modal-overlay');
    const box     = document.getElementById('modal-box');
    box.textContent = '';

    const titleEl = document.createElement('div');
    titleEl.className = 'modal-title';
    titleEl.textContent = title;

    const bodyEl = document.createElement('div');
    bodyEl.className = 'modal-body';
    if (typeof body === 'string') bodyEl.textContent = body;
    else bodyEl.appendChild(body);

    const btnsEl = document.createElement('div');
    btnsEl.className = 'modal-buttons';
    buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.className = `${b.className} modal-btn`;
        btn.textContent = b.label;
        btn.addEventListener('click', b.onClick);
        btnsEl.appendChild(btn);
    });

    box.appendChild(titleEl);
    box.appendChild(bodyEl);
    box.appendChild(btnsEl);
    overlay.style.display = 'flex';
}

function closeDialog() {
    document.getElementById('modal-overlay').style.display = 'none';
}

// ── Disband confirm ───────────────────────────────────────────────────────────

function confirmDisband(onConfirm) {
    showDialog(
        'CONFIRM DISBAND',
        'Disband this unit? This cannot be undone.',
        [
            { label: 'DISBAND', className: 'btn-danger',    onClick: () => { closeDialog(); onConfirm(); } },
            { label: 'CANCEL',  className: 'btn-secondary', onClick: closeDialog },
        ]
    );
}

// ── Send Stars ────────────────────────────────────────────────────────────────

function openSendStarsDialog() {
    if (!currentState) return;
    const sends = currentActions.filter(a => a.type === 'SEND_STARS');
    if (!sends.length) return;

    const sel = document.createElement('select');
    sel.className = 'select-input';

    const byTribe = new Map();
    sends.forEach(a => { if (!byTribe.has(a.target_tribe_id)) byTribe.set(a.target_tribe_id, a); });
    byTribe.forEach((a, tid) => {
        const opt = document.createElement('option');
        opt.value = a.id;
        const tribe = currentState.tribes[tid];
        opt.textContent = `${tribe ? tribe.name : tid} — ${a.stars} stars`;
        sel.appendChild(opt);
    });

    const label = document.createElement('label');
    label.textContent = 'Select recipient:';
    const bodyEl = document.createElement('div');
    bodyEl.appendChild(label);
    bodyEl.appendChild(sel);

    showDialog('SEND STARS', bodyEl, [
        { label: 'SEND',   className: 'btn-primary',   onClick: () => {
            const a = currentActions.find(x => x.id === parseInt(sel.value, 10));
            if (a) submitAction(a.id, a.description);
            closeDialog();
        }},
        { label: 'CANCEL', className: 'btn-secondary', onClick: closeDialog },
    ]);
}

// ── Declare War ───────────────────────────────────────────────────────────────

function openDeclareWarDialog() {
    if (!currentState) return;
    const wars = currentActions.filter(a => a.type === 'DECLARE_WAR');
    if (!wars.length) return;

    const sel = document.createElement('select');
    sel.className = 'select-input';
    wars.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        const tribe = currentState.tribes[a.target_tribe_id];
        opt.textContent = tribe ? tribe.name : a.target_tribe_id;
        sel.appendChild(opt);
    });

    const label = document.createElement('label');
    label.textContent = 'Declare war on:';
    const bodyEl = document.createElement('div');
    bodyEl.appendChild(label);
    bodyEl.appendChild(sel);

    showDialog('DECLARE WAR', bodyEl, [
        { label: 'DECLARE WAR', className: 'btn-danger',    onClick: () => {
            const a = currentActions.find(x => x.id === parseInt(sel.value, 10));
            if (a) submitAction(a.id, a.description);
            closeDialog();
        }},
        { label: 'CANCEL',      className: 'btn-secondary', onClick: closeDialog },
    ]);
}

// ── City level-up ─────────────────────────────────────────────────────────────

function showLevelUpDialog() {
    const levelUps = currentActions.filter(a => a.type === 'LEVEL_UP');
    if (!levelUps.length) return;
    const bodyEl = document.createElement('div');
    bodyEl.textContent = 'Choose a city upgrade:';
    showDialog('CITY LEVEL UP!', bodyEl,
        levelUps.map(a => ({
            label: a.description,
            className: 'btn-primary',
            onClick: () => { submitAction(a.id, a.description); closeDialog(); },
        }))
    );
}

// ── Quit confirm ──────────────────────────────────────────────────────────────

function confirmQuit() {
    showDialog('END GAME', 'End this game and return to setup?', [
        { label: 'END GAME', className: 'btn-danger', onClick: async () => {
            closeDialog();
            await fetch('/game/stop', { method: 'POST' });
            document.getElementById('game-over-overlay').classList.remove('active');
            switchToSetupView();
        }},
        { label: 'CANCEL', className: 'btn-secondary', onClick: closeDialog },
    ]);
}

// ── Game controls wiring ──────────────────────────────────────────────────────

function initGameControls() {
    let paused = false;
    const btnPause = document.getElementById('btn-pause');

    btnPause.addEventListener('click', async () => {
        if (paused) {
            await fetch('/game/resume', { method: 'POST' });
            btnPause.textContent = '\u23F8';
            paused = false;
        } else {
            await fetch('/game/pause', { method: 'POST' });
            btnPause.textContent = '\u25B6';
            paused = true;
        }
    });

    document.getElementById('btn-play-turn').addEventListener('click', () => {
        paused = false; btnPause.textContent = '\u23F8';
        fetch('/game/play-turn', { method: 'POST' });
    });

    document.getElementById('btn-play-tick').addEventListener('click', () => {
        paused = false; btnPause.textContent = '\u23F8';
        fetch('/game/play-tick', { method: 'POST' });
    });

    document.getElementById('btn-quit').addEventListener('click', confirmQuit);
}
```

- [ ] **Step 2: Update `game.js` DOMContentLoaded**

Add after `initCanvasEvents()`:
```js
initGameControls();
```

Add after setting `currentState = state` in `renderGameState`:
```js
if (state.last_action) {
    const isAI = !state.tribes[state.active_tribe].is_human;
    appendActionLog(state.last_action, isAI);
}
if (state.leveling_up) refreshActions().then(showLevelUpDialog);
```

- [ ] **Step 3: Manual test**

- Quit shows confirm dialog, cancels cleanly, ends game correctly
- Pause/resume toggles AI advancement
- Play Turn and Play Tick advance then pause
- Level-up dialog appears when city levels up (requires playing until it happens)
- Send Stars and Declare War show correct tribe names in pickers

- [ ] **Step 4: Commit**

```bash
rtk git add tribes_py/web/static/dialogs.js tribes_py/web/static/game.js
rtk git commit -m "feat(frontend): dialogs.js with all dialogs and game control wiring"
```

---

## Task 11: Frontend — CSS

**Files:**
- Modify: `tribes_py/web/static/style.css`

- [ ] **Step 1: Append new styles to `style.css`**

```css
/* ── Game controls ───────────────────────────────────────────────── */
.game-controls { display:flex; align-items:center; gap:6px; }
.controls-divider { width:1px; height:20px; background:rgba(255,255,255,0.2); margin:0 4px; }
.btn-control {
    background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15);
    color:#ccc; border-radius:4px; padding:3px 8px; cursor:pointer; font-size:13px;
    transition:background 0.15s;
}
.btn-control:hover { background:rgba(255,255,255,0.18); color:#fff; }
.btn-control.btn-danger { border-color:rgba(231,76,60,0.4); color:#e74c3c; }
.btn-control.btn-danger:hover { background:rgba(231,76,60,0.2); }

/* ── Left panel ──────────────────────────────────────────────────── */
.panel-close-btn { float:right; background:none; border:none; color:#aaa; cursor:pointer; font-size:14px; }
.panel-close-btn:hover { color:#fff; }

/* ── Tile info ───────────────────────────────────────────────────── */
.tile-info { padding:8px; }
.tile-info-header { font-weight:700; font-size:13px; margin-bottom:6px; color:#00ff88; text-transform:uppercase; }
.tile-info-list { list-style:none; padding:0; margin:0 0 8px; font-size:12px; color:#ccc; }
.tile-info-list li { padding:2px 0; }
.tile-actions { padding:4px 8px; display:flex; flex-direction:column; gap:4px; }
.tile-action-btn { font-size:11px; padding:4px 8px; }

/* ── Tribe cards ─────────────────────────────────────────────────── */
.tribe-agent { font-size:10px; color:#888; text-transform:uppercase; margin-bottom:2px; }

/* ── Tribe tech list ─────────────────────────────────────────────── */
.tribe-tech-list { list-style:none; padding:8px; margin:0; }
.tribe-tech-item { font-size:12px; padding:3px 0; color:#aad4ff; text-transform:uppercase; }
.tribe-tech-item.muted { color:#555; }

/* ── Right panel ─────────────────────────────────────────────────── */
.tribe-actions-section { display:flex; flex-direction:column; gap:4px; padding:8px; }
.tribe-action-btn { font-size:12px; }
.panel-header-sub { font-size:10px; margin-top:8px; }
.action-log-list { list-style:none; padding:4px 8px; margin:0; overflow-y:auto; flex:1; font-size:11px; }
.action-log-item { padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.05); }
.action-log-human { color:#b0d4ff; }
.action-log-ai    { color:#666; }

/* ── Modal ───────────────────────────────────────────────────────── */
.modal-overlay {
    position:fixed; inset:0; background:rgba(0,0,0,0.7);
    display:flex; justify-content:center; align-items:center; z-index:10000;
}
.modal-box {
    background:#0e1a2e; border:1px solid rgba(0,255,136,0.3); border-radius:8px;
    padding:24px; max-width:640px; width:90%; max-height:80vh; overflow-y:auto; color:#ccc;
}
.modal-title { font-size:14px; font-weight:700; color:#00ff88; text-transform:uppercase; letter-spacing:2px; margin-bottom:16px; }
.modal-body  { margin-bottom:16px; }
.modal-buttons { display:flex; gap:8px; justify-content:flex-end; }
.modal-btn { min-width:80px; }

/* ── Tech tree ───────────────────────────────────────────────────── */
.tech-modal-layout { display:flex; gap:12px; margin-bottom:12px; }
.tech-tier-col     { flex:1; display:flex; flex-direction:column; gap:6px; }
.tech-tier-label   { font-size:10px; color:#888; text-transform:uppercase; margin-bottom:4px; }
.tech-node {
    padding:6px 8px; border-radius:4px; font-size:11px; text-transform:uppercase;
    cursor:pointer; transition:opacity 0.15s; border:1px solid transparent;
}
.tech-node:hover   { opacity:0.8; }
.tech-researched   { background:#04547a; color:#80ffff; border-color:#1a7fa0; }
.tech-affordable   { background:#1a3a1a; color:#4eff71; border-color:#2a6a2a; }
.tech-prereq       { background:#3a2a10; color:#ffa763; border-color:#6a4a1a; }
.tech-locked       { background:#1a1a2a; color:#555;    border-color:#2a2a3a; }
.tech-detail       { border-top:1px solid rgba(255,255,255,0.1); padding-top:12px; }
.tech-detail-name  { font-size:13px; font-weight:700; color:#00ff88; text-transform:uppercase; margin-bottom:4px; }
.tech-detail-cost  { font-size:11px; color:#888; margin-bottom:8px; }
.tech-detail-unlocks { font-size:12px; color:#ccc; padding-left:16px; margin-bottom:12px; }
.tech-status-label { font-size:12px; padding:4px 8px; border-radius:4px; display:inline-block; text-transform:uppercase; }

/* ── Danger button ───────────────────────────────────────────────── */
.btn-danger {
    background:rgba(231,76,60,0.15); border-color:rgba(231,76,60,0.4); color:#e74c3c;
}
.btn-danger:hover { background:rgba(231,76,60,0.3); }
```

- [ ] **Step 2: Full visual check**

Verify: game controls bar, modal, tech tree, action log, tile info, tribe-tech list all look correct.

- [ ] **Step 3: Commit**

```bash
rtk git add tribes_py/web/static/style.css
rtk git commit -m "feat(frontend): CSS for controls, panels, modal, tech tree, action log"
```

---

## Task 12: Integration smoke test

- [ ] **Step 1: Compile Java**

```bash
javac -cp lib/json.jar -sourcepath src -d out $(find src -name "*.java")
```

- [ ] **Step 2: Run Python tests**

```bash
python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 3: Play a HUMAN vs MCTS game and check all features**

```bash
python -m uvicorn tribes_py.web.main:app --reload
```

- [ ] Board renders with sprites, pan and zoom work
- [ ] Clicking a unit shows stats (HP, ATK, DEF, MOV, RANGE, kills, status) in left panel
- [ ] Clicking a city tile shows city details
- [ ] Unit action highlights appear on canvas; clicking a highlighted tile executes the action
- [ ] City/tile actions (Spawn, Build, Gather etc.) appear as buttons in the left panel tile info
- [ ] Clicking a tribe card shows their researched techs
- [ ] END TURN button works
- [ ] RESEARCH TECH modal opens, shows correct colours, research submits and closes modal
- [ ] BUILD ROAD highlights valid positions; clicking one submits the action
- [ ] SEND STARS picker shows correct tribes
- [ ] DECLARE WAR picker shows correct tribes
- [ ] Pause/Resume stops and restarts AI
- [ ] Play Turn auto-advances one tribe then pauses
- [ ] Play Tick auto-advances full round then pauses
- [ ] Action log shows human (light) and AI (muted) entries
- [ ] Quit shows confirm dialog; END GAME stops game and returns to setup
- [ ] City level-up dialog appears when a city levels up

- [ ] **Step 4: Final commit**

```bash
rtk git add -A
rtk git commit -m "feat: Python UI Java parity — map interaction, tech tree, game controls, action log"
```
