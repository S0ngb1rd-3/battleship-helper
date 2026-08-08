from flask import Flask, jsonify, send_from_directory, request
import json

app = Flask(__name__, static_folder='static', static_url_path='', template_folder='static')

CONFIGS_FILE = 'configs.json'

DEFAULT_CONFIGS = [
    {
        "name": "Standard 10×10",
        "boardSize": 10,
        "fleet": [
            {"name": "Battleship", "size": 4, "count": 1},
            {"name": "Cruiser",    "size": 3, "count": 2},
            {"name": "Destroyer",  "size": 2, "count": 3},
            {"name": "Submarine",  "size": 1, "count": 4}
        ]
    }
]

def load_configs():
    try:
        with open(CONFIGS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return DEFAULT_CONFIGS

def save_configs(configs):
    with open(CONFIGS_FILE, 'w') as f:
        json.dump(configs, f, indent=2, ensure_ascii=False)

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/configs', methods=['GET'])
def get_configs():
    return jsonify(load_configs())

@app.route('/api/configs', methods=['POST'])
def upsert_config():
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({'error': 'name required'}), 400
    configs = load_configs()
    idx = next((i for i, c in enumerate(configs) if c['name'] == data['name']), None)
    if idx is not None:
        configs[idx] = data
    else:
        configs.append(data)
    save_configs(configs)
    return jsonify({'ok': True})

@app.route('/api/configs/<name>', methods=['DELETE'])
def delete_config(name):
    configs = load_configs()
    configs = [c for c in configs if c['name'] != name]
    save_configs(configs)
    return jsonify({'ok': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=8000)
