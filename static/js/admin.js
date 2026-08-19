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
