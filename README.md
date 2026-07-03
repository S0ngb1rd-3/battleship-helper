# Battleship Helper

A personal strategy tool for Battleship. Track your shots on an interactive grid and use a probability heat map to identify the best next move.

## How It Works

The heat map uses a **placement density algorithm** to calculate the probability that each unshot cell contains a ship:

- For every ship in the fleet, every valid horizontal and vertical placement is evaluated
- A placement is **invalid** if it overlaps a confirmed miss, or if a hit cell lies adjacent to but outside the placement (ships can't touch)
- Placements that cover a known hit are weighted 12× higher than open-water placements
- The result is normalized so the hottest cell is always 1.0

In practice this means:
- **After a hit**, the cells extending the possible ship line turn bright red
- **After two hits in a row**, only the line extensions remain hot — perpendicular neighbors drop to zero because no other ship can be adjacent
- **In open water**, center cells run warmer than edges and corners because more ship placements pass through them

## Setup

Requires Python 3 and a virtual environment.

```bash
cd battleship-helper
python3 -m venv venv
source venv/bin/activate
pip install flask
```

## Running

```bash
source venv/bin/activate
python app.py
```

Then open [http://localhost:8000](http://localhost:8000) in your browser.

## Usage

| Action | Effect |
|---|---|
| Click an unshot cell | Mark as **hit** (red ●) |
| Click a hit cell | Change to **miss** (teal ○) |
| Click a miss cell | Clear back to unknown |
| Show Heat Map | Toggle probability overlay |
| Reset Game | Clear all shots (with confirmation) |

Game state is saved to browser `localStorage` automatically and restored on page reload.

## Configuration

Edit `config.json` to change board size or fleet before starting a game:

```json
{
  "boardSize": 10,
  "fleet": [
    {"name": "Battleship", "size": 4, "count": 1},
    {"name": "Cruiser",    "size": 3, "count": 2},
    {"name": "Destroyer",  "size": 2, "count": 3},
    {"name": "Submarine",  "size": 1, "count": 4}
  ]
}
```

- `boardSize` must be between 5 and 20 (always square)
- Fleet ships are any combination of name, size, and count
