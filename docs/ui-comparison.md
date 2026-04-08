# UI Comparison: Java Swing vs Python Web

> Goal: bring the Python browser UI to parity with the Java Swing UI.
> Branch: `python-play-ui`

---

## Summary table

| Feature | Java Swing | Python Web | Gap |
| --- | --- | --- | --- |
| Board rendering | Isometric (rotated 45°), sprites | Flat top-down, sprites | Style difference |
| Pan | Mouse drag | Mouse drag | ✅ |
| Zoom | Mouse wheel | Mouse wheel | ✅ |
| Pan-to-tribe on turn change | ✅ | ✗ | Missing |
| Tile click → info | ✅ InfoView (text + buttons) | ✅ Left panel | ✅ |
| Unit info on click | HP, ATK, DEF, MOV, RNG, status, kills | Same | ✅ |
| City info on click | Capital, points, production | Same | ✅ |
| Terrain/resource/building info | ✅ | ✅ | ✅ |
| Unit action highlights on map | ✅ colour-coded overlays | ✅ colour-coded overlays | ✅ |
| City action buttons on click | ✅ inline buttons | ✅ tile action list | ✅ |
| DISBAND confirmation dialog | ✅ JOptionPane | ✅ custom modal | ✅ |
| City level-up chooser | ✅ JOptionPane | ✅ modal | ✅ |
| End Turn button | ✅ | ✅ | ✅ |
| Pause / Resume | ✅ | ✅ (broken — see bugs) | Buggy |
| Play Turn (pause after tribe turn) | ✅ | ✅ (broken — see bugs) | Buggy |
| Play Tick (pause after all tribes) | ✅ | ✅ (broken — see bugs) | Buggy |
| Tech tree view | ✅ side-panel tab, inline buttons | ✅ modal, tier columns | Style difference |
| Tech research status colours | ✅ | ✅ | ✅ |
| Tech cost display | ✅ (star cost + requirements) | ✅ (approximate, buggy discount) | Bug |
| Tech unlock list | ✅ | ✅ | ✅ |
| Tribe info / rankings panel | ✅ side-panel tab | ✅ tribe cards | ✅ |
| Per-tribe tech drill-down | ✅ | ✅ (click tribe card) | ✅ |
| Fog of war rendering | ✅ fog overlay | Colour only, no overlay | Missing |
| Fog of war: human player perspective | ✅ | ✗ | Missing |
| Spectate from any tribe's perspective | ✅ | ✗ | Missing |
| Whale resource image | ✅ | ✗ (not rendering — image exists) | Buggy |
| Send Stars dialog | ✗ | ✅ | Python-only |
| Declare War dialog | ✗ | ✅ | Python-only |
| Examine ruins result display | ✅ status bar with timer | ✗ | Missing |
| Attack / Convert / Heal animations | ✅ sprite sheet effects | ✗ (flash wired wrong) | Buggy |
| Action log | ✗ | ✅ tribe-coloured log | Python-only |
| Action log clears on new game | n/a | ✅ | ✅ |
| Game-over overlay | ✗ | ✅ | Python-only |
| Game setup screen | ✗ (play.json only) | ✅ full config UI | Python-only |
| Quit / restart in-game | ✗ | ✅ | Python-only |
| Road / city-wall overlays | ✅ | ✗ | Missing |
| Capital marker on map | ✅ star decoration | ✗ | Missing |
| HP bar on units | ✗ | ✅ | Python-only |
| Veteran ring on units | ✅ | ✅ (golden ring) | ✅ |

---

## Feature details

### Board rendering

**Java**: isometric projection (−45° rotation), tile size scales with screen diagonal, sprites from `img/` directory. Action overlays drawn as coloured cells. Pan via mouse drag; zoom via mouse wheel changes `CELL_SIZE` globally.

**Python**: flat top-down grid on HTML5 canvas, tile size in pixels (`tileSize`, default 48, min 24 max 80). Pan via drag (`panOffset`), zoom via wheel. Same sprite set used. The two views are stylistically different but equally functional for game play.

### Tile info and actions

Both UIs show the same information hierarchy: unit > city > terrain+resource+building.

**Java (`InfoView.java`)**: renders into a JEditorPane (HTML) plus a dynamic set of action buttons whose visibility toggles per tile. Action firing goes through `ActionController.addAction()`.

**Python (`panels.js`, `state.js`)**: renders into the left panel DOM. Unit actions are shown as tile highlights on the canvas (via `unitActionMap`); city/tile actions appear as buttons in the tile-info section. Action firing goes to `/game/action` via HTTP POST.

### Tech tree

**Java (`TechView.java`)**: permanent side-panel tab with one `JButton` per tech, positioned in a `GridBagLayout` tree. Click sets `infoView.techHighlight` which shows detail + "Research" button in InfoView. Colours reflect research state. Connected to live `GameState` for star costs.

**Python (`tech-tree.js`)**: modal opened via "RESEARCH TECH" button in the right panel. Tier columns (1/2/3) with colour-coded nodes (`tech-researched`, `tech-affordable`, `tech-unlocked`, `tech-locked`). Clicking a node shows name, ~cost, unlocks, and a Research button if affordable. Cost is approximate (hardcoded tier formula); researched state comes from `tribe.techs[]` in game state.

### Controls

