// ============================================
// TRIBES - Tactical Command Interface
// ============================================

const PLAYER_TYPES = ['HUMAN', 'RANDOM', 'MCTS', 'RHEA', 'OSLA', 'MC', 'OEP', 'EMCTS', 'PORTFOLIO_MCTS'];
// Names must match Java Types.TRIBE getName() or name() after normalization
const TRIBES = ['Xin-Xi', 'Imperius', 'Bardur', 'Oumaji', 'Kickoo', 'Hoodrick', 'Luxidoor', 'Vengir', 'Zebasi', 'Ai-Mo', 'Quetzali', 'Yadakk'];

// ============================================
// IMAGE LOADING SYSTEM
// ============================================

const imageCache = {};
let imagesLoaded = false;

// Terrain image paths
const TERRAIN_IMAGES = {
    'PLAIN':         '/img/terrain/plain.png',
    'SHALLOW_WATER': '/img/terrain/water.png',
    'DEEP_WATER':    '/img/terrain/deepwater.png',
    'MOUNTAIN':      '/img/terrain/mountain3.png',
    'VILLAGE':       '/img/terrain/village2.png',
    'CITY':          '/img/terrain/city3.png',
    'FOREST':        '/img/terrain/forest2.png',
};

// Unit types (must match game data)
const UNIT_TYPES = [
    'warrior', 'archer', 'rider', 'swordsman', 'catapult', 'knight',
    'defender', 'mind_bender', 'boat', 'ship', 'battleship', 'superunit'
];

// Number of tribes with unit images (only 0-3 have images for most units)
// Warrior has all 12, but others only have 4
const NUM_TRIBES_WITH_IMAGES = 4;

// Building image paths
const BUILDING_IMAGES = {
    'DOCK':         '/img/building/dock2.png',
    'MINE':         '/img/building/mine2.png',
    'FORGE':        '/img/building/forge2.png',
    'FARM':         '/img/building/farm2.png',
    'WINDMILL':     '/img/building/windmill2.png',
    'CUSTOM_HOUSE': '/img/building/custom_house2.png',
    'LUMBER_HUT':   '/img/building/lumber_hut2.png',
    'SAWMILL':      '/img/building/sawmill2.png',
    'TEMPLE':       '/img/building/temple2.png',
    'MONUMENT':     '/img/building/monument2.png',
};

// Resource image paths
const RESOURCE_IMAGES = {
    'FISH':   '/img/resource/fish2.png',
    'FRUIT':  '/img/resource/fruit2.png',
    'ANIMAL': '/img/resource/animal2.png',
    'WHALE':  '/img/resource/whale2.png',
    'ORE':    '/img/resource/ore2.png',
    'CROPS':  '/img/resource/crops2.png',
    'RUINS':  '/img/resource/ruins2.png',
};

/**
 * Generate unit image path for a specific unit type and tribe
 * @param {string} unitType - Unit type (e.g., 'warrior', 'archer')
 * @param {number} tribeId - Tribe ID (0-11)
 * @param {boolean} exhausted - Whether the unit is exhausted
 * @returns {string} Image path
 */
function getUnitImagePath(unitType, tribeId, exhausted = false) {
    const suffix = exhausted ? 'Exhausted' : '';
    return `/img/unit/${unitType}/${tribeId}${suffix}.png`;
}

/**
 * Get all image paths that need to be preloaded
 * @returns {string[]} Array of image paths
 */
function getAllImagePaths() {
    const paths = [];

    // Terrain images
    Object.values(TERRAIN_IMAGES).forEach(path => paths.push(path));

    // Building images
    Object.values(BUILDING_IMAGES).forEach(path => paths.push(path));

    // Resource images
    Object.values(RESOURCE_IMAGES).forEach(path => paths.push(path));

    // Unit images (all types × available tribes × normal/exhausted)
    // Most units only have images for tribes 0-3
    UNIT_TYPES.forEach(unitType => {
        for (let tribeId = 0; tribeId < NUM_TRIBES_WITH_IMAGES; tribeId++) {
            paths.push(getUnitImagePath(unitType, tribeId, false));
            paths.push(getUnitImagePath(unitType, tribeId, true));
        }
    });

    return paths;
}

