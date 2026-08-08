let gameState = {
    boardSize: 10,
    fleet: [],
    shots: {},        // { "row,col": "hit" | "miss" }
    sunkShips: [],    // [{ size, cells: ["r,c", ...] }]
    selecting: false,
    selectedCells: [],
    heatmapVisible: false
};

let allConfigs = [];  // full list from server
let activeConfig = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
    allConfigs = await fetchConfigs();
    const saved = localStorage.getItem('battleshipState');
    const savedConfigName = saved ? JSON.parse(saved).configName : null;

    activeConfig = allConfigs.find(c => c.name === savedConfigName) || allConfigs[0];

    populateDropdown();
    applyConfig(activeConfig, /* restoreState= */ true);
    setupEventListeners();
}

async function fetchConfigs() {
    const res = await fetch('/api/configs');
    return res.json();
}

function populateDropdown() {
    const sel = document.getElementById('configSelect');
    sel.innerHTML = '';
    for (const c of allConfigs) {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        if (c.name === activeConfig.name) opt.selected = true;
        sel.appendChild(opt);
    }
}

// Apply a config, optionally restoring saved game state for that config.
function applyConfig(cfg, restoreState = false) {
    activeConfig = cfg;
    gameState.boardSize = cfg.boardSize;
    gameState.fleet = cfg.fleet;
    gameState.shots = {};
    gameState.sunkShips = [];
    gameState.selecting = false;
    gameState.selectedCells = [];

    if (restoreState) {
        const saved = localStorage.getItem('battleshipState');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.configName === cfg.name) {
                gameState.shots = parsed.shots || {};
                gameState.sunkShips = parsed.sunkShips || [];
                gameState.heatmapVisible = parsed.heatmapVisible || false;
            }
        }
    }

    exitSelectingMode();
    renderGrid();
    renderFleetInfo();
    updateStats();
    renderHeatmap();
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function setupEventListeners() {
    document.getElementById('configSelect').addEventListener('change', e => {
        const cfg = allConfigs.find(c => c.name === e.target.value);
        if (cfg) { activeConfig = cfg; resetGame(/* skipConfirm= */ true); }
    });
    document.getElementById('editConfigsBtn').addEventListener('click', openConfigEditor);
    document.getElementById('toggleHeatmapBtn').addEventListener('click', toggleHeatmap);
    document.getElementById('markSunkBtn').addEventListener('click', enterSelectingMode);
    document.getElementById('confirmSunkBtn').addEventListener('click', confirmSunk);
    document.getElementById('cancelSunkBtn').addEventListener('click', exitSelectingMode);
    document.getElementById('resetBtn').addEventListener('click', () => resetGame());

    document.getElementById('gameGrid').addEventListener('click', e => {
        if (!e.target.classList.contains('grid-cell')) return;
        const [row, col] = e.target.dataset.pos.split(',').map(Number);
        if (gameState.selecting) {
            toggleSelectCell(row, col);
        } else {
            toggleShot(row, col);
        }
    });
}

// ---------------------------------------------------------------------------
// Grid rendering
// ---------------------------------------------------------------------------

