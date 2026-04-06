# Tribes Web Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browser-based interface for playing and watching Tribes games over SSH, with no local installs.

**Architecture:** Python FastAPI (uv) at the repo root serves the frontend and communicates with a headless Java game process via newline-delimited JSON on stdin/stdout. A WebSocket pushes board state to the browser after every move. The Java side gets one new class `CLIRunner` in the `core.game` package, giving it package-private access to `GameState` internals.

**Tech Stack:** Java 11 (existing), FastAPI, uvicorn, asyncio, HTML5 canvas (frontend via /frontend-design skill)

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/core/game/CLIRunner.java` | Create | Headless game runner; JSON stdio protocol |
| `pyproject.toml` | Modify | Add fastapi, uvicorn, httpx, pytest deps |
| `game_session.py` | Create | asyncio subprocess wrapper for Java process |
| `game_loop.py` | Create | Drives AI turns; broadcasts state via WebSocket |
| `main.py` | Create | FastAPI app; REST + WebSocket routes |
| `static/index.html` | Create | Frontend (via /frontend-design) |
| `static/game.js` | Create | Frontend JS (via /frontend-design) |
| `static/style.css` | Create | Frontend CSS (via /frontend-design) |
| `tests/__init__.py` | Create | Empty, marks tests as package |
| `tests/test_game_session.py` | Create | Unit tests for subprocess wrapper |
| `tests/test_api.py` | Create | Integration tests for FastAPI routes |
| `start.sh` | Create | One-command compile + launch |

---

## Key design notes

**Why `core.game` package for CLIRunner?**
`GameState` methods needed by the game loop (`initTurn`, `computePlayerActions`, `existAvailableActions`, `incTick`, `isTurnEnding`, and `init`) are all package-private. Placing `CLIRunner` in `core.game` avoids touching their access modifiers.

**Turn cycle in CLIRunner:**
`GameState.advance(action, true)` already handles everything for non-EndTurn actions (recomputes available actions) and for EndTurn (calls `endTurn`, advances active tribe, calls `initTurn` + `computePlayerActions` for the new tribe). CLIRunner only needs to call `gs.initTurn` + `gs.computePlayerActions` once at game start, and call `gs.incTick()` when the active tribe wraps back to an earlier index after EndTurn.

**Human vs AI in the protocol:**
- Human turns: Python calls `actions` (gets action list), displays to browser, browser picks one, Python calls `apply {action_id}`
- AI turns: Python calls `advance` (Java runs `agent.act()` internally)
- `CLIRunner` tracks `boolean[] isHuman`; serialised into each tribe in state JSON so Python always knows what to do next

---

## Task 1: CLIRunner — core structure and state serialisation

**Files:**
- Create: `src/core/game/CLIRunner.java`

- [ ] **Step 1: Create `src/core/game/CLIRunner.java`**

```java
package core.game;

import core.Constants;
import core.TechnologyTree;
import core.Types;
import core.actions.Action;
import core.actions.tribeactions.EndTurn;
import core.actors.Tribe;
import core.actors.units.Unit;
import org.json.JSONArray;
import org.json.JSONObject;
import players.*;
import players.emcts.EMCTSAgent;
import players.emcts.EMCTSParams;
import players.mc.MCParams;
import players.mc.MonteCarloAgent;
import players.mcts.MCTSParams;
import players.mcts.MCTSPlayer;
import players.oep.OEPAgent;
import players.oep.OEPParams;
import players.osla.OSLAParams;
import players.osla.OneStepLookAheadAgent;
import players.portfolio.SimplePortfolio;
import players.portfolioMCTS.PortfolioMCTSParams;
import players.portfolioMCTS.PortfolioMCTSPlayer;
import players.rhea.RHEAAgent;
import players.rhea.RHEAParams;
import utils.ElapsedCpuTimer;
import utils.Vector2d;

import java.util.*;

public class CLIRunner {

    private GameState gs;
    private Agent[] agents;    // null for human slots
    private boolean[] isHuman;
    private int numPlayers;

