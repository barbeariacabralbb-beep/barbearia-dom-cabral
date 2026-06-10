// admin_servicos.js
const API_BASE_SERVICOS = window.location.origin;

function formatCurrency(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

async function loadServicos() {
    const tbody = document.getElementById('servicos-table');
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4" style="color: var(--gold);">Carregando serviços...</td></tr>`;
    
    try {
        const response = await fetch(`${API_BASE_SERVICOS}/servicos`);
        if (!response.ok) throw new Error('Erro ao carregar serviços');
        
        const servicos = await response.json();
        
        if (servicos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><div class="empty-state-icon"><i class="fas fa-scissors"></i></div>Nenhum serviço cadastrado.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = servicos.map(servico => `
            <tr>
                <td style="color: var(--text-main); font-weight: 600;">${servico.nome}</td>
                <td style="color: var(--text-secondary);">${servico.tempo} min</td>
                <td style="color: var(--gold); font-weight: bold;">${formatCurrency(servico.valor)}</td>
                <td class="text-center">
                    <button class="btn-action btn-delete" onclick="deletarServico(${servico.id})" title="Deletar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Erro:', error);
        tbody.innerHTML = `<tr><td colspan="4" class="text-red-500 text-center py-4">Erro ao carregar serviços</td></tr>`;
    }
}

async function criarServico(event) {
    event.preventDefault(); // Impede a página de recarregar e quebrar o código
    
    const dados = {
        nome: document.getElementById('servicoNome').value,
        tempo: parseInt(document.getElementById('servicoTempo').value),
        valor: parseFloat(document.getElementById('servicoValor').value.replace(',', '.'))
    };
    
    try {
        const response = await fetch(`${API_BASE_SERVICOS}/servicos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        
        if (!response.ok) throw new Error('Erro ao criar');
        
        document.getElementById('newServiceModal').classList.remove('active');
        document.getElementById('newServiceForm').reset();
        
        loadServicos(); // Atualiza a tabela na hora
        alert('✅ Serviço criado com sucesso!');
        
    } catch (error) {
        console.error('Erro:', error);
        alert('❌ Erro ao criar serviço');
    }
}

async function deletarServico(id) {
    if(!confirm('Tem certeza que deseja excluir este serviço?')) return;
    
    try {
        const response = await fetch(`${API_BASE_SERVICOS}/servicos/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Erro ao deletar');
        loadServicos();
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao deletar serviço');
    }
}

// ===== CORREÇÃO: Liga a função de salvar de forma direta! =====
const formServico = document.getElementById('newServiceForm');
if (formServico) {
    formServico.onsubmit = criarServico;
}

// Observa quando a aba Serviços é ativada
const servicosObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.attributeName === 'class') {
            const servicosTab = document.getElementById('servicos');
            if (servicosTab && servicosTab.classList.contains('active')) loadServicos();
        }
    });
});

const servicosTab = document.getElementById('servicos');
if (servicosTab) {
    if (servicosTab.classList.contains('active')) {
        loadServicos();
    } else {
        servicosObserver.observe(servicosTab, { attributes: true });
    }
}