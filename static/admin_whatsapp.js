// admin_whatsapp.js
// Gerencia a exibição do status e QR Code do Bot WhatsApp no painel admin

let waPollingInterval = null;
let waAtivo = false;

// Elementos do DOM
const elBadge      = document.getElementById('wa-status-badge');
const elQrBox      = document.getElementById('wa-qr-box');
const elQrImg      = document.getElementById('wa-qr-img');
const elConnected  = document.getElementById('wa-connected-box');
const elLoading    = document.getElementById('wa-loading-box');
const elLoadingTxt = document.getElementById('wa-loading-text');

// Mapeia o status retornado pelo backend para texto e estilo do badge
const STATUS_MAP = {
    'CONECTADO':      { texto: '🟢 Bot Conectado',      classe: 'badge-concluido' },
    'AGUARDANDO_QR':  { texto: '🟡 Aguardando Leitura', classe: 'badge-agendado'  },
    'AUTENTICANDO':   { texto: '🔵 Autenticando...',    classe: 'badge-confirmado' },
    'INICIANDO':      { texto: '🔄 Iniciando...',       classe: 'badge-pendente'   },
    'DESCONECTADO':   { texto: '🔴 Desconectado',       classe: 'badge-cancelado'  },
    'ERRO':           { texto: '❌ Erro',               classe: 'badge-cancelado'  },
};

function mostrarEstado(estado) {
    // Esconde tudo primeiro
    elQrBox.style.display     = 'none';
    elConnected.style.display = 'none';
    elLoading.style.display   = 'none';

    if (estado === 'AGUARDANDO_QR') {
        elQrBox.style.display = 'flex';
    } else if (estado === 'CONECTADO') {
        elConnected.style.display = 'flex';
    } else {
        // INICIANDO, AUTENTICANDO, DESCONECTADO, ERRO
        elLoading.style.display = 'flex';
        const textos = {
            'AUTENTICANDO':  'Autenticando sessão...',
            'INICIANDO':     'Iniciando sistema...',
            'DESCONECTADO':  'Bot desconectado. Aguardando reconexão...',
            'ERRO':          'Ocorreu um erro. Verificando...',
        };
        if (elLoadingTxt) elLoadingTxt.textContent = textos[estado] || 'Verificando...';
    }
}

function atualizarBadge(status) {
    if (!elBadge) return;
    const info = STATUS_MAP[status] || { texto: status, classe: 'badge-pendente' };

    // Remove classes antigas
    elBadge.className = 'badge ' + info.classe;
    elBadge.textContent = info.texto;
}

async function verificarStatusWhatsApp() {
    try {
        const response = await fetch('/api/whatsapp/status');
        if (!response.ok) throw new Error('Resposta inválida da API');

        const data = await response.json();
        const status = data.status || (data.statusTexto === 'connected' ? 'CONECTADO' : data.statusTexto === 'qr_ready' ? 'AGUARDANDO_QR' : data.statusTexto === 'connecting' ? 'INICIANDO' : 'DESCONECTADO');

        atualizarBadge(status);
        mostrarEstado(status);

        // Atualiza o QR Code se disponível
        if (status === 'AGUARDANDO_QR' && (data.qr || data.qrCode)) {
            elQrImg.src = data.qr || data.qrCode;
        }

    } catch (error) {
        console.error('Erro ao buscar status do WhatsApp:', error);
        atualizarBadge('ERRO');
        mostrarEstado('ERRO');
    }
}

function iniciarPolling() {
    if (waAtivo) return; // Evita duplicar os intervalos
    waAtivo = true;

    // Primeira verificação imediata
    verificarStatusWhatsApp();

    // Depois verifica a cada 5 segundos
    waPollingInterval = setInterval(verificarStatusWhatsApp, 5000);
}

function pararPolling() {
    waAtivo = false;
    if (waPollingInterval) {
        clearInterval(waPollingInterval);
        waPollingInterval = null;
    }
}

// Observa quando a aba WhatsApp é ativada/desativada
// para iniciar/parar o polling eficientemente
const waTab = document.getElementById('whatsapp');
if (waTab) {
    const waObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.attributeName === 'class') {
                if (waTab.classList.contains('active')) {
                    iniciarPolling();
                } else {
                    pararPolling();
                }
            }
        });
    });

    waObserver.observe(waTab, { attributes: true });

    // Se a aba já estiver ativa ao carregar a página, inicia direto
    if (waTab.classList.contains('active')) {
        iniciarPolling();
    }
}