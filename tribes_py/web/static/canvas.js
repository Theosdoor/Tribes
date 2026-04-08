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

function renderBoard(board) {
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
        requestAnimationFrame(() => { if (currentState) renderBoard(currentState.board); });
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
            if (currentState) renderBoard(currentState.board);
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
        if (currentState) renderBoard(currentState.board);
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
        if (a.type === 'DISBAND') confirmDisband(() => submitAction(a.id, a.description));
        else submitAction(a.id, a.description);
        return;
    }
    selectTile(tx, ty);
}

function selectTile(x, y) {
    selectedTile = { x, y };
    buildActionMap(x, y);
    renderLeftPanel('tile', { x, y, tile: currentState.board[y][x] });
    renderBoard(currentState.board);
}

// ── Animations ────────────────────────────────────────────────────────────────

function flashTile(x, y, actionType) {
    pendingAnimation = {
        x, y,
        color: HIGHLIGHT_COLORS[actionType] || HIGHLIGHT_COLORS.DEFAULT,
        expiresAt: Date.now() + 400,
    };
}
