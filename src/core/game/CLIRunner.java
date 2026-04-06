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
        // Normalize: lowercase and strip spaces, hyphens, underscores
        // so "Xin Xi", "Xin-Xi", and "XIN_XI" all resolve correctly
        String norm = name.toLowerCase().replaceAll("[\\s\\-_]", "");
        for (Types.TRIBE t : Types.TRIBE.values()) {
            String enumNorm    = t.name().toLowerCase().replaceAll("[\\s\\-_]", "");
            String displayNorm = t.getName().toLowerCase().replaceAll("[\\s\\-_]", "");
            if (enumNorm.equals(norm) || displayNorm.equals(norm))
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
