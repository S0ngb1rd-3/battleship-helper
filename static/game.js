let gameState = {
    boardSize: 10,
    fleet: [],
    shots: {},        // { "row,col": "hit" | "miss" }
    sunkShips: [],    // [{ size, cells: ["r,c", ...] }]
    selecting: false, // whether "mark sunk" selection mode is active
    selectedCells: [], // hit cells chosen during current selection
    heatmapVisible: false
};

let config = {};

// Initialize game
async function init() {
    const response = await fetch('/api/config');
    config = await response.json();

    gameState.boardSize = config.boardSize;
    gameState.fleet = config.fleet;

    // Load saved state or start fresh
    loadGameState();

    renderGrid();
    renderFleetInfo();
    updateStats();
    renderHeatmap();

    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('toggleHeatmapBtn').addEventListener('click', toggleHeatmap);
    document.getElementById('markSunkBtn').addEventListener('click', enterSelectingMode);
    document.getElementById('confirmSunkBtn').addEventListener('click', confirmSunk);
    document.getElementById('cancelSunkBtn').addEventListener('click', exitSelectingMode);
    document.getElementById('resetBtn').addEventListener('click', resetGame);

    document.getElementById('gameGrid').addEventListener('click', (e) => {
        if (!e.target.classList.contains('grid-cell')) return;
        const [row, col] = e.target.dataset.pos.split(',').map(Number);
        if (gameState.selecting) {
            toggleSelectCell(row, col);
        } else {
            toggleShot(row, col);
        }
    });
}

