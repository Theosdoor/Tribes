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
                    submitAction(a.id, a.description);
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
            `ATK: ${u.atk != null ? u.atk : '?'}  DEF: ${u.def != null ? u.def : '?'}`,
            `MOV: ${u.mov != null ? u.mov : '?'}  RNG: ${u.range != null ? u.range : '?'}`,
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
    if (currentState) renderBoard(currentState.board);
}

// ── Action log ────────────────────────────────────────────────────────────────

function appendActionLog(description, tribeIdx) {
    const list = document.getElementById('action-log');
    if (!list) return;
    const tick = currentState ? currentState.tick : '?';
    const li   = document.createElement('li');
    li.className  = 'action-log-item';
    li.textContent = `[T${tick}] ${description}`;
    li.style.borderLeftColor = TRIBE_COLORS[tribeIdx] || '#aaaaaa';
    list.insertBefore(li, list.firstChild);
    while (list.children.length > ACTION_LOG_MAX) list.removeChild(list.lastChild);
}

function clearActionLog() {
    const list = document.getElementById('action-log');
    if (!list) return;
    list.textContent = '';
}
