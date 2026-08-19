import os
import sys
import json
import time
from flask import Flask, jsonify, render_template, request

# Configura caminhos para compatibilidade com o PyInstaller (executável único)
if getattr(sys, 'frozen', False):
    # Rodando dentro do executável compilado (.exe)
    template_dir = os.path.join(sys._MEIPASS, 'templates')
    static_dir = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)
    JSON_PATH = os.path.join(os.path.dirname(sys.executable), 'db.json')
else:
    # Rodando em ambiente Python padrão
    app = Flask(__name__)
    JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'db.json')

# Determine if we should use memory-only mode (useful for Vercel serverless)
USE_MEMORY = os.environ.get('VERCEL') or os.environ.get('USE_MEMORY')

# In-memory storage fallback
memory_db = []
last_id = 0

def load_data():
    global memory_db, last_id
    if USE_MEMORY:
        # Resolve IDs for memory db
        if memory_db:
            last_id = max(item['id'] for item in memory_db)
        return memory_db

    if not os.path.exists(JSON_PATH):
        save_data([])
        return []

    try:
        with open(JSON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if data:
                last_id = max(item['id'] for item in data)
            return data
    except Exception as e:
        print(f"Erro ao ler JSON. Usando armazenamento em memória temporário: {e}")
        # Fallback to memory if read fails
        if memory_db:
            last_id = max(item['id'] for item in memory_db)
        return memory_db

def save_data(data):
    global memory_db
    memory_db = data # Keep memory synced
    
    if USE_MEMORY:
        return

    try:
        with open(JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"Erro ao salvar JSON (sistema somente leitura?). Usando memória: {e}")

# Routes for rendering UI
@app.route('/')
def public_form():
    return render_template('public.html')

@app.route('/admin')
def admin_panel():
    return render_template('admin.html')

# API Endpoints
@app.route('/api/requests', methods=['GET'])
def get_requests():
    data = load_data()
    
    # Custom sort: 
    # 1. 'playing' status first
    # 2. 'pending' status second (first-in first-out by timestamp)
    # 3. 'completed' and 'cancelled' status last
    def sort_key(item):
        status = item.get('status', 'pending')
        timestamp = item.get('timestamp', '')
        if status == 'playing':
            return (1, timestamp)
        elif status == 'pending':
            return (2, timestamp)
        else:
            return (3, timestamp)

    sorted_data = sorted(data, key=sort_key)
    return jsonify(sorted_data)

@app.route('/api/requests', methods=['POST'])
def add_request():
    global last_id
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    song = data.get('song', '').strip()
    reference = data.get('reference', '').strip()
    extra_info = data.get('extra_info', '').strip()

    if not name or not song:
        return jsonify({'error': 'Nome e Música são obrigatórios!'}), 400

    db_data = load_data()
    last_id += 1
    
    new_request = {
        'id': last_id,
        'name': name,
        'song': song,
        'reference': reference,
        'extra_info': extra_info,
        'status': 'pending',
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
    }
    
    db_data.append(new_request)
    save_data(db_data)

    return jsonify({'success': True, 'id': last_id}), 201

@app.route('/api/requests/<int:request_id>', methods=['PUT'])
def update_request_status(request_id):
    data = request.get_json() or {}
    status = data.get('status', '').strip()

    if status not in ['pending', 'playing', 'completed', 'cancelled']:
        return jsonify({'error': 'Status inválido!'}), 400

    db_data = load_data()
    found = False

    # If the new status is 'playing', change any other 'playing' requests back to 'completed'
    if status == 'playing':
        for item in db_data:
            if item.get('status') == 'playing':
                item['status'] = 'completed'

    for item in db_data:
        if item.get('id') == request_id:
            item['status'] = status
            found = True
            break

    if not found:
        return jsonify({'error': 'Pedido não encontrado!'}), 404

    save_data(db_data)
    return jsonify({'success': True})

@app.route('/api/requests/<int:request_id>', methods=['DELETE'])
def delete_request(request_id):
    db_data = load_data()
    initial_length = len(db_data)
    
    db_data = [item for item in db_data if item.get('id') != request_id]
    
    if len(db_data) == initial_length:
        return jsonify({'error': 'Pedido não encontrado!'}), 404

    save_data(db_data)
    return jsonify({'success': True})

@app.route('/api/requests/clear', methods=['POST'])
def clear_history():
    db_data = load_data()
    # Remove completed or cancelled requests
    filtered_data = [item for item in db_data if item.get('status') not in ['completed', 'cancelled']]
    save_data(filtered_data)
    return jsonify({'success': True})

if __name__ == '__main__':
    # Listen on all interfaces, port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