/**
 * Show loading progress UI
 * @param {number} loaded - Number of images loaded
 * @param {number} total - Total number of images
 */
function showLoadingProgress(loaded, total) {
    let overlay = document.getElementById('loading-overlay');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-title">LOADING ASSETS</div>
                <div class="loading-bar-container">
                    <div class="loading-bar" id="loading-bar"></div>
                </div>
                <div class="loading-text" id="loading-text">0 / 0</div>
            </div>
        `;
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(10, 15, 25, 0.95);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        `;
        const contentStyle = `
            text-align: center;
            color: #00ff88;
            font-family: 'Courier New', monospace;
        `;
        const barContainerStyle = `
            width: 300px;
            height: 20px;
            background: #1a1a2e;
            border: 1px solid #00ff88;
            margin: 20px 0;
            overflow: hidden;
        `;
        const barStyle = `
            height: 100%;
            background: linear-gradient(90deg, #00ff88, #00cc6a);
            width: 0%;
            transition: width 0.1s ease-out;
        `;
        document.body.appendChild(overlay);
        
        overlay.querySelector('.loading-content').style.cssText = contentStyle;
        overlay.querySelector('.loading-bar-container').style.cssText = barContainerStyle;
        overlay.querySelector('.loading-bar').style.cssText = barStyle;
    }

    const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
    const bar = document.getElementById('loading-bar');
    const text = document.getElementById('loading-text');
    
    if (bar) bar.style.width = `${percent}%`;
    if (text) text.textContent = `${loaded} / ${total}`;
}

/**
 * Hide loading progress UI
 */
function hideLoadingProgress() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

/**
 * Preload all game images
 * @returns {Promise} Resolves when all images are loaded (or timeout)
 */
function preloadImages() {
    return new Promise((resolve, reject) => {
        const allPaths = getAllImagePaths();
        let loaded = 0;
        let failed = 0;
        const failedPaths = [];
        let resolved = false;

        const finish = () => {
            if (resolved) return;
            resolved = true;
            imagesLoaded = true;
            hideLoadingProgress();
            if (failedPaths.length > 0) {
                console.warn(`${failedPaths.length} images failed to load`);
            }
            resolve();
        };

        if (allPaths.length === 0) {
            finish();
            return;
        }

        // Timeout after 30 seconds
        const timeout = setTimeout(() => {
            if (!resolved) {
                console.warn('Image loading timed out');
                finish();
            }
        }, 30000);

        showLoadingProgress(0, allPaths.length);

        allPaths.forEach(path => {
            const img = new Image();
            
            img.onload = () => {
                imageCache[path] = img;
                loaded++;
                showLoadingProgress(loaded + failed, allPaths.length);
                
                if (loaded + failed === allPaths.length) {
                    clearTimeout(timeout);
                    finish();
                }
            };

            img.onerror = () => {
                failed++;
                failedPaths.push(path);
                showLoadingProgress(loaded + failed, allPaths.length);
                
                if (loaded + failed === allPaths.length) {
                    clearTimeout(timeout);
                    finish();
                }
            };

            img.src = path;
        });
    });
}

/**
 * Get a cached image by path
 * @param {string} path - Image path
 * @returns {HTMLImageElement|null} Cached image or null if not loaded
 */
function getImage(path) {
    return imageCache[path] || null;
}

/**
 * Get terrain image for a terrain type
 * @param {string} terrainType - Terrain type (e.g., 'PLAIN', 'MOUNTAIN')
 * @returns {HTMLImageElement|null} Cached image or null
 */
function getTerrainImage(terrainType) {
    const path = TERRAIN_IMAGES[terrainType];
    return path ? getImage(path) : null;
}

/**
 * Get building image for a building type
 * @param {string} buildingType - Building type (e.g., 'FARM', 'MINE')
 * @returns {HTMLImageElement|null} Cached image or null
 */