Both UIs expose the same four game-flow controls: **End Turn**, **Play Turn**, **Play Tick**, **Pause/Resume**. Java has these as `JButton`s wired to `game.setPaused()` and `ac.addAction()`. Python posts to `/game/pause`, `/game/resume`, `/game/play-turn`, `/game/play-tick`. The Python buttons are currently broken (see bug #3 below). The TODO also notes the pause/play UI could be simplified to a single toggle button rather than separate Pause and Play controls.

### Fog of war

**Java**: renders fog tiles with a distinct fog overlay image; when `PLAY_WITH_FULL_OBS = false`, each player agent only sees their own observable tiles. The GUI shows the active player's fog-limited view.

**Python**: `FOG` is a valid terrain type in `TERRAIN_COLORS` but gets no overlay. The backend always sends full-observation state; there is no mechanism to switch to a player-specific perspective. This means human players cannot play with fog of war, and observers cannot watch from a single tribe's viewpoint.

---

## Known bugs in the Python UI

| # | Bug | Location | Severity |
| --- | --- | --- | --- |
| 1 | Java process crash → `json.loads(b'')` raises unhandled `JSONDecodeError` | `game_session.py _send()` | High |
| 2 | `game_loop._run()` crashes silently (no error broadcast to WS clients) | `game_loop.py` | High |
| 3 | Pause / Play Turn / Play Tick buttons do not work | `game_loop.py` + `dialogs.js initGameControls()` | High |
| 4 | `fetchActions()` race: called on every WS state update during human turn | `game.js renderGameState()` | Medium |
| 5 | Philosophy tech cost: `rawCost * 0.2` gives 80% discount; should be `rawCost * 0.8` (20% off) | `tech-tree.js:139` | Medium |
| 6 | `flashTile()` defined but never called from `submitAction()` — tile flash is dead code | `canvas.js` / `state.js` | Low |
| 7 | `SWORDSMAN` vs `SWORDMAN` — `game.js UNIT_TYPES` uses `'swordsman'` but game state emits `SWORDMAN` | `game.js` | Low |

---

## Missing features (roadmap to parity)

Ordered roughly by impact:

1. **Fix Pause / Play Turn / Play Tick buttons** — the frontend posts to the correct endpoints but the game loop doesn't respond. Investigate `game_loop.py` pause handling. Consider simplifying to a single Pause/Resume toggle (per TODO).

2. **Fog of war / player perspective** — backend needs to send a player-scoped board view when a human is playing, with fog on tiles not visible to that player. Add a `perspective` parameter to the game state response.

3. **Whale resource not rendering** *(needs runtime debugging)* — `img/resource/whale2.png` exists, the JS key `'WHALES'` matches what Java serialises via `res.toString()`, and the static file mount is correct. Root cause not yet found from static analysis. Leads to investigate at runtime:
   - Open browser DevTools → Network tab, filter `/img/resource/whale2.png` — check it returns 200 and is a valid PNG.
   - In console, run `getResourceImage('WHALES')` — should return a cached HTMLImageElement.
   - Check `currentState.board` for a tile with `resource === "WHALES"` — if none appear, the map seed may not generate whale tiles, or they've already been gathered (`ResourceGatheringCommand` sets resource to `null` after gathering).
   - Note: `Board.maskResource()` hides WHALES until FISHING is researched in player-scoped copies, but CLIRunner calls `getResourceAt()` on the raw board so masking is bypassed.
   - Note: `WHALES` are placed on `DEEP_WATER` tiles by the level generator — maps without deep water won't have them.

4. **Examine ruins result display** — after an EXAMINE action, show the bonus text in the status bar or a toast for a few seconds (mirrors Java's `otherInfo` label + `GUI_INFO_DELAY` timer).

5. **Pan-to-tribe on turn change** — when the active tribe changes, pan the canvas to that tribe's capital tile (mirrors `boardView.setPanToTribe(gs)`).

6. **Capital and wall markers on canvas** — draw a star/crown decoration on capital cities and a wall outline on walled cities, as the Java view does with `capitalImg` and `cityWalls`.

7. **Road overlays** — draw road tiles when a road is present, using the road half-images the Java view loads.

8. **Attack / Convert / Heal animations** — on those action types, play a brief visual effect on the target tile. Python already has `flashTile()` and `pendingAnimation`; wire them into `submitAction()`.

9. **Fog-of-war overlay** — when `tile.terrain === 'FOG'`, draw a semi-transparent dark overlay instead of just a dark fill colour.

10. **Tech cost accuracy** — expose the actual star cost in the `RESEARCH_TECH` action payload from the backend and display it in the modal instead of the approximation.

11. **Unit action: MAKE_VETERAN** — `MAKE_VETERAN` is in `UNIT_ACTION_TYPES` in `state.js` but has no highlight colour in `HIGHLIGHT_COLORS` and no button in the tile panel.

---

## Extensions (beyond parity)

From TODO.md:

- Game configuration stored per-session (not global `play.json`)
- Stats dashboard: win rates, score history, tech progression
- Tournament runner UI
- Replay viewer
- Agent parameter tuning from the UI
- Slurm integration for heavy AI compute

---

## Resolved TODO items

| Item | Commit |
| --- | --- |
| Action log not clearing on new game | `fix(frontend): clear action log when new game starts` |
| Action log entries not colour-coded by tribe | `feat(frontend): colour action log entries by tribe` |
| DISBAND not routed through confirmation dialog | `fix(frontend): route DISBAND through confirmation dialog` |
| WHALE→WHALES resource key mismatch (partial — still not rendering) | `fix(frontend): correct WHALE→WHALES resource image key` |
| Can't see per-tribe tech list | Implemented: click tribe card in left panel |