    public static void main(String[] args) {
        Constants.VISUALS = false;
        Constants.VERBOSE = false;
        Constants.LOG_STATS = false;

        CLIRunner runner = new CLIRunner();
        Scanner scanner = new Scanner(System.in);

        while (scanner.hasNextLine()) {
            String line = scanner.nextLine().trim();
            if (line.isEmpty()) continue;
            try {
                JSONObject cmd = new JSONObject(line);
                JSONObject response = runner.handle(cmd);
                System.out.println(response.toString());
                System.out.flush();
            } catch (Exception e) {
                JSONObject err = new JSONObject();
                err.put("status", "error");
                err.put("message", e.getMessage() != null ? e.getMessage() : e.toString());
                System.out.println(err.toString());
                System.out.flush();
            }
        }
    }

    private JSONObject handle(JSONObject cmd) throws Exception {
        switch (cmd.getString("cmd")) {
            case "init":    return handleInit(cmd);
            case "actions": return handleActions();
            case "apply":   return handleApply(cmd);
            case "advance": return handleAdvance();
            default: throw new Exception("Unknown command: " + cmd.getString("cmd"));
        }
    }

    // ── State serialisation ──────────────────────────────────────────────────

    JSONObject serializeState() {
        JSONObject state = new JSONObject();
        state.put("tick", gs.getTick());
        state.put("active_tribe", gs.getActiveTribeID());
        state.put("game_over", gs.isGameOver());
        state.put("game_mode", gs.getGameMode().toString());
        state.put("board", serializeBoard());
        state.put("tribes", serializeTribes());
        return state;
    }

    private JSONArray serializeBoard() {
        Board board = gs.getBoard();
        int size = board.getSize();
        JSONArray rows = new JSONArray();
        for (int y = 0; y < size; y++) {
            JSONArray row = new JSONArray();
            for (int x = 0; x < size; x++) {
                JSONObject tile = new JSONObject();
                tile.put("terrain",  board.getTerrainAt(x, y).toString());
                Types.RESOURCE res = board.getResourceAt(x, y);
                tile.put("resource", res  != null ? res.toString()  : JSONObject.NULL);
                Types.BUILDING bld = board.getBuildingAt(x, y);
                tile.put("building", bld  != null ? bld.toString()  : JSONObject.NULL);
                Unit unit = board.getUnitAt(x, y);
                tile.put("unit",     unit != null ? serializeUnit(unit) : JSONObject.NULL);
                tile.put("city_id",  board.getCityIdAt(x, y));
                row.put(tile);
            }
            rows.put(row);
        }
        return rows;
    }

    private JSONObject serializeUnit(Unit unit) {
        JSONObject u = new JSONObject();
        u.put("type",       unit.getType().toString());
        u.put("tribe_id",   unit.getTribeId());
        u.put("hp",         unit.getCurrentHP());
        u.put("max_hp",     unit.getMaxHP());
        Vector2d pos = unit.getPosition();
        u.put("x", pos.x);
        u.put("y", pos.y);
        u.put("is_veteran",  unit.isVeteran());
        u.put("can_move",    unit.canMove());
        u.put("can_attack",  unit.canAttack());
        return u;
    }

    private JSONArray serializeTribes() {
        Tribe[] tribes = gs.getTribes();
        JSONArray arr = new JSONArray();
        for (int i = 0; i < tribes.length; i++) {
            Tribe t = tribes[i];
            JSONObject tj = new JSONObject();
            tj.put("id",        i);
            tj.put("name",      t.getType().toString());
            tj.put("stars",     t.getStars());
            tj.put("num_cities", t.getNumCities());
            tj.put("is_human",  isHuman[i]);
            tj.put("winner",    t.getWinner().toString());
            tj.put("score",     t.getScore());
            tj.put("num_techs", countResearchedTechs(t));
            arr.put(tj);
        }
        return arr;
    }

    private int countResearchedTechs(Tribe t) {
        TechnologyTree tt = t.getTechTree();
        int count = 0;
        for (Types.TECHNOLOGY tech : Types.TECHNOLOGY.values()) {
            if (tt.isResearched(tech)) count++;
        }
        return count;
    }

    // ── Agent creation ───────────────────────────────────────────────────────

