let localQueue = [];
let knownRequestIds = new Set();
let isInitialLoad = true;

// Web Audio API Synthesizer Chime for new requests
function playNotificationSound() {
    if (!document.getElementById('audioToggle').checked) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Note 1: E5
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, audioCtx.currentTime); 
        gain1.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start();
        osc1.stop(audioCtx.currentTime + 0.4);
        
        // Note 2: A5 (starts slightly later)
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.12); 
        gain2.gain.setValueAtTime(0.1, audioCtx.currentTime + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.55);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(audioCtx.currentTime + 0.12);
        osc2.stop(audioCtx.currentTime + 0.55);
    } catch (e) {
        console.warn("Could not play notification sound (user gesture might be required first):", e);
    }
}

// Fetch the queue from server
function fetchQueue() {
    fetch('/api/requests')
        .then(response => response.json())
        .then(data => {
            let hasNewRequest = false;
            
            // Check for new requests to trigger sound
            data.forEach(item => {
                if (item.status === 'pending' && !knownRequestIds.has(item.id)) {
                    knownRequestIds.add(item.id);
                    if (!isInitialLoad) {
                        hasNewRequest = true;
                    }
                }
            });

            // Initialize known IDs on first load
            if (isInitialLoad) {
                data.forEach(item => knownRequestIds.add(item.id));
                isInitialLoad = false;
            }

            if (hasNewRequest) {
                playNotificationSound();
            }

            localQueue = data;
            renderQueueTable();
            updateStats();
        })
        .catch(error => {
            console.error('Error fetching queue:', error);
        });
}

// Update stats cards in Sidebar
function updateStats() {
    const pendingCount = localQueue.filter(item => item.status === 'pending').length;
    const playingCount = localQueue.filter(item => item.status === 'playing').length;
    const completedCount = localQueue.filter(item => item.status === 'completed').length;

    document.querySelector('#stat-pending .stat-value').textContent = pendingCount;
    document.querySelector('#stat-playing .stat-value').textContent = playingCount;
    document.querySelector('#stat-completed .stat-value').textContent = completedCount;
}

// Filter queue using search query
function filterQueue() {
    renderQueueTable();
}

// Render dynamic rows
function renderQueueTable() {
    const tbody = document.getElementById('queueTableBody');
    const searchVal = document.getElementById('searchBar').value.toLowerCase().trim();
    
    // Filter queue items
    const filteredQueue = localQueue.filter(item => {
        if (!searchVal) return true;
        return (
            item.name.toLowerCase().includes(searchVal) ||
            item.song.toLowerCase().includes(searchVal) ||
            (item.reference && item.reference.toLowerCase().includes(searchVal)) ||
            (item.extra_info && item.extra_info.toLowerCase().includes(searchVal))
        );
    });

    if (filteredQueue.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    ${localQueue.length === 0 ? 'Nenhuma música na fila. Aguardando pedidos...' : 'Nenhum pedido correspondente à pesquisa.'}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';

    filteredQueue.forEach(item => {
        const tr = document.createElement('tr');
        if (item.status === 'playing') {
            tr.className = 'row-playing';
        }

        // Actions cell content based on status
        let actionsHtml = '';
        if (item.status === 'pending') {
            actionsHtml = `
                <div class="actions-cell">
                    <button onclick="playSong(${item.id}, '${escapeQuote(item.song)}', '${escapeQuote(item.reference || '')}')" class="btn-action btn-play" title="Tocar música e abrir busca do YouTube">
                        <span>▶ Tocar</span>
                    </button>
                    <button onclick="updateStatus(${item.id}, 'completed')" class="btn-action btn-done" title="Marcar como cantada">
                        <span>✓ Concluir</span>
                    </button>
                    <button onclick="updateStatus(${item.id}, 'cancelled')" class="btn-action btn-cancel" title="Cancelar pedido">
                        <span>✕ Cancelar</span>
                    </button>
                </div>
            `;
        } else if (item.status === 'playing') {
            actionsHtml = `
                <div class="actions-cell">
                    <span class="badge-status badge-playing">● Tocando</span>
                    <button onclick="updateStatus(${item.id}, 'completed')" class="btn-action btn-play" style="background-color: var(--primary); color: white;" title="Concluir apresentação">
                        <span>✓ Concluir</span>
                    </button>
                    <button onclick="updateStatus(${item.id}, 'cancelled')" class="btn-action btn-cancel" title="Cancelar apresentação">
                        <span>✕ Cancelar</span>
                    </button>
                </div>
            `;
        } else {
            // completed or cancelled
            const badgeClass = item.status === 'completed' ? 'badge-completed' : 'badge-cancelled';
            const statusLabel = item.status === 'completed' ? 'Cantada' : 'Cancelada';
            actionsHtml = `
                <div class="actions-cell">
                    <span class="badge-status ${badgeClass}">${statusLabel}</span>
                    <button onclick="deleteRequest(${item.id})" class="btn-action btn-delete" title="Excluir do histórico">
                        <span>Remover</span>
                    </button>
                </div>
            `;
        }

        tr.innerHTML = `
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.song)}</td>
            <td>${escapeHtml(item.reference || '-')}</td>
            <td>${escapeHtml(item.extra_info || '-')}</td>
            <td>${actionsHtml}</td>
        `;

        tbody.appendChild(tr);
    });
}

// Action: Play Song (Update status and search YouTube in new tab)
function playSong(id, song, reference) {
    // 1. Update status on backend
    fetch(`/api/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'playing' })
    })
    .then(response => {
        if (response.ok) {
            fetchQueue(); // Refresh table
            
            // 2. Open YouTube Search in a new tab
            const searchQuery = `karaoke ${song} ${reference}`.trim();
            const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
            window.open(youtubeUrl, '_blank');
        }
    })
    .catch(error => console.error('Error updating status:', error));
}

// Action: Update status directly (complete, cancel, etc)
function updateStatus(id, newStatus) {
    fetch(`/api/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    })
    .then(response => {
        if (response.ok) {
            fetchQueue();
        }
    })
    .catch(error => console.error('Error updating status:', error));
}

