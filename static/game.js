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
}

function renderHeatmap() {
    if (!gameState.heatmapVisible) return;

    const canvas = document.getElementById('heatmapCanvas');
    const cellSize = 44; // 40px cell + 4px gap
    const padding = 20;

    canvas.width = gameState.boardSize * cellSize + 2 * padding;
    canvas.height = gameState.boardSize * cellSize + 2 * padding;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate heat map
    const heatmap = calculateHeatmap();

    // Draw heat map
    for (let row = 0; row < gameState.boardSize; row++) {
        for (let col = 0; col < gameState.boardSize; col++) {
            const probability = heatmap[row][col];
            const x = padding + col * cellSize + 2;
            const y = padding + row * cellSize + 2;

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
    const heatmap = Array(gameState.boardSize)
        .fill(null)
        .map(() => Array(gameState.boardSize).fill(0));

    // Get all confirmed hits
    const hits = [];
    for (const [posStr, type] of Object.entries(gameState.shots)) {
        if (type === 'hit') {
            const [row, col] = posStr.split(',').map(Number);
            hits.push({ row, col });
        }
    }

    // Get all confirmed misses
    const misses = new Set(
        Object.entries(gameState.shots)
            .filter(([_, type]) => type === 'miss')
            .map(([pos]) => pos)
    );

    // For each empty cell, calculate probability it contains a ship
    for (let row = 0; row < gameState.boardSize; row++) {
        for (let col = 0; col < gameState.boardSize; col++) {
            const posStr = `${row},${col}`;

            // Skip if already a confirmed miss
            if (misses.has(posStr)) {
                heatmap[row][col] = 0;
                continue;
            }

            // If it's a hit, boost probability
            if (gameState.shots[posStr] === 'hit') {
                heatmap[row][col] = 0.8;
                continue;
            }

            // Count valid ship placements that include this cell
            let validPlacements = 0;
            let totalPlacements = 0;

            // Try all possible ships and placements
            gameState.fleet.forEach(ship => {
                for (let i = 0; i < ship.count; i++) {
                    // Horizontal placements
                    for (let startCol = 0; startCol <= gameState.boardSize - ship.size; startCol++) {
                        if (col >= startCol && col < startCol + ship.size && row >= 0) {
                            totalPlacements++;
                            if (isValidPlacement(row, startCol, row, startCol + ship.size - 1, misses, hits)) {
                                validPlacements++;
                            }
                        }
                    }

                    // Vertical placements
                    for (let startRow = 0; startRow <= gameState.boardSize - ship.size; startRow++) {
                        if (row >= startRow && row < startRow + ship.size && col >= 0) {
                            totalPlacements++;
                            if (isValidPlacement(startRow, col, startRow + ship.size - 1, col, misses, hits)) {
                                validPlacements++;
                            }
                        }
                    }
                }
            });

            heatmap[row][col] = totalPlacements > 0 ? validPlacements / totalPlacements : 0;
        }
    }

    return heatmap;
}

function isValidPlacement(startRow, startCol, endRow, endCol, misses, hits) {
    // Check if placement intersects with any confirmed misses
    if (startRow === endRow) {
        // Horizontal
        for (let c = startCol; c <= endCol; c++) {
            if (misses.has(`${startRow},${c}`)) {
                return false;
            }
        }
    } else {
        // Vertical
        for (let r = startRow; r <= endRow; r++) {
            if (misses.has(`${r},${startCol}`)) {
                return false;
            }
        }
    }

    // At least one cell in placement should be a hit or adjacent to hits (or uncovered)
    // For now, we just need it to not intersect misses
    return true;
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
