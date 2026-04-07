# Python UI — Java UI Parity Design

**Date:** 2026-04-07  
**Branch:** `python-play-ui`  
**Scope:** QoL/fixes only — no extensions (stats dashboard, tournament UI, replay viewer, agent tuning are out of scope)

---

## Goal

Bring the Python browser UI to full feature parity with the Java Swing UI, while retaining the Python UI's superior visual quality. The Java UI's functionality gap is:

- No map interaction (tile click, action highlights, pan/zoom)
- No tile info display (unit stats, city details)
- No tech tree view or research interaction
- No per-tribe tech visibility
- No game controls (pause/resume, play-turn, play-tick, quit)
- No city level-up dialog
- No action log
- Missing unit/city/tribe data in serialized state

---

## Architecture

Three layers of change. No new files.

| Layer | Files |
|---|---|
| Java backend | `src/core/game/CLIRunner.java` |
| Python server | `tribes_py/web/main.py`, `tribes_py/web/game_loop.py` |
| Frontend | `tribes_py/web/static/game.js`, `index.html`, `style.css` |

---

## 1. CLIRunner.java — Enriched Serialization

### 1.1 `serializeUnit()` — add combat stats

```
atk        int    unit.ATK
def        int    unit.DEF
mov        int    unit.MOV
range      int    unit.RANGE
kills      int    unit.getKills()
status     string unit.getStatus().toString()
```

### 1.2 `serializeBoard()` — add city details to tile

When `city_id >= 0`, add a `city` sub-object:

```
city.is_capital    boolean  c.isCapital()
city.production    int      c.getProduction()
city.points_worth  int      c.getPointsWorth()
```

### 1.3 `serializeTribes()` — add production, agent type, tech list

```
max_production  int       t.getMaxProduction(gs)
agent_type      string    agents[i].getClass().getSimpleName()  (or "HUMAN")
techs           string[]  names of all researched TECHNOLOGY values
```

### 1.4 State-level `leveling_up` flag

`serializeState()` adds:

```
leveling_up  boolean  gs.isLevelingUp()
```

When `leveling_up` is true, the frontend shows the city level-up dialog. The LevelUp action options are already present in the normal actions list — the frontend filters them by type `LEVEL_UP`.

### 1.5 `serializeActions()` — add positional/target data

Per action type, add the following fields alongside the existing `id`, `type`, `description`:

| Action type(s) | Extra fields |
|---|---|
| MOVE, STEP_MOVE | `unit_x`, `unit_y`, `target_x`, `target_y` |
| ATTACK, CONVERT, HEAL_OTHERS, CAPTURE, EXAMINE | `unit_x`, `unit_y`, `target_x`, `target_y` |
| RECOVER, MAKE_VETERAN, DISBAND, UPGRADE_BOAT, UPGRADE_SHIP | `unit_x`, `unit_y` |
| SPAWN, BUILD, RESOURCE_GATHERING, BURN_FOREST, CLEAR_FOREST, GROW_FOREST, DESTROY | `city_id`, `target_x`, `target_y` |
| LEVEL_UP | `city_id` |
| RESEARCH_TECH | `tech` (tech name string) |
| SEND_STARS | `target_tribe_id`, `stars` |
| DECLARE_WAR | `target_tribe_id` |
| BUILD_ROAD | `target_x`, `target_y` |
| END_TURN | (no extra fields) |

Position extraction follows the same logic as `GUI.getActionPosition()` for unit actions, and `CityAction.getTargetPos()` for city actions.

---

## 2. Python Layer

### 2.1 `game_loop.py` — pause and play-mode support

Add to `GameLoop`:

```python
_paused: asyncio.Event          # set = running, clear = paused
_play_mode: str | None          # None | "turn" | "tick"
_play_mode_start_tribe: int     # tribe id when play-mode began
_play_mode_start_tick: int      # tick when play-mode began
```

The AI advance loop checks `_paused` before each step (`await _paused.wait()`).

After each advance in play-mode:
- `"turn"`: if active tribe changed from `_play_mode_start_tribe` → pause, clear `_play_mode`
- `"tick"`: if tick incremented from `_play_mode_start_tick` → pause, clear `_play_mode`

Public methods added: `pause()`, `resume()`, `play_turn()`, `play_tick()`.

### 2.2 `main.py` — new endpoints

```
POST /game/pause
POST /game/resume
POST /game/play-turn
POST /game/play-tick
```

Each delegates to the corresponding `GameLoop` method and returns `{"status": "ok"}`.