function getBuildingImage(buildingType) {
    const path = BUILDING_IMAGES[buildingType];
    return path ? getImage(path) : null;
}

/**
 * Get resource image for a resource type
 * @param {string} resourceType - Resource type (e.g., 'FISH', 'FRUIT')
 * @returns {HTMLImageElement|null} Cached image or null
 */
function getResourceImage(resourceType) {
    const path = RESOURCE_IMAGES[resourceType];
    return path ? getImage(path) : null;
}

/**
 * Get unit image for a specific unit type and tribe
 * @param {string} unitType - Unit type in game format (e.g., 'WARRIOR', 'ARCHER')
 * @param {number} tribeId - Tribe ID (0-11)
 * @param {boolean} exhausted - Whether the unit is exhausted
 * @returns {HTMLImageElement|null} Cached image or null
 */
function getUnitImage(unitType, tribeId, exhausted = false) {
    // Convert game unit type to image path format
    const unitTypeLower = unitType.toLowerCase().replace('mindbender', 'mind_bender');
    const path = getUnitImagePath(unitTypeLower, tribeId, exhausted);
    return getImage(path);
}

/**
 * Check if all images have been loaded
 * @returns {boolean} True if images are loaded
 */
function areImagesLoaded() {
    return imagesLoaded;
}

const TERRAIN_COLORS = {
    'PLAIN':        '#c8b96e',
    'MOUNTAIN':     '#8a8a8a',
    'FOREST':       '#2d6a2d',
    'DEEP_WATER':   '#1a6b8a',
    'SHALLOW_WATER':'#4da6c8',
    'VILLAGE':      '#d4a96e',
    'CITY':         '#c8a060',
    'FOG':          '#333333',
};

const UNIT_LABELS = {
    'WARRIOR':     'Wa', 'ARCHER':    'Ar', 'RIDER':     'Ri',
    'SWORDMAN':    'Sw', 'CATAPULT':  'Ca', 'KNIGHT':    'Kn',
    'DEFENDER':    'De', 'MINDBENDER':'Mb', 'BOAT':      'Bo',
    'SHIP':        'Sh', 'BATTLESHIP':'Bs', 'SUPERUNIT': 'Su',
};

const TRIBE_COLORS = ['#2ecc71', '#3498db', '#e74c3c', '#f39c12'];

let ws = null;
// currentState and currentActions are declared in state.js (loaded first)
let reconnectAttempts = 0;
const MAX_RECONNECT = 1;

// ============================================
// SETUP VIEW
// ============================================

function initSetup() {
    const container = document.getElementById('players-container');
    const addBtn = document.getElementById('add-player-btn');
    const startBtn = document.getElementById('start-game-btn');

    // Add initial 2 players
    addPlayerRow();
    addPlayerRow();
    updateAddButton();

    addBtn.addEventListener('click', () => {
        if (container.children.length < 4) {
            addPlayerRow();
            updateAddButton();
        }
    });

    startBtn.addEventListener('click', startGame);
}

function addPlayerRow() {
    const container = document.getElementById('players-container');
    const index = container.children.length;

    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
        <div class="player-number">#${index + 1}</div>
        <select class="select-input player-type">
            ${PLAYER_TYPES.map(type => `<option value="${type}" ${type === 'HUMAN' && index === 0 ? 'selected' : ''}>${type}</option>`).join('')}
        </select>
        <select class="select-input tribe-select">
            ${TRIBES.map((tribe, i) => `<option value="${tribe}" ${i === index ? 'selected' : ''}>${tribe}</option>`).join('')}
        </select>
        <button class="btn-remove" onclick="removePlayerRow(this)">×</button>
    `;

    container.appendChild(row);
}

function removePlayerRow(btn) {
    const container = document.getElementById('players-container');
    if (container.children.length > 2) {
        btn.closest('.player-row').remove();
        updatePlayerNumbers();
        updateAddButton();
    }
}

function updatePlayerNumbers() {
    const rows = document.querySelectorAll('.player-row');
    rows.forEach((row, i) => {
        row.querySelector('.player-number').textContent = `#${i + 1}`;
    });
}