function renderGrid() {
    const grid = document.getElementById('gameGrid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${gameState.boardSize}, 1fr)`;
    grid.classList.toggle('selecting', gameState.selecting);

    const sunkCellSet = new Set(gameState.sunkShips.flatMap(s => s.cells));
    const selectedSet = new Set(gameState.selectedCells);

    for (let row = 0; row < gameState.boardSize; row++) {
        for (let col = 0; col < gameState.boardSize; col++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.pos = `${row},${col}`;

            const key = `${row},${col}`;
            if (sunkCellSet.has(key)) {
                cell.classList.add('sunk');
                cell.textContent = '✕';
            } else if (selectedSet.has(key)) {
                cell.classList.add('hit-selected');
                cell.textContent = '●';
            } else if (gameState.shots[key] === 'hit') {
                cell.classList.add('hit');
                cell.textContent = '●';
            } else if (gameState.shots[key] === 'miss') {
                cell.classList.add('miss');
                cell.textContent = '○';
            } else {
                cell.classList.add('unknown');
            }

            grid.appendChild(cell);
        }
    }
}

// ---------------------------------------------------------------------------
// Shot toggling
// ---------------------------------------------------------------------------

function toggleShot(row, col) {
    const key = `${row},${col}`;
    const current = gameState.shots[key];
    if (current === 'miss') {
        gameState.shots[key] = 'hit';
    } else if (current === 'hit') {
        delete gameState.shots[key];
    } else {
        gameState.shots[key] = 'miss';
    }
    saveGameState();
    renderGrid();
    updateStats();
    renderHeatmap();
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function updateStats() {
    const shots = Object.values(gameState.shots);
    document.getElementById('shotCount').textContent = shots.length;
    document.getElementById('hitCount').textContent = shots.filter(s => s === 'hit').length;
    document.getElementById('missCount').textContent = shots.filter(s => s === 'miss').length;
}

// ---------------------------------------------------------------------------
// Fleet info panel
// ---------------------------------------------------------------------------

function renderFleetInfo() {
    const fleetList = document.getElementById('fleetList');
    fleetList.innerHTML = '';

    const sunkCounts = {};
    for (const ship of gameState.sunkShips) {
        sunkCounts[ship.size] = (sunkCounts[ship.size] || 0) + 1;
    }

    gameState.fleet.forEach(ship => {
        const sunk = sunkCounts[ship.size] || 0;
        const remaining = ship.count - sunk;
        const li = document.createElement('li');
        if (remaining <= 0) {
            li.style.textDecoration = 'line-through';
            li.style.color = '#bbb';
        }
        li.textContent = `${remaining}/${ship.count} ${ship.name} (${ship.size} sq)`;
        fleetList.appendChild(li);
    });
}

// ---------------------------------------------------------------------------
// Heat map
// ---------------------------------------------------------------------------

function toggleHeatmap() {
    gameState.heatmapVisible = !gameState.heatmapVisible;
    const canvas = document.getElementById('heatmapCanvas');
    canvas.style.display = gameState.heatmapVisible ? 'block' : 'none';
    document.getElementById('toggleHeatmapBtn').textContent =
        gameState.heatmapVisible ? 'Hide Heat Map' : 'Show Heat Map';
    renderHeatmap();
}

function renderHeatmap() {
    if (!gameState.heatmapVisible) return;

    const canvas = document.getElementById('heatmapCanvas');
    const cellSize = 44;
    canvas.width = gameState.boardSize * cellSize;
    canvas.height = gameState.boardSize * cellSize;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const heatmap = calculateHeatmap();
    for (let row = 0; row < gameState.boardSize; row++) {
        for (let col = 0; col < gameState.boardSize; col++) {
            ctx.fillStyle = getHeatColor(heatmap[row][col]);
            ctx.fillRect(col * cellSize + 2, row * cellSize + 2, 40, 40);
        }
    }
}

function getHeatColor(probability) {
    if (probability === 0) return 'rgba(0, 0, 0, 0)';
    const hue = (1 - probability) * 240;
    return `hsl(${hue}, 100%, ${50 - probability * 20}%)`;
}

function calculateHeatmap() {
    const size = gameState.boardSize;
    const counts = Array(size).fill(null).map(() => Array(size).fill(0));

    const missSet = new Set();
    const hitSet = new Set();
    for (const [k, v] of Object.entries(gameState.shots)) {
        if (v === 'miss') missSet.add(k);
        else if (v === 'hit') hitSet.add(k);
    }

    const sunkCellSet = new Set(gameState.sunkShips.flatMap(s => s.cells));
    const liveHitSet = new Set([...hitSet].filter(k => !sunkCellSet.has(k)));

    const sunkCounts = {};
    for (const ship of gameState.sunkShips) {
        sunkCounts[ship.size] = (sunkCounts[ship.size] || 0) + 1;
    }

    const BASE_WEIGHT = 1;
    const HIT_WEIGHT = 12;

    for (const ship of gameState.fleet) {
        const remaining = ship.count - (sunkCounts[ship.size] || 0);
        if (remaining <= 0) continue;

        // Horizontal
        for (let row = 0; row < size; row++) {
            for (let sc = 0; sc <= size - ship.size; sc++) {
                const ec = sc + ship.size - 1;
                let valid = true, hitCov = 0;
                for (let c = sc; c <= ec; c++) {
                    const k = `${row},${c}`;
                    if (missSet.has(k) || sunkCellSet.has(k)) { valid = false; break; }
                    if (liveHitSet.has(k)) hitCov++;
                }
                if (valid) {
                    for (let c = sc; c <= ec && valid; c++) {
                        if (liveHitSet.has(`${row-1},${c}`) || liveHitSet.has(`${row+1},${c}`)) valid = false;
                    }
                    if (liveHitSet.has(`${row},${sc-1}`) || liveHitSet.has(`${row},${ec+1}`)) valid = false;
                }
                if (valid) {
                    const w = (hitCov > 0 ? HIT_WEIGHT : BASE_WEIGHT) * remaining;
                    for (let c = sc; c <= ec; c++) counts[row][c] += w;
                }
            }
        }

        // Vertical
        for (let sr = 0; sr <= size - ship.size; sr++) {
            for (let col = 0; col < size; col++) {
                const er = sr + ship.size - 1;
                let valid = true, hitCov = 0;
                for (let r = sr; r <= er; r++) {
                    const k = `${r},${col}`;
                    if (missSet.has(k) || sunkCellSet.has(k)) { valid = false; break; }
                    if (liveHitSet.has(k)) hitCov++;
                }
                if (valid) {
                    for (let r = sr; r <= er && valid; r++) {
                        if (liveHitSet.has(`${r},${col-1}`) || liveHitSet.has(`${r},${col+1}`)) valid = false;
                    }
                    if (liveHitSet.has(`${sr-1},${col}`) || liveHitSet.has(`${er+1},${col}`)) valid = false;
                }
                if (valid) {
                    const w = (hitCov > 0 ? HIT_WEIGHT : BASE_WEIGHT) * remaining;
                    for (let r = sr; r <= er; r++) counts[r][col] += w;
                }
            }
        }
    }

    for (const k of Object.keys(gameState.shots)) {
        const [r, c] = k.split(',').map(Number);
        counts[r][c] = 0;
    }
    for (const k of sunkCellSet) {
        const [r, c] = k.split(',').map(Number);
        counts[r][c] = 0;
    }

    let max = 0;
    for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
            if (counts[r][c] > max) max = counts[r][c];

    if (max === 0) return counts;
    return counts.map(row => row.map(v => v / max));
}

// ---------------------------------------------------------------------------
// Sunk ship selection
// ---------------------------------------------------------------------------

function enterSelectingMode() {
    const clusters = findAllLiveHitClusters();
    if (clusters.length === 0) return;

    if (clusters.length === 1 && isLinear(clusters[0]) && matchesRemainingShip(clusters[0].length)) {
        gameState.sunkShips.push({ size: clusters[0].length, cells: clusters[0] });
        saveGameState();
        renderGrid();
        renderFleetInfo();
        renderHeatmap();
        return;
    }

    gameState.selecting = true;
    gameState.selectedCells = [];
    document.getElementById('markSunkBtn').style.display = 'none';
    document.getElementById('confirmSunkBtn').style.display = 'inline-block';
    document.getElementById('confirmSunkBtn').disabled = true;
    document.getElementById('cancelSunkBtn').style.display = 'inline-block';
    renderGrid();
}

function exitSelectingMode() {
    gameState.selecting = false;
    gameState.selectedCells = [];
    document.getElementById('markSunkBtn').style.display = 'inline-block';
    document.getElementById('confirmSunkBtn').style.display = 'none';
    document.getElementById('cancelSunkBtn').style.display = 'none';
    renderGrid();
}

function toggleSelectCell(row, col) {
    const key = `${row},${col}`;
    const sunkCellSet = new Set(gameState.sunkShips.flatMap(s => s.cells));
    if (gameState.shots[key] !== 'hit' || sunkCellSet.has(key)) return;

    const idx = gameState.selectedCells.indexOf(key);
    if (idx >= 0) {
        gameState.selectedCells.splice(idx, 1);
    } else {
        gameState.selectedCells = getConnectedHits(key);
    }

    document.getElementById('confirmSunkBtn').disabled =
        !matchesRemainingShip(gameState.selectedCells.length);
    renderGrid();
}

function getConnectedHits(startKey) {
    const sunkCellSet = new Set(gameState.sunkShips.flatMap(s => s.cells));
    const visited = new Set();
    const queue = [startKey];
    while (queue.length > 0) {
        const key = queue.shift();
        if (visited.has(key) || gameState.shots[key] !== 'hit' || sunkCellSet.has(key)) continue;
        visited.add(key);
        const [r, c] = key.split(',').map(Number);
        queue.push(`${r-1},${c}`, `${r+1},${c}`, `${r},${c-1}`, `${r},${c+1}`);
    }
    return [...visited];
}

function findAllLiveHitClusters() {
    const sunkCellSet = new Set(gameState.sunkShips.flatMap(s => s.cells));
    const remaining = new Set(
        Object.entries(gameState.shots)
            .filter(([k, v]) => v === 'hit' && !sunkCellSet.has(k))
            .map(([k]) => k)
    );
    const clusters = [];
    for (const key of [...remaining]) {
        if (!remaining.has(key)) continue;
        const cluster = getConnectedHits(key);
        clusters.push(cluster);
        for (const k of cluster) remaining.delete(k);
    }
    return clusters;
}

function isLinear(cells) {
    if (cells.length <= 1) return true;
    const rows = new Set(cells.map(k => k.split(',')[0]));
    const cols = new Set(cells.map(k => k.split(',')[1]));
    return rows.size === 1 || cols.size === 1;
}

function matchesRemainingShip(count) {
    const sunkCounts = {};
    for (const ship of gameState.sunkShips) {
        sunkCounts[ship.size] = (sunkCounts[ship.size] || 0) + 1;
    }
    return gameState.fleet.some(ship => {
        const remaining = ship.count - (sunkCounts[ship.size] || 0);
        return remaining > 0 && ship.size === count;
    });
}

function confirmSunk() {
    if (gameState.selectedCells.length === 0) return;
    gameState.sunkShips.push({ size: gameState.selectedCells.length, cells: [...gameState.selectedCells] });
    saveGameState();
    exitSelectingMode();
    renderFleetInfo();
    renderHeatmap();
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

function resetGame(skipConfirm = false) {
    if (!skipConfirm && !confirm('Reset the game? This will clear all shots and sunk ships.')) return;
    gameState.shots = {};
    gameState.sunkShips = [];
    gameState.selecting = false;
    gameState.selectedCells = [];
    exitSelectingMode();
    saveGameState();
    renderGrid();
    renderFleetInfo();
    updateStats();
    renderHeatmap();
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function saveGameState() {
    localStorage.setItem('battleshipState', JSON.stringify({
        configName: activeConfig ? activeConfig.name : null,
        shots: gameState.shots,
        sunkShips: gameState.sunkShips,
        heatmapVisible: gameState.heatmapVisible
    }));
}

// ---------------------------------------------------------------------------
// Config editor modal
// ---------------------------------------------------------------------------

function openConfigEditor() {
    renderConfigList();
    clearForm();
    document.getElementById('configModal').style.display = 'flex';
}

function closeConfigEditor() {
    document.getElementById('configModal').style.display = 'none';
}

function renderConfigList() {
    const ul = document.getElementById('configList');
    ul.innerHTML = '';
    for (const cfg of allConfigs) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${cfg.name}</span>
            <span class="config-actions">
                <button class="btn btn-secondary btn-sm" onclick="editConfig('${cfg.name.replace(/'/g, "\\'")}')">Edit</button>
                <button class="btn btn-secondary btn-sm" onclick="deleteConfig('${cfg.name.replace(/'/g, "\\'")}')">Delete</button>
            </span>`;
        ul.appendChild(li);
    }
}

function editConfig(name) {
    const cfg = allConfigs.find(c => c.name === name);
    if (!cfg) return;
    document.getElementById('formTitle').textContent = 'Edit Config';
    document.getElementById('editingName').value = name;
    document.getElementById('cfgName').value = cfg.name;
    document.getElementById('cfgBoardSize').value = cfg.boardSize;

    const shipRows = document.getElementById('shipRows');
    shipRows.innerHTML = '';
    for (const ship of cfg.fleet) addShipRow(ship);
}

function clearForm() {
    document.getElementById('formTitle').textContent = 'Add Config';
    document.getElementById('editingName').value = '';
    document.getElementById('cfgName').value = '';
    document.getElementById('cfgBoardSize').value = '10';
    document.getElementById('shipRows').innerHTML = '';
    document.getElementById('formError').textContent = '';
    addShipRow();
}

function cancelEdit() {
    clearForm();
}

function addShipRow(ship = null) {
    const row = document.createElement('div');
    row.className = 'ship-row';
    row.innerHTML = `
        <input type="text"   placeholder="Name"  value="${ship ? ship.name : ''}">
        <input type="number" placeholder="Size"  value="${ship ? ship.size : ''}" min="1" max="20">
        <input type="number" placeholder="Count" value="${ship ? ship.count : ''}" min="1" max="10">
        <button class="remove-ship" onclick="this.parentElement.remove()">✕</button>`;
    document.getElementById('shipRows').appendChild(row);
}

async function saveConfig() {
    const errEl = document.getElementById('formError');
    errEl.textContent = '';

    const name = document.getElementById('cfgName').value.trim();
    const boardSize = parseInt(document.getElementById('cfgBoardSize').value);
    const originalName = document.getElementById('editingName').value;

    if (!name) { errEl.textContent = 'Name is required.'; return; }
    if (isNaN(boardSize) || boardSize < 5 || boardSize > 20) {
        errEl.textContent = 'Board size must be between 5 and 20.'; return;
    }

    const rows = document.getElementById('shipRows').querySelectorAll('.ship-row');
    const fleet = [];
    for (const row of rows) {
        const inputs = row.querySelectorAll('input[type="text"], input[type="number"]');
        const shipName = inputs[0].value.trim();
        const size = parseInt(inputs[1].value);
        const count = parseInt(inputs[2].value);
        if (!shipName || isNaN(size) || size < 1 || isNaN(count) || count < 1) {
            errEl.textContent = 'Each ship needs a name, size ≥ 1, and count ≥ 1.'; return;
        }
        fleet.push({ name: shipName, size, count });
    }
    if (fleet.length === 0) { errEl.textContent = 'Add at least one ship.'; return; }

    // If name changed, delete the old entry first
    if (originalName && originalName !== name) {
        await fetch(`/api/configs/${encodeURIComponent(originalName)}`, { method: 'DELETE' });
    }

    const cfg = { name, boardSize, fleet };
    await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
    });

    allConfigs = await fetchConfigs();
    if (!activeConfig || activeConfig.name === originalName) activeConfig = allConfigs.find(c => c.name === name) || allConfigs[0];
    populateDropdown();
    renderConfigList();
    clearForm();
}

async function deleteConfig(name) {
    if (allConfigs.length <= 1) { alert('Cannot delete the last config.'); return; }
    await fetch(`/api/configs/${encodeURIComponent(name)}`, { method: 'DELETE' });
    allConfigs = await fetchConfigs();
    if (activeConfig && activeConfig.name === name) {
        activeConfig = allConfigs[0];
        applyConfig(activeConfig);
    }
    populateDropdown();
    renderConfigList();
}

// Close modal when clicking the backdrop
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('configModal').addEventListener('click', e => {
        if (e.target === document.getElementById('configModal')) closeConfigEditor();
    });
    init();
});