// Action: Delete request
function deleteRequest(id) {
    fetch(`/api/requests/${id}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (response.ok) {
            fetchQueue();
        }
    })
    .catch(error => console.error('Error deleting request:', error));
}

// Action: Clear history
function clearHistory() {
    if (!confirm('Deseja limpar todos os pedidos concluídos e cancelados do histórico?')) return;
    
    fetch('/api/requests/clear', {
        method: 'POST'
    })
    .then(response => {
        if (response.ok) {
            fetchQueue();
        }
    })
    .catch(error => console.error('Error clearing history:', error));
}

// Helpers
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
}

function escapeQuote(text) {
    if (!text) return '';
    return text.replace(/'/g, "\\'");
}

// Initial polling triggers
fetchQueue();
setInterval(fetchQueue, 3000);

// Check trial status
function checkTrial() {
    fetch('/api/trial-status')
        .then(response => response.json())
        .then(data => {
            const badge = document.getElementById('trialBadge');
            if (!badge) return;
            if (data.status === 'trial' && data.remaining !== null) {
                const totalHours = Math.ceil(data.remaining / 3600);
                badge.style.display = 'block';
                if (totalHours > 24) {
                    const days = Math.floor(totalHours / 24);
                    const hours = totalHours % 24;
                    badge.innerHTML = `⚠️ Teste: <strong>${days}d ${hours}h</strong> restantes`;
                } else {
                    badge.innerHTML = `⚠️ Teste: <strong>${totalHours}h</strong> restantes`;
                }
            } else {
                badge.style.display = 'none';
            }
        })
        .catch(err => console.error('Error fetching trial status:', err));
}
checkTrial();
setInterval(checkTrial, 300000); // Check every 5 minutes

// Ngrok Tunnel Management
function checkTunnelStatus() {
    fetch('/api/tunnel')
        .then(response => response.json())
        .then(data => {
            const statusIndicator = document.getElementById('tunnelStatusIndicator');
            const setupSection = document.getElementById('tunnelSetupSection');
            const activeSection = document.getElementById('tunnelActiveSection');
            const urlVal = document.getElementById('tunnelUrlVal');
            const qrImg = document.getElementById('tunnelQrCode');
            const tokenInput = document.getElementById('ngrokTokenInput');

            if (!statusIndicator) return;

            if (data.active) {
                statusIndicator.classList.add('active');
                setupSection.style.display = 'none';
                activeSection.style.display = 'block';
                urlVal.value = data.url;
                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(data.url)}`;
            } else {
                statusIndicator.classList.remove('active');
                setupSection.style.display = 'block';
                activeSection.style.display = 'none';
                if (data.has_token && !tokenInput.value) {
                    tokenInput.placeholder = `Salvo: ${data.token_preview}`;
                }
            }
        })
        .catch(err => console.error('Error checking tunnel status:', err));
}

function startTunnel() {
    const tokenInput = document.getElementById('ngrokTokenInput');
    const btn = document.querySelector('.btn-start');
    const token = tokenInput.value.trim();

    btn.disabled = true;
    btn.textContent = 'Iniciando...';

    fetch('/api/tunnel/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ authtoken: token })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.error || 'Erro ao iniciar túnel.'); });
        }
        return response.json();
    })
    .then(data => {
        tokenInput.value = '';
        checkTunnelStatus();
    })
    .catch(error => {
        alert(error.message);
    })
    .finally(() => {
        btn.disabled = false;
        btn.textContent = 'Ativar Celular 3G/4G';
    });
}

function stopTunnel() {
    const btn = document.querySelector('.btn-stop');
    btn.disabled = true;
    btn.textContent = 'Parando...';

    fetch('/api/tunnel/stop', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        checkTunnelStatus();
    })
    .catch(err => console.error('Error stopping tunnel:', err))
    .finally(() => {
        btn.disabled = false;
        btn.textContent = 'Parar Túnel';
    });
}

function copyTunnelUrl() {
    const urlVal = document.getElementById('tunnelUrlVal');
    urlVal.select();
    urlVal.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(urlVal.value)
        .then(() => {
            const copyBtn = document.querySelector('.btn-copy');
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✓';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 1500);
        })
        .catch(err => console.error('Failed to copy text:', err));
}

// Start polling status
checkTunnelStatus();
setInterval(checkTunnelStatus, 15000); // Check status every 15 seconds
