# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tribes is a multi-player turn-based strategy game framework for AI research. It is a **pure Java project** (Java 8+) with no build tool (no Maven/Gradle). The only external dependency is `lib/json.jar`.

## Building and Running

**Compile** (from repo root, with `src/` as sources root):
```bash
javac -cp lib/json.jar -sourcepath src -d out $(find src -name "*.java")
```

**Run a game** (configured via `play.json`):
```bash
java -cp out:lib/json.jar Play
```

**Run a tournament** (configured via `tournament.json`):
```bash
java -cp out:lib/json.jar Tournament
```

**Run headless** (no GUI): Set `VISUALS = false` in `src/core/Constants.java` before compiling, or use an IDE run configuration.

The recommended development environment is **IntelliJ IDEA** — create a project from existing sources, mark `src/` as the sources root, and add `lib/json.jar` as a library.

## Configuration

All runtime parameters are controlled by JSON files — no code changes needed for most experiments:

- **`play.json`** — single game settings: `Run Mode` (`PlayLG`/`PlayFile`/`Replay`), `Players`, `Tribes`, `Game Mode` (`Capitals`/`Score`), seeds, search parameters, pruning flags.
- **`tournament.json`** — tournament settings: repetitions, player matchups, tribe assignments, level seeds.

Player types available: `DONOTHING`, `HUMAN`, `RANDOM`, `OSLA`, `MC`, `SIMPLE`, `MCTS`, `RHEA`, `OEP`, `EMCTS`, `PORTFOLIO_MCTS`.

Tribe names: `Xin Xi`, `Imperius`, `Bardur`, `Oumaji`, etc. (see `Types.TRIBE`).

## Architecture

### Entry Points
- **`Play.java`** — interactive single-game runner, reads `play.json`
- **`Tournament.java`** — round-robin tournament runner, reads `tournament.json`
- **`RunElites.java`** — MAP-Elites quality-diversity search runner
- **`Run.java`** — shared utility: `PlayerType` enum, `getAgent()` factory, `runGame()` loop

### Core Game Engine (`src/core/`)
- **`game/Game.java`** — outer game loop; holds the true `GameState` plus per-player observation copies (`gameStateObservations[]`); calls `Agent.act()` each turn
- **`game/GameState.java`** — the central object for AI agents. Key methods:
  - `copy()` / `copy(playerIdx)` — deep copy for simulation (respects fog of war when playerIdx ≥ 0)
  - `advance(action, computeActions)` — applies an action; set `computeActions=false` in inner simulation loops for performance
  - `next(action)` — internal step (package-private)
  - `computePlayerActions()` — populates city/unit/tribe action lists for the current active tribe
  - `getAllCityActions()`, `getAllUnitActions()`, `getTribeActions()` — retrieve available actions
- **`game/Board.java`** — 2D tile grid with terrain, resources, and actor placement
- **`Constants.java`** — all runtime flags (`VISUALS`, `TURN_TIME_LIMITED`, `PLAY_WITH_FULL_OBS`, `MAX_TURNS_CAPITALS`, etc.)
- **`TribesConfig.java`** — game balance values (unit attack/defence, costs, etc.)
- **`Types.java`** — enums: `TRIBE`, `GAME_MODE`, `ACTION`, `TERRAIN`, `RESOURCE`, `BUILDING`, `TECH`, etc.

### Actors (`src/core/actors/`)
- `Actor` → `City`, `Building`, `Temple`, `Tribe`
- `Unit` (abstract) → concrete units: `Warrior`, `Archer`, `Rider`, `Swordman`, `Catapult`, `Knight`, `Defender`, `MindBender`, `Boat`, `Ship`, `Battleship`, `SuperUnit`

### Action System (`src/core/actions/`)
Three categories with parallel Factory + Command structure:
- **`cityactions/`** — Build, Spawn, LevelUp, ResourceGathering, BurnForest, ClearForest, GrowForest, Destroy
- **`unitactions/`** — Move, Attack, Capture, Convert, Recover, HealOthers, MakeVeteran, Upgrade, Examine, Disband, StepMove
- **`tribeactions/`** — ResearchTech, BuildRoad, DeclareWar, SendStars, EndTurn

Each action has an `XxxFactory` (generates legal instances from a game state) and an `XxxCommand` (applies the effect). `ActionFactory.java` dispatches to the right sub-factory.

### AI Players (`src/players/`)
All agents extend `Agent` and implement `act(GameState gs, ElapsedCpuTimer ect) → Action`.

- **`Agent.java`** — abstract base; `determineActionGroup()` and `allGoodActions()` helpers filter out Destroy/Disband
- **`heuristics/`** — `StateHeuristic` interface; implementations: `TribesSimpleHeuristic`, `TribesDiffHeuristic`, `TribesEntropyHeuristic`, `PruneHeuristic`, `PrunePortfolioHeuristic`
- **`portfolio/`** — `Portfolio` interface; `SimplePortfolio` selects among named `BaseScript` sub-classes (one per tactical objective in `scripts/`)
- Player packages: `mcts/`, `rhea/`, `emcts/`, `portfolioMCTS/`, `osla/`, `mc/`, `oep/`
- Each planning player has a corresponding `XxxParams` class for algorithm hyperparameters

### MAP-Elites (`src/utils/mapelites/`)
Quality-diversity level generation used by `RunElites.java`. `MapElites.java` drives the search; `Feature` defines behavioural dimensions; `Generator` produces candidate levels.

### Utilities (`src/utils/`)
- `ElapsedCpuTimer` — wall-clock budget enforcer passed to `act()`; check `ect.remainingTimeMillis()` to avoid timeout
- `graph/Pathfinder.java` — A* pathfinding used by unit movement
- `stats/` — `StatSummary`, `MultiStatSummary`, `GameplayStats`, `AIStats` for result collection
- `file/IO.java` — JSON read/write helpers

## Implementing a New Agent

1. Create a class extending `Agent` in a new sub-package of `players/`
2. Implement `act(GameState gs, ElapsedCpuTimer ect)` — call `gs.copy()` to get a simulation state, `gs.advance(action, false)` to step it
3. Implement `copy()` — required for agents used inside search trees
4. Add a `PlayerType` enum entry in `Run.java` and a constructor case in `Run.getAgent()`

## Key Constants to Know

| Constant | Default | Effect |
|---|---|---|
| `VISUALS` | `true` | Enables Swing GUI; set `false` for headless batch runs |
| `PLAY_WITH_FULL_OBS` | `true` | Agents receive full game state; `false` = fog-of-war |
| `TURN_TIME_LIMITED` | `false` | When `true`, agents are budget-limited by `TURN_TIME_MILLIS` |
| `MAX_TURNS_CAPITALS` | `50` | Turn limit for Capitals mode |
| `VERBOSE` / `LOG_STATS` | `true` | Console output and stats logging |
