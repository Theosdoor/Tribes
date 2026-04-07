// ============================================
// TECH TREE — static data (from Types.java) and modal
// ============================================

// TECH_BASE_COST = 4; approximate cost = 4 + tier * numCities
// PHILOSOPHY gives 20% discount (TribesConfig.TECH_DISCOUNT_VALUE = 0.2)

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
    CLIMBING:     ['Action: CLIMB_MOUNTAIN'],
    FISHING:      ['Gather: FISH'],
    HUNTING:      ['Gather: ANIMAL'],
    ORGANIZATION: ['Gather: FRUIT'],
    RIDING:       ['Spawn: RIDER'],
    ARCHERY:      ['Spawn: ARCHER'],
    FARMING:      ['Build: FARM', 'Gather: CROPS'],
    FORESTRY:     ['Build: LUMBER_HUT', 'Action: CLEAR_FOREST'],
    FREE_SPIRIT:  ['Build: TEMPLE', 'Action: DISBAND'],
    MEDITATION:   ['Build: MOUNTAIN_TEMPLE', 'Monument: ALTAR_OF_PEACE'],
    MINING:       ['Build: MINE', 'Gather: ORE'],
    ROADS:        ['Action: BUILD_ROAD', 'Monument: GRAND_BAZAR'],
    SAILING:      ['Build: PORT', 'Spawn: BOAT, SHIP', 'Action: UPGRADE_BOAT'],
    SHIELDS:      ['Spawn: DEFENDER'],
    WHALING:      ['Gather: WHALES'],
    AQUATISM:     ['Build: WATER_TEMPLE'],
    CHIVALRY:     ['Spawn: KNIGHT', 'Action: BURN_FOREST'],
    CONSTRUCTION: ['Build: WINDMILL', 'Action: DESTROY'],
    MATHEMATICS:  ['Build: SAWMILL', 'Spawn: CATAPULT'],
    NAVIGATION:   ['Spawn: BATTLESHIP', 'Action: UPGRADE_SHIP', 'Monument: EYE_OF_GOD'],
    SMITHERY:     ['Build: FORGE', 'Spawn: SWORDMAN'],
    SPIRITUALISM: ['Build: FOREST_TEMPLE', 'Action: GROW_FOREST'],
    TRADE:        ['Build: CUSTOMS_HOUSE', 'Monument: EMPERORS_TOMB'],
    PHILOSOPHY:   ['Spawn: MIND_BENDER', 'Monument: TOWER_OF_WISDOM', '20% discount on future techs'],
};

/**
 * Returns Map<techName, 'researched'|'affordable'|'unlocked'|'locked'>
 * 'affordable' = has a RESEARCH_TECH action in currentActions (backend confirms prereq + stars)
 */
function computeTechStatuses() {
    if (!currentState) return new Map();
    const tribe       = currentState.tribes[currentState.active_tribe];
    const researched  = new Set(tribe.techs || []);
    const researchable = new Set(
        currentActions.filter(a => a.type === 'RESEARCH_TECH').map(a => a.tech)
    );
    return new Map(Object.keys(TECH_TREE).map(name => {
        const node = TECH_TREE[name];
        let status;
        if      (researched.has(name))    status = 'researched';
        else if (researchable.has(name))  status = 'affordable';
        else if (!node.parent || researched.has(node.parent)) status = 'unlocked';
        else    status = 'locked';
        return [name, status];
    }));
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openTechModal() {
    const statuses = computeTechStatuses();
    const tribe    = currentState ? currentState.tribes[currentState.active_tribe] : null;
    const numCities = tribe ? tribe.num_cities : 0;

    const layout = document.createElement('div');
    layout.className = 'tech-modal-layout';

    [1, 2, 3].forEach(tier => {
        const col = document.createElement('div');
        col.className = 'tech-tier-col';
        const lbl = document.createElement('div');
        lbl.className = 'tech-tier-label';
        lbl.textContent = `TIER ${tier}`;
        col.appendChild(lbl);

        Object.entries(TECH_TREE)
            .filter(([, n]) => n.tier === tier)
            .forEach(([name]) => {
                const status = statuses.get(name) || 'locked';
                const node = document.createElement('div');
                node.className = `tech-node tech-${status}`;
                node.dataset.tech = name;
                node.textContent = name.replace(/_/g, ' ');
                node.addEventListener('click', () => renderTechDetail(name, statuses, numCities));
                col.appendChild(node);
            });
        layout.appendChild(col);
    });

    const detail = document.createElement('div');
    detail.id = 'tech-detail';
    detail.className = 'tech-detail';

    const bodyEl = document.createElement('div');
    bodyEl.appendChild(layout);
    bodyEl.appendChild(detail);

    showDialog('TECHNOLOGY TREE', bodyEl, [
        { label: 'CLOSE', className: 'btn-secondary', onClick: closeDialog },
    ]);
}

function renderTechDetail(techName, statuses, numCities) {
    const detail = document.getElementById('tech-detail');
    if (!detail) return;
    detail.textContent = '';

    const status  = statuses.get(techName) || 'locked';
    const unlocks = TECH_UNLOCKS[techName] || [];
    const rawCost = 4 + TECH_TREE[techName].tier * numCities;
    const tribe = currentState ? currentState.tribes[currentState.active_tribe] : null;
    const hasPhilosophy = tribe && (tribe.techs || []).includes('PHILOSOPHY');
    const cost = hasPhilosophy ? Math.floor(rawCost * 0.2) : rawCost;

    const nameEl = document.createElement('div');
    nameEl.className = 'tech-detail-name';
    nameEl.textContent = techName.replace(/_/g, ' ');

    const costEl = document.createElement('div');
    costEl.className = 'tech-detail-cost';
    costEl.textContent = `~${cost} stars`;

    const ul = document.createElement('ul');
    ul.className = 'tech-detail-unlocks';
    unlocks.forEach(u => { const li = document.createElement('li'); li.textContent = u; ul.appendChild(li); });

    detail.appendChild(nameEl);
    detail.appendChild(costEl);
    detail.appendChild(ul);

    if (status === 'affordable') {
        const btn = document.createElement('button');
        btn.className = 'btn-primary';
        btn.textContent = 'RESEARCH';
        btn.addEventListener('click', () => {
            const a = currentActions.find(x => x.type === 'RESEARCH_TECH' && x.tech === techName);
            if (a) { submitAction(a.id, a.description); closeDialog(); }
        });
        detail.appendChild(btn);
    } else {
        const lbl = document.createElement('div');
        lbl.className = `tech-status-label tech-${status}`;
        lbl.textContent = status.toUpperCase();
        detail.appendChild(lbl);
    }
}
