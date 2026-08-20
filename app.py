import os
import sys
import json
import time
import base64
import threading
from datetime import datetime
from flask import Flask, jsonify, render_template, request
from pyngrok import ngrok, conf

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

LICENSE_PATH = os.path.join(os.path.dirname(JSON_PATH), 'license.json')
CONFIG_PATH = os.path.join(os.path.dirname(JSON_PATH), 'config.json')

# Global tunnel url tracker
tunnel_url = None

def get_config():
    if not os.path.exists(CONFIG_PATH):
        return {}
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {}

def save_config(cfg):
    try:
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"Erro ao salvar config.json: {e}")

def start_ngrok_tunnel(authtoken):
    global tunnel_url
    try:
        pyngrok_config = conf.PyngrokConfig()
        conf.set_default(pyngrok_config)
        ngrok.set_auth_token(authtoken)
        
        # Connect tunnel on port 5000
        http_tunnel = ngrok.connect(5000)
        tunnel_url = http_tunnel.public_url
        print(f"\n[Ngrok] Túnel ativo: {tunnel_url}\n")
        return tunnel_url
    except Exception as e:
        print(f"\n[Ngrok] Erro ao iniciar túnel: {e}\n")
        tunnel_url = None
        raise e

def auto_start_tunnel():
    cfg = get_config()
    token = cfg.get('ngrok_authtoken', '')
    if token:
        print("[Ngrok] Iniciando túnel automático...")
        t = threading.Thread(target=lambda: start_ngrok_tunnel(token))
        t.daemon = True
        t.start()

# Determine if we should use memory-only mode (useful for Vercel serverless)
USE_MEMORY = os.environ.get('VERCEL') or os.environ.get('USE_MEMORY')

def get_trial_status():
    if USE_MEMORY:
        return True, None

    if not os.path.exists(LICENSE_PATH):
        # Inicialmente inativo. Precisa de chave de teste ou premium para iniciar.
        try:
            with open(LICENSE_PATH, 'w', encoding='utf-8') as f:
                json.dump({'token': '', 'status': 'inactive'}, f, ensure_ascii=False, indent=4)
        except Exception as e:
            print(f"Erro ao criar arquivo de licença inicial: {e}")
        return False, 0

    try:
        with open(LICENSE_PATH, 'r', encoding='utf-8') as f:
            lic_data = json.load(f)
            
        status = lic_data.get('status', 'inactive')
        
        if status == 'active':
            return True, None
            
        if status == 'inactive':
            return False, 0
            
        if status == 'trial':
            token = lic_data.get('token', '')
            if not token:
                return False, 0
            decoded_str = base64.b64decode(token.encode('utf-8')).decode('utf-8')
            first_run_dt = datetime.fromisoformat(decoded_str)
            elapsed = datetime.now() - first_run_dt
            elapsed_seconds = elapsed.total_seconds()
            
            # 3 dias = 259200 segundos
            remaining_seconds = 259200 - elapsed_seconds
            if remaining_seconds <= 0:
                # Expirou o teste! Volta a ser inativo
                try:
                    with open(LICENSE_PATH, 'w', encoding='utf-8') as f:
                        json.dump({'token': '', 'status': 'inactive'}, f, ensure_ascii=False, indent=4)
                except:
                    pass
                return False, 0
            return True, remaining_seconds
            
        return False, 0
    except Exception as e:
        print(f"Erro ao ler/processar licença: {e}")
        return False, 0

@app.before_request
def check_trial_expiration():
    # Permite acesso a recursos estáticos, rotas de ativação, status e gerenciamento do túnel sem restrição
    if request.path.startswith('/static') or request.path == '/api/activate' or request.path == '/api/trial-status' or request.path.startswith('/api/tunnel') or request.path == '/favicon.ico':
        return
        
    is_active, remaining = get_trial_status()
    if not is_active:
        if request.path.startswith('/api/'):
            return jsonify({'error': 'trial_expired', 'message': 'Aplicativo bloqueado. Insira um código de ativação válido.'}), 403
        return render_template('expired.html')

@app.route('/api/trial-status', methods=['GET'])
def trial_status():
    is_active, remaining = get_trial_status()
    if is_active and remaining is None:
        return jsonify({'status': 'active', 'remaining': None})
    elif is_active:
        return jsonify({'status': 'trial', 'remaining': remaining})
    else:
        return jsonify({'status': 'expired', 'remaining': 0})

@app.route('/api/activate', methods=['POST'])
def activate_app():
    data = request.get_json() or {}
    key = data.get('key', '').strip()
    
    # 1. Chave Premium Permanente
    if key == "A-TOCA-KARAOKE-PREMIUM-2026":
        try:
            with open(LICENSE_PATH, 'w', encoding='utf-8') as f:
                json.dump({'token': '', 'status': 'active'}, f, ensure_ascii=False, indent=4)
            return jsonify({'success': True, 'message': 'Licença Premium ativada com sucesso!'})
        except Exception as e:
            return jsonify({'error': f'Erro ao salvar ativação: {e}'}), 500
            
    # 2. Código de Teste de 3 Dias
    elif key == "TOCA-TESTE-3DIAS":
        try:
            # Salva o timestamp de ativação do teste codificado em Base64
            now_str = datetime.now().isoformat()
            encoded = base64.b64encode(now_str.encode('utf-8')).decode('utf-8')
            with open(LICENSE_PATH, 'w', encoding='utf-8') as f:
                json.dump({'token': encoded, 'status': 'trial'}, f, ensure_ascii=False, indent=4)
            return jsonify({'success': True, 'message': 'Código de testes aceito! 3 dias ativados.'})
        except Exception as e:
            return jsonify({'error': f'Erro ao salvar ativação de teste: {e}'}), 500
            
    else:
        return jsonify({'error': 'Código ou chave de ativação incorreta!'}), 400

@app.route('/api/tunnel', methods=['GET'])
def get_tunnel_status_route():
    cfg = get_config()
    saved_token = cfg.get('ngrok_authtoken', '')
    masked_token = f"{saved_token[:8]}..." if len(saved_token) > 8 else saved_token
    return jsonify({
        'active': tunnel_url is not None,
        'url': tunnel_url,
        'has_token': bool(saved_token),
        'token_preview': masked_token
    })

@app.route('/api/tunnel/start', methods=['POST'])
def start_tunnel_route():
    global tunnel_url
    data = request.get_json() or {}
    token = data.get('authtoken', '').strip()
    
    if not token:
        cfg = get_config()
        token = cfg.get('ngrok_authtoken', '')
        if not token:
            return jsonify({'error': 'Token do Ngrok é obrigatório!'}), 400
            
    cfg = get_config()
    cfg['ngrok_authtoken'] = token
    save_config(cfg)
    
    if tunnel_url:
        try:
            ngrok.disconnect(tunnel_url)
            ngrok.kill()
        except:
            pass
        tunnel_url = None
        
    try:
        url = start_ngrok_tunnel(token)
        return jsonify({'success': True, 'url': url})
    except Exception as e:
        return jsonify({'error': f'Falha ao iniciar o túnel: {str(e)}'}), 500

@app.route('/api/tunnel/stop', methods=['POST'])
def stop_tunnel_route():
    global tunnel_url
    if tunnel_url:
        try:
            ngrok.disconnect(tunnel_url)
            ngrok.kill()
            tunnel_url = None
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': f'Erro ao parar o túnel: {str(e)}'}), 500
    return jsonify({'success': True, 'message': 'Nenhum túnel ativo'})

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
    # Inicializa túnel automático se configurado
    auto_start_tunnel()
    # Listen on all interfaces, port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
