// ============================================
// TRIBES - Tactical Command Interface
// ============================================

const PLAYER_TYPES = ['HUMAN', 'RANDOM', 'MCTS', 'RHEA', 'OSLA', 'MC', 'OEP', 'EMCTS', 'PORTFOLIO_MCTS'];
const TRIBES = ['Xin Xi', 'Imperius', 'Bardur', 'Oumaji', 'Zebasi', 'Hoodrick', 'Luxidoor', 'Vengir', 'Elyrion', 'Polaris', 'Kickoo'];

const TERRAIN_COLORS = {
    'PLAIN': '#c8b96e',
    'MOUNTAIN': '#8a8a8a',
    'FOREST': '#2d6a2d',
    'OCEAN': '#1a6b8a',
    'SHALLOW_WATER': '#4da6c8'
};

const TRIBE_COLORS = ['#2ecc71', '#3498db', '#e74c3c', '#f39c12'];

let ws = null;
let currentState = null;
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
        fetchActions();
    } else {
        statusText.textContent = 'AI PROCESSING...';
        statusIndicator.style.background = '#f39c12';
        clearActions();
    }

    // Render tribes
    renderTribes(state.tribes, state.active_tribe);

    // Render board
    renderBoard(state.board, state.tribes);
}

function renderTribes(tribes, activeIdx) {
    const container = document.getElementById('tribes-list');
    container.innerHTML = '';

    tribes.forEach((tribe, idx) => {
        const card = document.createElement('div');
        card.className = `tribe-card ${idx === activeIdx ? 'active' : ''}`;
        card.style.borderLeftColor = TRIBE_COLORS[idx];

        card.innerHTML = `
            <div class="tribe-name">${tribe.name}</div>
            <div class="tribe-stats">
                <div class="tribe-stat">
                    ⭐ <span class="tribe-stat-value">${tribe.stars}</span>
                </div>
                <div class="tribe-stat">
                    🏙 <span class="tribe-stat-value">${tribe.num_cities}</span>
                </div>
                <div class="tribe-stat">
                    🔬 <span class="tribe-stat-value">${tribe.num_techs}</span>
                </div>
                <div class="tribe-stat">
                    📊 <span class="tribe-stat-value">${tribe.score}</span>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

function renderBoard(board, tribes) {
    const canvas = document.getElementById('game-board');
    const ctx = canvas.getContext('2d');

    const size = board.length;
    const tileSize = 48;
    canvas.width = size * tileSize;
    canvas.height = size * tileSize;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const tile = board[y][x];

            // Terrain background
            ctx.fillStyle = TERRAIN_COLORS[tile.terrain] || TERRAIN_COLORS['PLAIN'];
            ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);

            // Grid lines
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);

            // Resource/Building
            if (tile.resource) {
                drawLabel(ctx, x, y, tile.resource, tileSize, '#ffffff', 10);
            } else if (tile.building) {
                drawLabel(ctx, x, y, tile.building.substring(0, 3), tileSize, '#000000', 10);
            }

            // City overlay
            if (tile.city_id >= 0) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
            }

            // Unit
            if (tile.unit) {
                drawUnit(ctx, x, y, tile.unit, tileSize);
            }
        }
    }
}

function drawLabel(ctx, x, y, text, tileSize, color, fontSize) {
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x * tileSize + tileSize / 2, y * tileSize + 2);
}

function drawUnit(ctx, x, y, unit, tileSize) {
    const centerX = x * tileSize + tileSize / 2;
    const centerY = y * tileSize + tileSize / 2;
    const radius = 14;

    // Unit circle
    ctx.fillStyle = TRIBE_COLORS[unit.tribe_id];
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // HP bar
    const barWidth = 30;
    const barHeight = 4;
    const hpRatio = unit.hp / unit.max_hp;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(centerX - barWidth / 2, y * tileSize + tileSize - 10, barWidth, barHeight);

    ctx.fillStyle = hpRatio > 0.5 ? '#2ecc71' : hpRatio > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(centerX - barWidth / 2, y * tileSize + tileSize - 10, barWidth * hpRatio, barHeight);
}

// ============================================
// ACTIONS
// ============================================

async function fetchActions() {
    try {
        const response = await fetch('/game/actions');
        const data = await response.json();

        if (data.actions) {
            displayActions(data.actions);
        }
    } catch (error) {
        console.error('Error fetching actions:', error);
    }
}

function displayActions(actions) {
    const container = document.getElementById('actions-container');
    container.innerHTML = '';

    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.textContent = action.description;
        btn.onclick = () => submitAction(action.id);
        container.appendChild(btn);
    });
}

function clearActions() {
    const container = document.getElementById('actions-container');
    container.innerHTML = '<div class="no-actions">AWAITING AI MOVE</div>';
}

async function submitAction(actionId) {
    // Disable all buttons
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.disabled = true;
    });

    try {
        await fetch('/game/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action_id: actionId })
        });
    } catch (error) {
        console.error('Error submitting action:', error);
    }
}

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

document.addEventListener('DOMContentLoaded', initSetup);