    private Agent createAgent(String playerType, long seed) throws Exception {
        switch (playerType.toUpperCase()) {
            case "RANDOM":    return new RandomAgent(seed);
            case "DONOTHING": return new DoNothingAgent(seed);
            case "SIMPLE":    return new SimpleAgent(seed);
            case "OSLA": {
                OSLAParams p = new OSLAParams();
                p.stop_type = p.STOP_FMCALLS;
                p.heuristic_method = p.DIFF_HEURISTIC;
                return new OneStepLookAheadAgent(seed, p);
            }
            case "MC": {
                MCParams p = new MCParams();
                p.stop_type = p.STOP_FMCALLS;
                p.heuristic_method = p.DIFF_HEURISTIC;
                p.PRIORITIZE_ROOT = true;
                return new MonteCarloAgent(seed, p);
            }
            case "MCTS": {
                MCTSParams p = new MCTSParams();
                p.stop_type = p.STOP_FMCALLS;
                p.heuristic_method = p.DIFF_HEURISTIC;
                p.PRIORITIZE_ROOT = true;
                return new MCTSPlayer(seed, p);
            }
            case "RHEA": {
                RHEAParams p = new RHEAParams();
                p.stop_type = p.STOP_FMCALLS;
                p.heuristic_method = p.DIFF_HEURISTIC;
                return new RHEAAgent(seed, p);
            }
            case "OEP": {
                OEPParams p = new OEPParams();
                p.stop_type = p.STOP_FMCALLS;
                p.heuristic_method = p.DIFF_HEURISTIC;
                return new OEPAgent(seed, p);
            }
            case "EMCTS": {
                EMCTSParams p = new EMCTSParams();
                p.stop_type = p.STOP_FMCALLS;
                p.heuristic_method = p.DIFF_HEURISTIC;
                return new EMCTSAgent(seed, p);
            }
            case "PORTFOLIO_MCTS":
            case "PMCTS": {
                PortfolioMCTSParams p = new PortfolioMCTSParams();
                p.stop_type = p.STOP_FMCALLS;
                p.heuristic_method = p.DIFF_HEURISTIC;
                SimplePortfolio portfolio = new SimplePortfolio(seed);
                p.setPortfolio(portfolio);
                return new PortfolioMCTSPlayer(seed, p);
            }
            default:
                throw new Exception("Unknown player type: " + playerType);
        }
    }

    private Types.TRIBE parseTribe(String name) throws Exception {
        for (Types.TRIBE t : Types.TRIBE.values()) {
            if (t.toString().equalsIgnoreCase(name) || t.name().equalsIgnoreCase(name))
                return t;
        }
        throw new Exception("Unknown tribe: " + name);
    }

    // ── Command handlers ─────────────────────────────────────────────────────

    private JSONObject handleInit(JSONObject cmd) throws Exception {
        JSONArray playersArr = cmd.getJSONArray("players");
        JSONArray tribesArr  = cmd.getJSONArray("tribes");
        String mode = cmd.optString("mode", "Capitals");
        long seed   = cmd.optLong("seed", -1);

        numPlayers = playersArr.length();
        if (numPlayers != tribesArr.length())
            throw new Exception("players and tribes arrays must be the same length");

        agents  = new Agent[numPlayers];
        isHuman = new boolean[numPlayers];

        Types.TRIBE[] tribes = new Types.TRIBE[numPlayers];
        long agentSeed = seed == -1 ? System.currentTimeMillis()     : seed;
        long gameSeed  = seed == -1 ? System.currentTimeMillis() + 1 : seed + 1;
        long levelSeed = seed == -1 ? System.currentTimeMillis() + 2 : seed + 2;

        ArrayList<Integer> allIds = new ArrayList<>();
        for (int i = 0; i < numPlayers; i++) allIds.add(i);

        for (int i = 0; i < numPlayers; i++) {
            String pType = playersArr.getString(i);
            tribes[i] = parseTribe(tribesArr.getString(i));
            if (pType.equalsIgnoreCase("HUMAN")) {
                agents[i]  = null;
                isHuman[i] = true;
            } else {
                agents[i] = createAgent(pType, agentSeed);
                agents[i].setPlayerIDs(i, allIds);
                isHuman[i] = false;
            }
        }

        Types.GAME_MODE gameMode = mode.equalsIgnoreCase("Capitals") ?
                Types.GAME_MODE.CAPITALS : Types.GAME_MODE.SCORE;

        gs = new GameState(new Random(gameSeed), gameMode);
        gs.init(levelSeed, tribes);          // package-private

        // Initialise the first tribe's turn
        Tribe first = gs.getTribes()[0];
        gs.initTurn(first);                  // package-private
        gs.computePlayerActions(first);      // package-private

        JSONObject response = new JSONObject();
        response.put("status", "ok");
        response.put("state", serializeState());
        return response;
    }

