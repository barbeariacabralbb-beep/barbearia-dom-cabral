// admin_configuracoes.js

function formatarDataBR(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

async function loadBloqueios() {
    const tbody = document.getElementById('bloqueios-table');
    if (!tbody) return;
    
    try {
        // Usando window.API_BASE em vez de criar uma constante local
        const response = await fetch(`${window.API_BASE}/bloqueios`);
        if (!response.ok) throw new Error('Erro na API');
        
        const bloqueios = await response.json();
        
        if (bloqueios.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center py-8 text-gray-500">Nenhum dia bloqueado. Agenda aberta.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = bloqueios.map(bloqueio => `
            <tr style="border-bottom: 1px solid rgba(230, 195, 122, 0.1);">
                <td style="padding: 16px; font-weight: 600; color: var(--text-main);">${formatarDataBR(bloqueio.data)}</td>
                <td style="padding: 16px; color: var(--text-secondary);">${bloqueio.motivo}</td>
                <td style="padding: 16px; text-align: center;">
                    <button class="btn-action btn-complete" onclick="desbloquearData(${bloqueio.id})" title="Desbloquear Dia">
                        <i class="fas fa-unlock"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Erro:', error);
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-red-500 py-4">Erro ao carregar bloqueios</td></tr>`;
    }
}

async function criarBloqueio(event) {
    event.preventDefault();
    
    const dados = {
        data: document.getElementById('data-bloqueio').value,
        motivo: document.getElementById('motivo-bloqueio').value
    };
    
    try {
        const response = await fetch(`${window.API_BASE}/bloqueios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        
        if (!response.ok) throw new Error('Erro ao criar');
        
        document.getElementById('form-bloqueio').reset();
        loadBloqueios();
        alert('✅ Data bloqueada! Ninguém poderá agendar neste dia.');
        
    } catch (error) {
        console.error('Erro:', error);
        alert('❌ Erro ao bloquear data.');
    }
}

async function desbloquearData(id) {
    if(!confirm('Deseja liberar esta data para os clientes agendarem novamente?')) return;
    
    try {
        const response = await fetch(`${window.API_BASE}/bloqueios/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Erro ao desbloquear');
        loadBloqueios();
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao desbloquear data.');
    }
}

// Liga a função de salvar de forma direta
const formBloqueio = document.getElementById('form-bloqueio');
if (formBloqueio) {
    formBloqueio.onsubmit = criarBloqueio;
}

const configObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.attributeName === 'class') {
            const configTab = document.getElementById('configuracoes');
            if (configTab && configTab.classList.contains('active')) loadBloqueios();
        }
    });
});

const configTab = document.getElementById('configuracoes');
if (configTab) {
    if (configTab.classList.contains('active')) {
        loadBloqueios();
    } else {
        configObserver.observe(configTab, { attributes: true });
    }
}