function updateAddButton() {
    const container = document.getElementById('players-container');
    const addBtn = document.getElementById('add-player-btn');
    addBtn.style.display = container.children.length >= 4 ? 'none' : 'block';
}

async function startGame() {
    const rows = document.querySelectorAll('.player-row');
    const players = [];
    const tribes = [];

    rows.forEach(row => {
        players.push(row.querySelector('.player-type').value);
        tribes.push(row.querySelector('.tribe-select').value);
    });

    const mode = document.getElementById('game-mode').value;

    try {
        const response = await fetch('/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ players, tribes, mode, seed: -1 })
        });

        const data = await response.json();

        if (data.status === 'ok') {
            switchToGameView();
            connectWebSocket();
        } else {
            alert('Failed to start game: ' + (data.detail || 'Unknown error'));
        }
    } catch (error) {
        alert('Error starting game: ' + error.message);
    }
}

function switchToGameView() {
    document.getElementById('setup-view').classList.remove('active');
    document.getElementById('game-view').classList.add('active');
}

function switchToSetupView() {
    document.getElementById('game-view').classList.remove('active');
    document.getElementById('setup-view').classList.add('active');
    if (ws) {
        ws.close();
        ws = null;
    }
}

// ============================================
// WEBSOCKET
// ============================================

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
        const state = JSON.parse(event.data);
        currentState = state;
        renderGameState(state);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts++;
            setTimeout(connectWebSocket, 1000);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// ============================================
// GAME RENDERING
// ============================================

function renderGameState(state) {
    // Update status bar
    document.getElementById('turn-display').textContent = state.tick;
    document.getElementById('mode-display').textContent = state.game_mode;

    const activeTribe = state.tribes[state.active_tribe];
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.querySelector('.status-indicator');

    if (state.game_over) {
        statusText.textContent = 'ENGAGEMENT CONCLUDED';
        statusIndicator.style.background = '#e74c3c';
        showGameOver(state.winner || 'NONE');
    } else if (activeTribe.is_human) {
        statusText.textContent = 'YOUR TURN';
        statusIndicator.style.background = '#2ecc71';
        refreshActions().then(() => { updateTribeActionButtons(); });
    } else {
        statusText.textContent = 'AI PROCESSING...';
        statusIndicator.style.background = '#f39c12';
        currentActions = [];
    }

    // Render left panel (tribes list unless a tile is selected)
    if (!selectedTile) renderLeftPanel('tribes');
    updateTribeActionButtons();

    // Render board
    if (state.last_action) {
        const isAI = !state.tribes[state.active_tribe].is_human;
        appendActionLog(state.last_action, isAI);
    }
    if (state.leveling_up) refreshActions().then(showLevelUpDialog);
    renderBoard(state.board);
}



// NOTE: renderBoard, drawTile, drawTileLabel, drawUnit now live in canvas.js

// ============================================
// GAME OVER
// ============================================

function showGameOver(winner) {
    const overlay = document.getElementById('game-over-overlay');
    const winnerDisplay = document.getElementById('winner-display');

    winnerDisplay.textContent = winner === 'none' ? 'DRAW' : `${winner} VICTORIOUS`;
    overlay.classList.add('active');
}

document.getElementById('new-game-btn').addEventListener('click', async () => {
    try {
        await fetch('/game/stop', { method: 'POST' });
    } catch (error) {
        console.error('Error stopping game:', error);
    }

    document.getElementById('game-over-overlay').classList.remove('active');
    switchToSetupView();
});

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Preload images before showing setup
    try {
        await preloadImages();
        console.log('Images preloaded successfully');
    } catch (error) {
        console.error('Error preloading images:', error);
    }
    
    initSetup();
    initCanvasEvents();
    initGameControls();

    // Left panel close handler
    document.getElementById('left-panel-close').addEventListener('click', () => {
        clearSelection();
        renderLeftPanel('tribes');
        if (currentState) renderBoard(currentState.board);
    });
});