    private JSONObject handleActions() {
        JSONObject response = new JSONObject();
        response.put("status",  "ok");
        response.put("actions", serializeActions());
        return response;
    }

    private JSONArray serializeActions() {
        ArrayList<Action> actions = gs.getAllAvailableActions();
        JSONArray arr = new JSONArray();
        for (int i = 0; i < actions.size(); i++) {
            Action a = actions.get(i);
            JSONObject aj = new JSONObject();
            aj.put("id",          i);
            aj.put("type",        a.getActionType().toString());
            aj.put("description", a.toString());
            arr.put(aj);
        }
        return arr;
    }

    private JSONObject handleApply(JSONObject cmd) throws Exception {
        int actionId = cmd.getInt("action_id");
        ArrayList<Action> actions = gs.getAllAvailableActions();
        if (actionId < 0 || actionId >= actions.size())
            throw new Exception("action_id " + actionId + " out of range (0–" + (actions.size()-1) + ")");
        return applyAndRespond(actions.get(actionId));
    }

    private JSONObject handleAdvance() throws Exception {
        int activeTribeId = gs.getActiveTribeID();
        if (isHuman[activeTribeId])
            throw new Exception("Cannot advance: tribe " + activeTribeId + " is human");

        ElapsedCpuTimer ect = new ElapsedCpuTimer();
        ect.setMaxTimeMillis(Constants.TURN_TIME_MILLIS);

        GameState obs = gs.copy(activeTribeId);
        Action action = agents[activeTribeId].act(obs, ect);

        if (action == null)
            action = new EndTurn(activeTribeId);

        return applyAndRespond(action);
    }

    private JSONObject applyAndRespond(Action action) {
        int beforeId = gs.getActiveTribeID();
        gs.advance(action, true);
        // advance() handles: EndTurn → endTurn() → next tribe → initTurn() → computePlayerActions()
        // We only need to handle incTick() when the round wraps back around
        if (action.getActionType() == Types.ACTION.END_TURN && !gs.isGameOver()) {
            if (gs.getActiveTribeID() <= beforeId) {
                gs.incTick();   // package-private
            }
        }

        JSONObject response = new JSONObject();
        if (gs.isGameOver()) {
            response.put("status", "game_over");
            String winner = "none";
            for (Tribe t : gs.getTribes()) {
                if (t.getWinner() == Types.RESULT.WIN) { winner = t.getType().toString(); break; }
            }
            response.put("winner", winner);
        } else {
            response.put("status", "ok");
        }
        response.put("state", serializeState());
        return response;
    }
}
```

- [ ] **Step 2: Compile**

```bash
cd /home2/nchw73/Tribes
javac -cp lib/json.jar -sourcepath src -d out $(find src -name "*.java" | tr '\n' ' ') 2>&1 | grep -v "^Note:"
```

Expected: no output (warnings suppressed).

- [ ] **Step 3: Smoke-test init**

```bash
echo '{"cmd":"init","players":["RANDOM","RANDOM"],"tribes":["Xin Xi","Imperius"],"mode":"Capitals","seed":42}' \
  | java -cp out:lib/json.jar core.game.CLIRunner 2>/dev/null \
  | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
print('status:', d['status'])
s = d['state']
print('tick:', s['tick'], '| active_tribe:', s['active_tribe'])
print('board rows:', len(s['board']), '| cols:', len(s['board'][0]))
print('tribes:', [t['name'] for t in s['tribes']])
"
```

Expected:
```
status: ok
tick: 0 | active_tribe: 0
board rows: 11 | cols: 11
tribes: ['XIN_XI', 'IMPERIUS']
```

- [ ] **Step 4: Smoke-test actions**

```bash
{ echo '{"cmd":"init","players":["RANDOM","RANDOM"],"tribes":["Xin Xi","Imperius"],"mode":"Capitals","seed":42}';
  echo '{"cmd":"actions"}'; } \
  | java -cp out:lib/json.jar core.game.CLIRunner 2>/dev/null \
  | tail -1 \
  | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
print('num actions:', len(d['actions']))
for a in d['actions'][:3]:
    print(' ', a['id'], a['type'], '-', a['description'])
"
```

Expected: several actions printed, each with id/type/description.

- [ ] **Step 5: Full AI vs AI cycle test**

```bash
python3 - << 'PYEOF'
import subprocess, json

