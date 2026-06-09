let gameState = {
    boardSize: 10,
    fleet: [],
    shots: {}, // { "row,col": "hit" | "miss" }
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
    document.getElementById('resetBtn').addEventListener('click', resetGame);

    // Grid cells are added dynamically, so use event delegation
    document.getElementById('gameGrid').addEventListener('click', (e) => {
        if (e.target.classList.contains('grid-cell')) {
            const [row, col] = e.target.dataset.pos.split(',').map(Number);
            toggleShot(row, col);
        }
    });
}

function renderGrid() {
    const grid = document.getElementById('gameGrid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${gameState.boardSize}, 1fr)`;

    for (let row = 0; row < gameState.boardSize; row++) {
        for (let col = 0; col < gameState.boardSize; col++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.pos = `${row},${col}`;

            const shotKey = `${row},${col}`;
            if (gameState.shots[shotKey] === 'hit') {
                cell.classList.add('hit');
                cell.textContent = '●';
            } else if (gameState.shots[shotKey] === 'miss') {
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

    gameState.fleet.forEach(ship => {
        const li = document.createElement('li');
        li.textContent = `${ship.count}x ${ship.name} (${ship.size} squares)`;
        fleetList.appendChild(li);
    });
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

    // Build lookup sets for fast access
    const missSet = new Set();
    const hitSet = new Set();
    for (const [posStr, type] of Object.entries(gameState.shots)) {
        if (type === 'miss') missSet.add(posStr);
        else if (type === 'hit') hitSet.add(posStr);
    }

    // Placements that cover a known hit are far more likely than placements in
    // open water — weight them heavily so the heat concentrates around hits and
    // their natural extensions (the "ends" of a partially-found ship).
    const BASE_WEIGHT = 1;
    const HIT_WEIGHT = 12;

    for (const ship of gameState.fleet) {
        // Horizontal placements
        for (let row = 0; row < size; row++) {
            for (let startCol = 0; startCol <= size - ship.size; startCol++) {
                let valid = true;
                let hitCoverage = 0;

                for (let c = startCol; c < startCol + ship.size; c++) {
                    if (missSet.has(`${row},${c}`)) { valid = false; break; }
                    if (hitSet.has(`${row},${c}`)) hitCoverage++;
                }

                if (valid) {
                    const weight = (hitCoverage > 0 ? HIT_WEIGHT : BASE_WEIGHT) * ship.count;
                    for (let c = startCol; c < startCol + ship.size; c++) {
                        counts[row][c] += weight;
                    }
                }
            }
        }

        // Vertical placements
        for (let startRow = 0; startRow <= size - ship.size; startRow++) {
            for (let col = 0; col < size; col++) {
                let valid = true;
                let hitCoverage = 0;

                for (let r = startRow; r < startRow + ship.size; r++) {
                    if (missSet.has(`${r},${col}`)) { valid = false; break; }
                    if (hitSet.has(`${r},${col}`)) hitCoverage++;
                }

                if (valid) {
                    const weight = (hitCoverage > 0 ? HIT_WEIGHT : BASE_WEIGHT) * ship.count;
                    for (let r = startRow; r < startRow + ship.size; r++) {
                        counts[r][col] += weight;
                    }
                }
            }
        }
    }

    // Zero out already-shot cells — their state is known, no point targeting them
    for (const posStr of Object.keys(gameState.shots)) {
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
    if (confirm('Reset the game? This will clear all shots.')) {
        gameState.shots = {};
        saveGameState();
        renderGrid();
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
        gameState.heatmapVisible = parsed.heatmapVisible || false;
    }
}

// Start the game when page loads
document.addEventListener('DOMContentLoaded', init);
