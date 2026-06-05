from flask import Flask, jsonify, send_from_directory
import json

app = Flask(__name__, static_folder='static', static_url_path='', template_folder='static')

def load_config():
    try:
        with open('config.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {
            "boardSize": 10,
            "fleet": [
                {"name": "Battleship", "size": 4, "count": 1},
                {"name": "Cruiser", "size": 3, "count": 2},
                {"name": "Destroyer", "size": 2, "count": 3},
                {"name": "Submarine", "size": 1, "count": 4}
            ]
        }

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/config')
def get_config():
    return jsonify(load_config())

if __name__ == '__main__':
    app.run(debug=True, port=8000)
