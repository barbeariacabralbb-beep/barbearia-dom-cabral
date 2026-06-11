let botPollingInterval = null;

function initBotModule() {
    console.log('🤖 Inicializando módulo Bot...');
    carregarStatusBot();
    carregarAgendamentosSelect();
    carregarEstatisticas(); 
    
    if (botPollingInterval) clearInterval(botPollingInterval);
    
    botPollingInterval = setInterval(() => {
        if (document.getElementById('bot')?.classList.contains('active')) {
            carregarStatusBot();
        }
    }, 5000); 
}

function pararPolling() {
    if (botPollingInterval) clearInterval(botPollingInterval);
    botPollingInterval = null;
}

async function carregarEstatisticas() {
    try {
        const response = await fetch('/whatsapp/estatisticas');
        const data = await response.json();
        document.getElementById('bot-stat-total').innerText = data.total_enviadas;
        document.getElementById('bot-stat-hoje').innerText = data.enviadas_hoje;
        document.getElementById('bot-stat-taxa').innerText = data.taxa_sucesso + '%';
        document.getElementById('bot-stat-proximo').innerText = data.proximo_lembrete;
    } catch (error) {}
}

async function carregarStatusBot() {
    try {
        const response = await fetch('/api/whatsapp/status', {
            credentials: 'same-origin',
            cache: 'no-store'
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (!response.ok) {
            throw new Error(`Erro ao buscar status do WhatsApp: ${response.status}`);
        }

        const data = await response.json();
        const data = await response.json();
        
        const statusContainer = document.getElementById('bot-status-conteudo');
        const qrContainer = document.getElementById('bot-qrcode-container');
        const ultimaAtt = document.getElementById('bot-ultima-atualizacao');
        
        if (!statusContainer) return;
        
        const statusMap = {
            'connected': { text: '✅ CONECTADO', cor: '#4ade80', icon: 'fa-check-circle' },
            'qr_ready': { text: '📱 AGUARDANDO QR', cor: '#fbbf24', icon: 'fa-qrcode' },
            'connecting': { text: '🔄 CONECTANDO...', cor: '#fbbf24', icon: 'fa-spinner fa-spin' },
            'disconnected': { text: '❌ DESCONECTADO', cor: '#f87171', icon: 'fa-times-circle' }
        };
        
        const statusInfo = statusMap[data.statusTexto] || statusMap['disconnected'];
        
        statusContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                <i class="fas ${statusInfo.icon}" style="font-size: 2rem; color: ${statusInfo.cor};"></i>
                <div>
                    <div style="font-size: 1.2rem; font-weight: 700; color: ${statusInfo.cor};">${statusInfo.text}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">
                        ${data.connected ? 'Bot pronto para enviar mensagens' : 'Escaneie o QR code para conectar'}
                    </div>
                </div>
            </div>
        `;
        
        if (qrContainer) {
            if (data.qrCode && !data.connected) {
                qrContainer.innerHTML = `
                    <div style="text-align: center; padding: 16px; background: white; border-radius: 12px; display: inline-block;">
                        <img src="${data.qrCode}" alt="QR Code WhatsApp" style="max-width: 256px; border-radius: 8px;">
                    </div>
                `;
            } else if (data.connected) {
                qrContainer.innerHTML = `
                    <div style="text-align: center; padding: 32px;">
                        <i class="fas fa-check-circle" style="font-size: 4rem; color: #4ade80;"></i>
                        <p style="margin-top: 12px; color: var(--text-main);">WhatsApp conectado!</p>
                    </div>
                `;
            } else {
                qrContainer.innerHTML = `
                    <div style="text-align: center; padding: 32px;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: var(--gold);"></i>
                        <p style="margin-top: 12px; color: var(--text-secondary);">Gerando QR Code...</p>
                    </div>
                `;
            }
        }
        
        if (ultimaAtt && data.ultimaAtualizacao) {
            ultimaAtt.textContent = new Date(data.ultimaAtualizacao).toLocaleTimeString('pt-BR');
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar status:', error);
    }
}

async function reconectarWhatsApp() {
    if (!confirm('Tem certeza que deseja reconectar?\nIsso vai limpar a sessão atual e gerar um novo QR Code.')) return;
    
    try {
        const response = await fetch('/api/whatsapp/reconnect', { method: 'POST' });
        const data = await response.json();
        showToast(data.mensagem || 'Reconectando...', 'success');
        carregarStatusBot();
    } catch (error) {
        showToast('Erro ao reconectar', 'error');
    }
}

function atualizarDados() {
    carregarStatusBot();
    carregarEstatisticas();
}

async function enviarLembreteAgendamento() {
    const select = document.getElementById('bot-select-agendamento');
    if (!select || !select.value) return showToast('Selecione um agendamento!', 'error');
    
    const numero = select.value;
    const opt = select.options[select.selectedIndex];
    
    const nome = opt.getAttribute('data-nome').split(' ')[0]; 
    const hora = opt.getAttribute('data-hora');
    const servico = opt.getAttribute('data-servico');
    
    const mensagem = `🤝 *Olá, ${nome}!*\n\nSeu horário na *Dom Cabral Barbershop* está confirmado para hoje às *${hora}* para o serviço de *${servico}*.\n\nQualquer dúvida, estamos à disposição! 😊`;
    
    await enviarMensagemWhatsApp(numero, mensagem);
}

async function enviarTesteManual() {
    const numero = document.getElementById('bot-teste-numero').value;
    const mensagem = document.getElementById('bot-teste-mensagem').value;
    
    if (!numero || !mensagem) return showToast('Preencha o número e a mensagem', 'error');
    await enviarMensagemWhatsApp(numero, mensagem);
}

async function enviarMensagemWhatsApp(numero, mensagem) {
    const btn = document.activeElement;
    const textoOriginal = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numero, mensagem })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.mensagem, 'success');
            document.getElementById('bot-teste-numero').value = '';
            document.getElementById('bot-teste-mensagem').value = '';
        } else {
            showToast(data.detail || 'Erro ao enviar', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão ao enviar', 'error');
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
        carregarEstatisticas(); 
    }
}

async function carregarAgendamentosSelect() {
    try {
        const response = await fetch('/whatsapp/agendamentos-para-teste');
        const agendamentos = await response.json();
        
        const select = document.getElementById('bot-select-agendamento');
        if (select) {
            if (agendamentos.length === 0) {
                select.innerHTML = '<option value="">Nenhum agendamento futuro com WhatsApp</option>';
            } else {
                select.innerHTML = '<option value="">Selecione um agendamento...</option>' +
                    agendamentos.map(a => `<option value="${a.whatsapp}" data-nome="${a.nome}" data-hora="${a.hora}" data-servico="${a.servico}">${a.nome} - ${a.data} ${a.hora}</option>`).join('');
            }
        }
    } catch (error) {}
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('bot')?.classList.contains('active')) {
        initBotModule();
    }
});