proc = subprocess.Popen(
    ["java", "-cp", "out:lib/json.jar", "core.game.CLIRunner"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
)

def send(cmd):
    proc.stdin.write((json.dumps(cmd) + "\n").encode())
    proc.stdin.flush()
    return json.loads(proc.stdout.readline())

r = send({"cmd": "init", "players": ["RANDOM","RANDOM"],
          "tribes": ["Xin Xi","Imperius"], "mode": "Capitals", "seed": 99})
assert r["status"] == "ok", r
print("Init OK, tick:", r["state"]["tick"])

moves = 0
while True:
    r = send({"cmd": "advance"})
    moves += 1
    if r["status"] == "game_over":
        print(f"Game over after {moves} advances. Winner: {r['winner']}")
        break
    if moves > 3000:
        print("Reached 3000 moves — stopping")
        break

proc.stdin.close()
proc.wait()
PYEOF
```

Expected: `Game over after N advances. Winner: <tribe>` within a few seconds.

- [ ] **Step 6: Commit**

```bash
git add src/core/game/CLIRunner.java
git commit -m "feat: CLIRunner headless game runner with JSON stdio protocol"
```

---

## Task 2: Python project setup and `game_session.py`

**Files:**
- Modify: `pyproject.toml`
- Create: `game_session.py`
- Create: `tests/__init__.py`
- Create: `tests/test_game_session.py`

- [ ] **Step 1: Update `pyproject.toml`**

```toml
[project]
name = "tribes"
version = "0.1.0"
description = "Tribes game web interface"
readme = "README.md"
requires-python = ">=3.10"
dependencies = [
    "fastapi",
    "uvicorn[standard]",
    "httpx",
    "pytest",
    "pytest-asyncio",
]
```

- [ ] **Step 2: Install**

```bash
uv sync
```

Expected: resolves and installs with no errors.

- [ ] **Step 3: Write the failing test**

Create `tests/__init__.py` (empty file) and `tests/test_game_session.py`:

```python
import pytest
import json
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def mock_process():
    proc = MagicMock()
    proc.stdin = MagicMock()
    proc.stdin.write = MagicMock()
    proc.stdin.drain = AsyncMock()
    proc.stdout = MagicMock()
    proc.kill = MagicMock()
    proc.wait = AsyncMock()
    return proc


@pytest.mark.asyncio
async def test_send_writes_json_and_parses_response(mock_process):
    from game_session import GameSession

    expected = {"status": "ok", "state": {"tick": 0}}
    mock_process.stdout.readline = AsyncMock(
        return_value=(json.dumps(expected) + "\n").encode()
    )

    session = GameSession()
    session._process = mock_process

    result = await session._send({"cmd": "actions"})

    written = mock_process.stdin.write.call_args[0][0].decode()
    assert json.loads(written) == {"cmd": "actions"}
    assert result == expected


@pytest.mark.asyncio
async def test_stop_kills_process(mock_process):
    from game_session import GameSession

    session = GameSession()
    session._process = mock_process
    session.is_running = True

    await session.stop()

    mock_process.kill.assert_called_once()
    mock_process.wait.assert_awaited_once()
    assert session._process is None
    assert not session.is_running
```

- [ ] **Step 4: Run to confirm failure**

```bash
uv run pytest tests/test_game_session.py -v 2>&1 | head -15
```

Expected: `ModuleNotFoundError: No module named 'game_session'`

- [ ] **Step 5: Create `game_session.py`**

```python
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
```

- [ ] **Step 6: Run tests**

```bash
uv run pytest tests/test_game_session.py -v
```

Expected: `2 passed`

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml game_session.py tests/__init__.py tests/test_game_session.py
git commit -m "feat: Python project deps and GameSession subprocess wrapper"
```

---

## Task 3: `game_loop.py`

**Files:**
- Create: `game_loop.py`

- [ ] **Step 1: Create `game_loop.py`**

```python
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
```

- [ ] **Step 2: Verify import**

```bash
uv run python3 -c "from game_loop import GameLoop; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add game_loop.py
git commit -m "feat: async GameLoop drives AI turns and broadcasts state"
```

---

## Task 4: `main.py` — FastAPI routes and WebSocket

**Files:**
- Create: `main.py`
- Create: `static/index.html` (placeholder, replaced in Task 5)
- Create: `tests/test_api.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_api.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock


FAKE_STATE = {
    "tick": 0,
    "active_tribe": 0,
    "game_over": False,
    "game_mode": "CAPITALS",
    "board": [],
    "tribes": [
        {"id": 0, "name": "XIN_XI", "stars": 5, "num_cities": 1,
         "is_human": True, "winner": "INCOMPLETE", "score": 0, "num_techs": 0},
        {"id": 1, "name": "IMPERIUS", "stars": 5, "num_cities": 1,
         "is_human": False, "winner": "INCOMPLETE", "score": 0, "num_techs": 0},
    ],
}


@pytest.fixture
def client():
    from unittest.mock import patch
    mock_session = MagicMock()
    mock_session.is_running = False
    mock_session.stop = AsyncMock()
    mock_session.start = AsyncMock(return_value={"status": "ok", "state": FAKE_STATE})
    mock_session.get_actions = AsyncMock(return_value={
        "status": "ok",
        "actions": [{"id": 0, "type": "END_TURN", "description": "END_TURN by tribe 0"}],
    })

    mock_loop = MagicMock()
    mock_loop.stop = AsyncMock()
    mock_loop.last_state = FAKE_STATE
    mock_loop.submit_action = AsyncMock()

    with patch("main.session", mock_session), patch("main.game_loop", mock_loop):
        from fastapi.testclient import TestClient
        from main import app
        yield TestClient(app)


def test_start_game(client):
    r = client.post("/game/start", json={
        "players": ["HUMAN", "MCTS"],
        "tribes": ["Xin Xi", "Imperius"],
    })
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_get_actions(client):
    r = client.get("/game/actions")
    assert r.status_code == 200
    assert "actions" in r.json()


def test_submit_action(client):
    r = client.post("/game/action", json={"action_id": 0})
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_stop_game(client):
    r = client.post("/game/stop")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
```

- [ ] **Step 2: Confirm tests fail**

```bash
uv run pytest tests/test_api.py -v 2>&1 | head -15
```

Expected: `ModuleNotFoundError: No module named 'main'`

- [ ] **Step 3: Create placeholder `static/index.html`**

```html
<!DOCTYPE html>
<html><body><h1>Tribes — frontend coming soon</h1></body></html>
```

Save to `static/index.html`.

- [ ] **Step 4: Create `main.py`**

```python
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from game_loop import GameLoop
from game_session import GameSession

app = FastAPI(title="Tribes")
app.mount("/static", StaticFiles(directory="static"), name="static")

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
    return FileResponse("static/index.html")


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
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest tests/test_api.py -v
```

Expected: `4 passed`

- [ ] **Step 6: Manual smoke test**

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 3
curl -s -X POST http://localhost:8000/game/start \
  -H "Content-Type: application/json" \
  -d '{"players":["RANDOM","RANDOM"],"tribes":["Xin Xi","Imperius"],"seed":42}' \
  | python3 -m json.tool
curl -s http://localhost:8000/game/actions | python3 -m json.tool | head -20
curl -s -X POST http://localhost:8000/game/stop | python3 -m json.tool
kill %1 2>/dev/null; true
```

Expected: each curl returns `{"status": "ok"}` or an actions list.

- [ ] **Step 7: Commit**

```bash
git add main.py static/index.html tests/test_api.py
git commit -m "feat: FastAPI routes and WebSocket endpoint"
```

---

## Task 5: Frontend

**Files:**
- Modify: `static/index.html`
- Create: `static/game.js`
- Create: `static/style.css`

- [ ] **Step 1: Invoke `/frontend-design`**

Use the `/frontend-design` skill. Brief it with:

> Build a single-page frontend for Tribes, a turn-based strategy game. Two views:
>
> **Setup view** (shown on load):
> - Dropdown rows for each player: player type (HUMAN, RANDOM, MCTS, RHEA, OSLA, MC, OEP, EMCTS, PORTFOLIO_MCTS) and tribe (Xin Xi, Imperius, Bardur, Oumaji, Zebasi, Hoodrick, Luxidoor, Vengir, Elyrion, Polaris, Kickoo). Default 2 players; "Add player" adds a third/fourth row.
> - Game mode dropdown: Capitals / Score
> - "Start Game" button → POST `/game/start` with `{players:[...], tribes:[...], mode:"...", seed:-1}` → on success switch to game view and open WebSocket `/ws`
>
> **Game view**:
> - HTML5 canvas board rendering an N×N tile grid (board is `state.board[y][x]`). Tile size ~48px. Per tile: background colour by terrain, resource/building as a small text label, unit as a coloured circle with an HP bar below it. Unit colour = tribe colour.
> - Terrain colours: PLAIN `#c8b96e`, MOUNTAIN `#8a8a8a`, FOREST `#2d6a2d`, OCEAN `#1a6b8a`, SHALLOW_WATER `#4da6c8`, anything else `#c8b96e`
> - Tribe colours (by index): 0=`#2ecc71`, 1=`#3498db`, 2=`#e74c3c`, 3=`#f39c12`
> - Side panel: one card per tribe showing name, stars ⭐, cities 🏙, techs 🔬, score. Highlight the active tribe's card with a border.
> - Action panel (only on human turn, i.e. `state.tribes[state.active_tribe].is_human === true`): scrollable list of buttons, one per action from GET `/game/actions`. Each button shows `action.description`. On click: POST `/game/action` with `{action_id: N}`, then disable all buttons until the next WebSocket state arrives.
> - Status bar at top: "Turn N", spinner + "AI thinking…" during AI turns, "Your turn" during human turns, winner overlay on `state.game_over === true` with a "New Game" button that returns to setup view and POSTs `/game/stop`.
> - WebSocket at `/ws`: on each message re-render the board + panels. Reconnect once if disconnected.
>
> Output files: `static/index.html`, `static/game.js`, `static/style.css`

- [ ] **Step 2: Verify server serves the frontend**

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 2
curl -s http://localhost:8000/ | grep -c "canvas\|setup\|game\|Start"
kill %1 2>/dev/null; true
```

Expected: count > 0 (page contains frontend elements).

- [ ] **Step 3: Commit**

```bash
git add static/
git commit -m "feat: browser frontend for setup and game views"
```

---

## Task 6: Integration test and launch script

**Files:**
- Create: `start.sh`

- [ ] **Step 1: Human-turn integration test against real Java process**

```bash
python3 - << 'PYEOF'
import subprocess, json

proc = subprocess.Popen(
    ["java", "-cp", "out:lib/json.jar", "core.game.CLIRunner"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
)

def send(cmd):
    proc.stdin.write((json.dumps(cmd) + "\n").encode())
    proc.stdin.flush()
    return json.loads(proc.stdout.readline())

r = send({"cmd": "init", "players": ["HUMAN", "RANDOM"],
          "tribes": ["Xin Xi", "Imperius"], "mode": "Capitals", "seed": 7})
assert r["status"] == "ok"
assert r["state"]["tribes"][0]["is_human"] is True
assert r["state"]["tribes"][1]["is_human"] is False
print("Init OK")

# Human picks EndTurn
r = send({"cmd": "actions"})
end_id = next(i for i, a in enumerate(r["actions"]) if a["type"] == "END_TURN")
r = send({"cmd": "apply", "action_id": end_id})
print("Human EndTurn applied — active tribe:", r["state"]["active_tribe"],
      "| status:", r["status"])
assert r["state"]["active_tribe"] == 1 or r["status"] == "game_over"

# AI advances until back to human
while r["status"] == "ok" and r["state"]["active_tribe"] != 0:
    r = send({"cmd": "advance"})

print("Back to human — tick:", r["state"]["tick"])
proc.stdin.close()
proc.wait()
print("All checks passed")
PYEOF
```

Expected: prints `Init OK`, `Human EndTurn applied`, `Back to human`, `All checks passed`.

- [ ] **Step 2: Create `start.sh`**

```bash
#!/bin/bash
set -e
echo "=== Compiling Java ==="
javac -cp lib/json.jar -sourcepath src -d out \
    $(find src -name "*.java" | tr '\n' ' ') 2>&1 | grep -v "^Note:" || true

echo "=== Starting server on :8000 ==="
echo "In VS Code: open the Ports panel and forward port 8000, then open the browser URL."
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
chmod +x start.sh
```

- [ ] **Step 3: Full end-to-end launch**

```bash
./start.sh
```

In VS Code, open the **Ports** panel (bottom toolbar → Ports tab), find port 8000, and click the globe icon to open in browser. Verify:
- Setup view loads
- Starting HUMAN vs MCTS works
- Board renders with coloured tiles and units
- Actions appear on your turn; clicking one updates the board
- AI moves auto-update every ~0.4 s
- Game-over banner appears when finished

- [ ] **Step 4: Commit**

```bash
git add start.sh
git commit -m "feat: integration test + start.sh one-command launcher"
```
