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
async function submitAction(actionId) {
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
