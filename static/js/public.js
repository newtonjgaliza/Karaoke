let requestsEnabled = false;
let clientIp = 'unknown';
let deviceId = '';

// Gera ou recupera o ID único do dispositivo
function getOrCreateDeviceId() {
    let id = localStorage.getItem('karaoke_device_id');
    if (!id) {
        id = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
        localStorage.setItem('karaoke_device_id', id);
    }
    return id;
}

// Busca o IP público do cliente
async function fetchClientIp() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        if (data && data.ip) {
            clientIp = data.ip;
        }
    } catch (e) {
        console.warn("Não foi possível obter o IP público:", e);
        clientIp = 'unknown';
    }
}

// Formata o campo extra_info para incluir os metadados do dispositivo
function formatRequestMetadata(extraInfo, devId, ip) {
    const base = (extraInfo || '').trim();
    const meta = `__meta__dev:${devId}||ip:${ip}`;
    return base ? `${base} ${meta}` : meta;
}

// Inicializa a escuta de mudanças de configuração em tempo real no Supabase
async function initSettingsSync() {
    // 1. Busca o status inicial
    const { data, error } = await supabaseClient
        .from('settings')
        .select('requests_enabled')
        .eq('id', 1)
        .single();

    if (!error && data) {
        requestsEnabled = data.requests_enabled;
        updateRequestsUI();
    } else {
        console.error("Erro ao buscar configurações iniciais:", error);
    }

    // 2. Escuta alterações em tempo real na tabela 'settings'
    supabaseClient
        .channel('settings-changes')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'settings', filter: 'id=eq.1' },
            (payload) => {
                if (payload.new) {
                    requestsEnabled = payload.new.requests_enabled;
                    updateRequestsUI();
                }
            }
        )
        .subscribe((status, err) => {
            console.log('Realtime Client Settings Status:', status);
            if (err) console.error('Realtime Client Settings Error:', err);
        });
}

// Atualiza o estado visual do botão de envio baseado no bloqueio de pedidos
function updateRequestsUI() {
    const submitBtn = document.getElementById('submitBtn');
    if (requestsEnabled) {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').textContent = 'Enviar Pedido';
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
    } else {
        submitBtn.disabled = false; // Permite clicar para disparar o modal explicativo
        submitBtn.querySelector('.btn-text').textContent = 'Pedidos Bloqueados 🔒';
        submitBtn.style.opacity = '0.7';
    }
}

// Evento de envio do formulário
document.getElementById('requestForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    // Se os pedidos estão bloqueados pelo Admin, abre o modal de bloqueio
    if (!requestsEnabled) {
        document.getElementById('blockedModal').style.display = 'flex';
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    
    // Altera o estado do botão para enviando
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-text">Enviando...</span>';

    const name = document.getElementById('name').value.trim();
    const song = document.getElementById('song').value.trim();
    const reference = document.getElementById('reference').value.trim();
    const extra_info = document.getElementById('extra_info').value.trim();

    // 1. Verifica se a pessoa já está na fila (status: pending ou playing)
    try {
        const { data: activeRequests, error: queueError } = await supabaseClient
            .from('requests')
            .select('name, extra_info')
            .in('status', ['pending', 'playing']);

        if (queueError) throw queueError;

        const lowerInputName = name.toLowerCase().trim();
        const hasActiveRequest = activeRequests && activeRequests.some(r => {
            // Verifica correspondência de nome (case-insensitive)
            if (r.name && r.name.toLowerCase().trim() === lowerInputName) {
                return true;
            }
            // Verifica correspondência de dispositivo
            if (r.extra_info && r.extra_info.includes(deviceId)) {
                return true;
            }
            return false;
        });

        if (hasActiveRequest) {
            // Restaura o botão e exibe modal de aviso
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            document.getElementById('inQueueModal').style.display = 'flex';
            return;
        }
    } catch (err) {
        console.error("Erro ao verificar fila ativa:", err);
    }

    const formattedExtraInfo = formatRequestMetadata(extra_info, deviceId, clientIp);

    try {
        // Envia o pedido diretamente para a tabela do Supabase
        const { error } = await supabaseClient
            .from('requests')
            .insert([
                {
                    name: name,
                    song: song,
                    reference: reference,
                    extra_info: formattedExtraInfo,
                    status: 'pending'
                }
            ]);

        if (error) throw error;

        // Abre o modal de sucesso
        document.getElementById('successModal').style.display = 'flex';
        
        // Limpa os campos do formulário mantendo apenas o Nome
        document.getElementById('song').value = '';
        document.getElementById('reference').value = '';
        document.getElementById('extra_info').value = '';
    } catch (error) {
        console.error("Erro ao enviar pedido para o Supabase:", error);
        alert("Erro ao enviar pedido: " + (error.message || error));
    } finally {
        // Restaura o estado do botão
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        updateRequestsUI();
    }
});

function closeModal() {
    document.getElementById('successModal').style.display = 'none';
    document.getElementById('song').focus();
}

function closeBlockedModal() {
    document.getElementById('blockedModal').style.display = 'none';
}

function closeInQueueModal() {
    document.getElementById('inQueueModal').style.display = 'none';
}

// Inicializa a sincronização ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    deviceId = getOrCreateDeviceId();
    fetchClientIp();
    initSettingsSync();

    // Polling fallback to ensure settings updates even if Supabase Realtime is disabled or fails
    setInterval(async () => {
        try {
            const { data, error } = await supabaseClient
                .from('settings')
                .select('requests_enabled')
                .eq('id', 1)
                .single();

            if (!error && data) {
                requestsEnabled = data.requests_enabled;
                updateRequestsUI();
            }
        } catch (err) {
            console.error("Erro no polling de configurações:", err);
        }
    }, 5000);
});