`POST /game/stop` (existing) handles Quit — no change needed.

---

## 3. Frontend Layout

### 3.1 Overall structure (no change to three-column layout)

```
┌─────────────────────────────────────────────────────┐
│  STATUS BAR: Turn | Status | Mode | [Controls]       │
├──────────────┬──────────────────┬────────────────────┤
│  LEFT PANEL  │   CANVAS BOARD   │   RIGHT PANEL      │
│  (swappable) │                  │   Action buttons   │
│              │                  │   ─────────────    │
│              │                  │   Action log       │
└──────────────┴──────────────────┴────────────────────┘
```

### 3.2 Status bar — game controls added right side

Buttons: **Pause / Resume** (toggles), **Play Turn**, **Play Tick**, **Quit**  
Quit triggers a confirm dialog before calling `POST /game/stop`.

### 3.3 Left panel — three modes

Managed by `renderLeftPanel(mode, data)`:

- **`"tribes"`** (default) — existing tribe cards, enriched with `+N` production and agent type. Clicking a tribe card → `"tribe-tech"` mode for that tribe.
- **`"tile"`** — shows selected tile info (see §5). X button → back to `"tribes"`.
- **`"tribe-tech"`** — shows tribe name, then list of that tribe's researched techs. X button → back to `"tribes"`.

### 3.4 Right panel — action buttons + log

Top section: tribe-level action buttons, always visible during human turn:
- **End Turn** — submits END_TURN action directly
- **Research Tech** — opens tech tree modal
- **Build Road** — highlights valid road tiles on canvas; click tile to submit
- **Send Stars** — opens picker dialog (target tribe + amount)
- **Declare War** — opens picker dialog (target tribe)

Buttons are shown/hidden based on whether matching actions exist in the current action list.

Bottom section: scrollable action log (see §7).

---

## 4. Canvas Interaction

### 4.1 State held in JS module scope

```js
let selectedTile = null;        // {x, y} or null
let actionMap = new Map();      // "x,y" → Action[]  (built per turn)
let panOffset = {x: 0, y: 0};
let tileSize = 48;              // px, clamped 24–80
```

### 4.2 Click handling

Canvas click executes **unit actions only** (MOVE, ATTACK, CAPTURE, etc.). City/tile context actions (Spawn, Build, Gather, etc.) are always executed via buttons in the left panel tile info view — never by clicking the canvas target tile directly.

```
click(pixelX, pixelY):
  tileX = floor((pixelX - panOffset.x) / tileSize)
  tileY = floor((pixelY - panOffset.y) / tileSize)

  if selectedTile has a unit and unitActionMap.has("tileX,tileY"):
    execute the unit action targeting (tileX, tileY)
    clearSelection()
    return

  selectTile(tileX, tileY)
```

`selectTile(x, y)`:
1. Sets `selectedTile`
2. Filters current action list into two maps:
   - `unitActionMap`: unit actions originating from (x, y) → keyed by target tile `"tx,ty"`
   - `tileActionList`: city/tile actions targeting (x, y) → flat list for left panel buttons
3. Calls `renderLeftPanel("tile", tileData)` with tile info + `tileActionList` from `currentState`
4. Re-renders canvas with highlights from `unitActionMap`

`clearSelection()`: resets `selectedTile`, clears both maps, restores `renderLeftPanel("tribes")`, re-renders.

### 4.3 Highlight colors (canvas overlay, 40% opacity)

| Action type | Color |
|---|---|
| MOVE, STEP_MOVE | Blue `#3498db` |
| ATTACK, CONVERT | Red `#e74c3c` |
| HEAL_OTHERS | Green `#2ecc71` |
| SPAWN, BUILD, RESOURCE_GATHERING, BURN_FOREST, CLEAR_FOREST, GROW_FOREST, DESTROY | Yellow `#f1c40f` |
| BUILD_ROAD | Teal `#1abc9c` |

### 4.4 Pan and zoom

- **Pan:** `mousedown` stores `dragStart`; `mouseup` with distance ≥ `GUI_MIN_PAN` (8px) → add delta to `panOffset`, re-render. Click suppressed if drag distance > 4px.
- **Zoom:** `wheel` event → adjust `tileSize` by ±4, clamp 24–80, re-render.

### 4.5 Animations

On receiving a state update where the previous action was ATTACK, CONVERT, or HEAL_OTHERS: flash the target tile with the action's highlight color for 400ms (CSS transition or `setTimeout` clear) before replacing the full render.