function renderGrid() {
    const grid = document.getElementById('gameGrid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${gameState.boardSize}, 1fr)`;

    if (gameState.selecting) {
        grid.classList.add('selecting');
    } else {
        grid.classList.remove('selecting');
    }

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

function toggleShot(row, col) {
    const shotKey = `${row},${col}`;
    const current = gameState.shots[shotKey];

    if (current === 'hit') {
        gameState.shots[shotKey] = 'miss';
    } else if (current === 'miss') {
        delete gameState.shots[shotKey];
    } else {
        gameState.shots[shotKey] = 'hit';
    }

    saveGameState();
    renderGrid();
    updateStats();
    renderHeatmap();
}

function updateStats() {
    const shots = Object.values(gameState.shots);
    const hits = shots.filter(s => s === 'hit').length;
    const misses = shots.filter(s => s === 'miss').length;

    document.getElementById('shotCount').textContent = shots.length;
    document.getElementById('hitCount').textContent = hits;
    document.getElementById('missCount').textContent = misses;
}

function renderFleetInfo() {
    const fleetList = document.getElementById('fleetList');
    fleetList.innerHTML = '';

    // Count how many of each size have been sunk
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

function enterSelectingMode() {
    // Only enter if there are unsunk hit cells to select
    const sunkCellSet = new Set(gameState.sunkShips.flatMap(s => s.cells));
    const liveHits = Object.entries(gameState.shots)
        .filter(([k, v]) => v === 'hit' && !sunkCellSet.has(k));
    if (liveHits.length === 0) return;

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
    // Only hit cells that aren't already sunk can be selected
    const sunkCellSet = new Set(gameState.sunkShips.flatMap(s => s.cells));
    if (gameState.shots[key] !== 'hit' || sunkCellSet.has(key)) return;

    const idx = gameState.selectedCells.indexOf(key);
    if (idx >= 0) {
        gameState.selectedCells.splice(idx, 1);
    } else {
        gameState.selectedCells.push(key);
    }

    // Enable confirm if selection count matches any remaining ship size
    const confirmBtn = document.getElementById('confirmSunkBtn');
    confirmBtn.disabled = !matchesRemainingShip(gameState.selectedCells.length);

    renderGrid();
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
    gameState.sunkShips.push({
        size: gameState.selectedCells.length,
        cells: [...gameState.selectedCells]
    });
    saveGameState();
    exitSelectingMode();
    renderFleetInfo();
    renderHeatmap();
}

function toggleHeatmap() {
    gameState.heatmapVisible = !gameState.heatmapVisible;
    const canvas = document.getElementById('heatmapCanvas');
    canvas.style.display = gameState.heatmapVisible ? 'block' : 'none';

    const btn = document.getElementById('toggleHeatmapBtn');
    btn.textContent = gameState.heatmapVisible ? 'Hide Heat Map' : 'Show Heat Map';

    renderHeatmap();
}

function renderHeatmap() {
    if (!gameState.heatmapVisible) return;

    const canvas = document.getElementById('heatmapCanvas');
    const cellSize = 44; // 40px cell + 4px gap

    canvas.width = gameState.boardSize * cellSize;
    canvas.height = gameState.boardSize * cellSize;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate heat map
    const heatmap = calculateHeatmap();

    // Draw heat map
    for (let row = 0; row < gameState.boardSize; row++) {
        for (let col = 0; col < gameState.boardSize; col++) {
            const probability = heatmap[row][col];
            const x = col * cellSize + 2;
            const y = row * cellSize + 2;

            // Color gradient: cool (blue) for low probability, hot (red) for high
            const color = getHeatColor(probability);
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 40, 40);
        }
    }
}

function getHeatColor(probability) {
    // probability: 0 to 1
    // blue (cool) -> red (hot)
    if (probability === 0) {
        return 'rgba(0, 0, 0, 0)'; // transparent
    }

    const hue = (1 - probability) * 240; // Blue (240) to Red (0)
    const saturation = 100;
    const lightness = 50 - probability * 20; // Darker as hotter
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function calculateHeatmap() {
    const size = gameState.boardSize;
    const counts = Array(size).fill(null).map(() => Array(size).fill(0));

    // Build lookup sets
    const missSet = new Set();
    const hitSet = new Set();
    for (const [posStr, type] of Object.entries(gameState.shots)) {
        if (type === 'miss') missSet.add(posStr);
        else if (type === 'hit') hitSet.add(posStr);
    }

    // Sunk cells are fully resolved — exclude them from the live hit set so they
    // don't attract new placements or enforce adjacency constraints.
    const sunkCellSet = new Set(gameState.sunkShips.flatMap(s => s.cells));
    const liveHitSet = new Set([...hitSet].filter(k => !sunkCellSet.has(k)));

    // Count how many of each ship size have been sunk to skip them in the loop.
    const sunkCounts = {};
    for (const ship of gameState.sunkShips) {
        sunkCounts[ship.size] = (sunkCounts[ship.size] || 0) + 1;
    }

    // Placements covering a live hit are weighted heavily; open water gets base weight.
    const BASE_WEIGHT = 1;
    const HIT_WEIGHT = 12;

    for (const ship of gameState.fleet) {
        const remaining = ship.count - (sunkCounts[ship.size] || 0);
        if (remaining <= 0) continue; // all of this ship type are sunk

        // Horizontal placements
        for (let row = 0; row < size; row++) {
            for (let startCol = 0; startCol <= size - ship.size; startCol++) {
                const endCol = startCol + ship.size - 1;
                let valid = true;
                let hitCoverage = 0;

                // Reject if any cell is a miss or a sunk cell
                for (let c = startCol; c <= endCol; c++) {
                    const k = `${row},${c}`;
                    if (missSet.has(k) || sunkCellSet.has(k)) { valid = false; break; }
                    if (liveHitSet.has(k)) hitCoverage++;
                }

                // Reject if a live hit lies adjacent to but outside this placement
                if (valid) {
                    for (let c = startCol; c <= endCol && valid; c++) {
                        if (liveHitSet.has(`${row - 1},${c}`) || liveHitSet.has(`${row + 1},${c}`)) valid = false;
                    }
                    if (liveHitSet.has(`${row},${startCol - 1}`) || liveHitSet.has(`${row},${endCol + 1}`)) valid = false;
                }

                if (valid) {
                    const weight = (hitCoverage > 0 ? HIT_WEIGHT : BASE_WEIGHT) * remaining;
                    for (let c = startCol; c <= endCol; c++) {
                        counts[row][c] += weight;
                    }
                }
            }
        }

        // Vertical placements
        for (let startRow = 0; startRow <= size - ship.size; startRow++) {
            for (let col = 0; col < size; col++) {
                const endRow = startRow + ship.size - 1;
                let valid = true;
                let hitCoverage = 0;

                // Reject if any cell is a miss or a sunk cell
                for (let r = startRow; r <= endRow; r++) {
                    const k = `${r},${col}`;
                    if (missSet.has(k) || sunkCellSet.has(k)) { valid = false; break; }
                    if (liveHitSet.has(k)) hitCoverage++;
                }

                // Reject if a live hit lies adjacent to but outside this placement
                if (valid) {
                    for (let r = startRow; r <= endRow && valid; r++) {
                        if (liveHitSet.has(`${r},${col - 1}`) || liveHitSet.has(`${r},${col + 1}`)) valid = false;
                    }
                    if (liveHitSet.has(`${startRow - 1},${col}`) || liveHitSet.has(`${endRow + 1},${col}`)) valid = false;
                }

                if (valid) {
                    const weight = (hitCoverage > 0 ? HIT_WEIGHT : BASE_WEIGHT) * remaining;
                    for (let r = startRow; r <= endRow; r++) {
                        counts[r][col] += weight;
                    }
                }
            }
        }
    }

    // Zero out already-shot and sunk cells — their state is known
    for (const posStr of Object.keys(gameState.shots)) {
        const [r, c] = posStr.split(',').map(Number);
        counts[r][c] = 0;
    }
    for (const posStr of sunkCellSet) {
        const [r, c] = posStr.split(',').map(Number);
        counts[r][c] = 0;
    }

    // Normalize to [0, 1] relative to the hottest remaining cell
    let max = 0;
    for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
            if (counts[r][c] > max) max = counts[r][c];

    if (max === 0) return counts;
    return counts.map(row => row.map(v => v / max));
}

function resetGame() {
    if (confirm('Reset the game? This will clear all shots and sunk ships.')) {
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
}

function saveGameState() {
    localStorage.setItem('battleshipState', JSON.stringify(gameState));
}

function loadGameState() {
    const saved = localStorage.getItem('battleshipState');
    if (saved) {
        const parsed = JSON.parse(saved);
        gameState.shots = parsed.shots || {};
        gameState.sunkShips = parsed.sunkShips || [];
        gameState.heatmapVisible = parsed.heatmapVisible || false;
    }
}

// Start the game when page loads
document.addEventListener('DOMContentLoaded', init);
