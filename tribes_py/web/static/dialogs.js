// ============================================
// DIALOGS — showDialog helper and all dialog functions
// ============================================

/**
 * Show a modal dialog. `body` may be a string (used as textContent) or a DOM Element.
 * Buttons: [{label, className, onClick}]
 */
function showDialog(title, body, buttons) {
    const overlay = document.getElementById('modal-overlay');
    const box     = document.getElementById('modal-box');
    box.textContent = '';

    const titleEl = document.createElement('div');
    titleEl.className = 'modal-title';
    titleEl.textContent = title;

    const bodyEl = document.createElement('div');
    bodyEl.className = 'modal-body';
    if (typeof body === 'string') bodyEl.textContent = body;
    else bodyEl.appendChild(body);

    const btnsEl = document.createElement('div');
    btnsEl.className = 'modal-buttons';
    buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.className = `${b.className} modal-btn`;
        btn.textContent = b.label;
        btn.addEventListener('click', b.onClick);
        btnsEl.appendChild(btn);
    });

    box.appendChild(titleEl);
    box.appendChild(bodyEl);
    box.appendChild(btnsEl);
    overlay.style.display = 'flex';
}

function closeDialog() {
    document.getElementById('modal-overlay').style.display = 'none';
}

// ── Disband confirm ───────────────────────────────────────────────────────────

function confirmDisband(onConfirm) {
    showDialog(
        'CONFIRM DISBAND',
        'Disband this unit? This cannot be undone.',
        [
            { label: 'DISBAND', className: 'btn-danger',    onClick: () => { closeDialog(); onConfirm(); } },
            { label: 'CANCEL',  className: 'btn-secondary', onClick: closeDialog },
        ]
    );
}

// ── Send Stars ────────────────────────────────────────────────────────────────

function openSendStarsDialog() {
    if (!currentState) return;
    const sends = currentActions.filter(a => a.type === 'SEND_STARS');
    if (!sends.length) return;

    const sel = document.createElement('select');
    sel.className = 'select-input';

    const byTribe = new Map();
    sends.forEach(a => { if (!byTribe.has(a.target_tribe_id)) byTribe.set(a.target_tribe_id, a); });
    byTribe.forEach((a, tid) => {
        const opt = document.createElement('option');
        opt.value = a.id;
        const tribe = currentState.tribes[tid];
        opt.textContent = `${tribe ? tribe.name : tid} — ${a.stars != null ? a.stars : '?'} stars`;
        sel.appendChild(opt);
    });

    const label = document.createElement('label');
    label.textContent = 'Select recipient:';
    const bodyEl = document.createElement('div');
    bodyEl.appendChild(label);
    bodyEl.appendChild(sel);

    showDialog('SEND STARS', bodyEl, [
        { label: 'SEND',   className: 'btn-primary',   onClick: () => {
            const a = currentActions.find(x => x.id === parseInt(sel.value, 10));
            if (a) submitAction(a.id, a.description);
            closeDialog();
        }},
        { label: 'CANCEL', className: 'btn-secondary', onClick: closeDialog },
    ]);
}

// ── Declare War ───────────────────────────────────────────────────────────────

function openDeclareWarDialog() {
    if (!currentState) return;
    const wars = currentActions.filter(a => a.type === 'DECLARE_WAR');
    if (!wars.length) return;

    const sel = document.createElement('select');
    sel.className = 'select-input';
    wars.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        const tribe = currentState.tribes[a.target_tribe_id];
        opt.textContent = tribe ? tribe.name : a.target_tribe_id;
        sel.appendChild(opt);
    });

    const label = document.createElement('label');
    label.textContent = 'Declare war on:';
    const bodyEl = document.createElement('div');
    bodyEl.appendChild(label);
    bodyEl.appendChild(sel);

    showDialog('DECLARE WAR', bodyEl, [
        { label: 'DECLARE WAR', className: 'btn-danger',    onClick: () => {
            const a = currentActions.find(x => x.id === parseInt(sel.value, 10));
            if (a) submitAction(a.id, a.description);
            closeDialog();
        }},
        { label: 'CANCEL',      className: 'btn-secondary', onClick: closeDialog },
    ]);
}

// ── City level-up ─────────────────────────────────────────────────────────────

function showLevelUpDialog() {
    const levelUps = currentActions.filter(a => a.type === 'LEVEL_UP');
    if (!levelUps.length) return;
    const bodyEl = document.createElement('div');
    bodyEl.textContent = 'Choose a city upgrade:';
    showDialog('CITY LEVEL UP!', bodyEl,
        levelUps.map(a => ({
            label: a.description,
            className: 'btn-primary',
            onClick: () => { submitAction(a.id, a.description); closeDialog(); },
        }))
    );
}

// ── Quit confirm ──────────────────────────────────────────────────────────────

function confirmQuit() {
    showDialog('END GAME', 'End this game and return to setup?', [
        { label: 'END GAME', className: 'btn-danger', onClick: async () => {
            closeDialog();
            try {
                await fetch('/game/stop', { method: 'POST' });
            } catch (err) {
                console.error('Failed to stop game:', err);
            }
            document.getElementById('game-over-overlay').classList.remove('active');
            switchToSetupView();
        }},
        { label: 'CANCEL', className: 'btn-secondary', onClick: closeDialog },
    ]);
}

// ── Game controls wiring ──────────────────────────────────────────────────────

function initGameControls() {
    let paused = false;
    const btnPause = document.getElementById('btn-pause');

    btnPause.addEventListener('click', async () => {
        if (paused) {
            await fetch('/game/resume', { method: 'POST' });
            btnPause.textContent = '\u23F8';
            paused = false;
        } else {
            await fetch('/game/pause', { method: 'POST' });
            btnPause.textContent = '\u25B6';
            paused = true;
        }
    });

    document.getElementById('btn-play-turn').addEventListener('click', () => {
        paused = false; btnPause.textContent = '\u23F8';
        fetch('/game/play-turn', { method: 'POST' });
    });

    document.getElementById('btn-play-tick').addEventListener('click', () => {
        paused = false; btnPause.textContent = '\u23F8';
        fetch('/game/play-tick', { method: 'POST' });
    });

    document.getElementById('btn-quit').addEventListener('click', confirmQuit);
}