---

## 5. Tile Info Panel (left panel `"tile"` mode)

Content priority order (same as Java InfoView):
1. If unit present (and not clicking same tile twice): show unit info
2. If terrain is CITY: show city info
3. Otherwise: terrain + resource + building

**Unit info:**
- Tribe name + unit type (header)
- HP / max HP
- ATK, DEF, MOV, RANGE
- Kills toward veteran (or "Veteran" if already veteran)
- Status (FRESH / MOVED / ATTACKED)

**City info:**
- Tribe + city ID (header)
- Capital: yes/no
- Production per turn
- Points worth

**Terrain/resource/building:** plain text labels

Below the info: **context action buttons** for the selected tile — filtered from `actionMap`, rendered as buttons. Each click submits the action. Disband triggers a confirm dialog first.

---

## 6. Tech Tree Modal

### 6.1 Static tree data in JS

```js
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
  // What each tech enables — used for display only
  CLIMBING:     ['Enables unit: DEFENDER', 'Enables resource: ORE (via MINING)'],
  MINING:       ['Enables building: MINE', 'Enables building: FORGE', 'Enables unit: SWORDMAN'],
  // ... (full list populated from Types.java during implementation)
};
```

### 6.2 Rendering

Modal opened by Research Tech button. Layout: columns by tier (1–3), grouped by root chain.

Each tech node shows:
- Tech name
- Star cost (computed as `BASE_COST + tier * numCities`)
- Color: **blue** = researched, **green** = researchable + affordable, **orange** = prereq met, not enough stars, **gray** = locked

Clicking a tech: shows info panel within modal (what it unlocks). If green → **Research** button submits the RESEARCH_TECH action and closes modal.

---

## 7. Action Log

Right panel bottom section. A scrollable `<ul id="action-log">` that:
- Prepends a `<li>` with the action description each time an action is submitted
- Capped at 50 entries (oldest removed)
- Prefixed with turn number: `[T5] Move to (3,4)`

Populated by both human and AI actions. CLIRunner includes `last_action` (description string) in every state response from `applyAndRespond()` and `handleAdvance()`. The frontend logs this on every WebSocket state update. AI actions shown in a muted color; human actions in normal color.

---

## 8. Dialogs

Single helper function used for all dialogs:

```js
showDialog(title, bodyHTML, buttons)
// buttons: [{label, className, onClick}]
// returns a close() function
```

| Dialog | Trigger | Content |
|---|---|---|
| City level-up | `state.leveling_up === true` | Two LevelUp action choices as buttons |
| Disband confirm | Disband button clicked | "Disband this unit?" — Yes/No |
| Send Stars | Send Stars button clicked | Tribe picker + star amount input |
| Declare War | Declare War button clicked | Tribe picker |
| Quit confirm | Quit button clicked | "End this game?" — Yes/No → `POST /game/stop` |

---

## 9. DRY / Code Structure

`game.js` is organized into clearly labelled sections (existing pattern extended):

```
IMAGE_LOADING
TECH_TREE_DATA        ← new: static TECH_TREE + TECH_UNLOCKS constants
SETUP_VIEW
WEBSOCKET
STATE                 ← new: selectedTile, actionMap, panOffset, tileSize
CANVAS_RENDERER       ← updated: drawHighlights, drawAnimation
CANVAS_INTERACTION    ← new: click, pan, zoom handlers
LEFT_PANEL            ← updated: renderLeftPanel(mode, data)
RIGHT_PANEL           ← updated: tribe action buttons, action log
TECH_TREE_MODAL       ← new: openTechModal(), renderTechNode()
DIALOGS               ← new: showDialog() + per-dialog functions
GAME_CONTROLS         ← new: pause/resume/playTurn/playTick/quit
GAME_OVER
INITIALIZATION
```

Key DRY principles:
- `showDialog()` used for all modal dialogs
- `renderLeftPanel(mode, data)` handles all three panel states
- `buildActionMap(actions)` called once per turn, reused by canvas renderer and tile info panel
- `submitAction(id, description)` is the single point for all action submission + action log append

---

## Out of Scope

The following Java UI items are **marked TODO in the Java source** and not implemented there either — excluded:

- Quick-select buttons (all units / units of type / cities)
- Observability toggle
- Visuals on/off toggle
- Action history replay

The following are **extensions** deferred to future work:

- Stats dashboard
- Tournament runner UI
- Replay viewer
- Agent parameter tuning
