// admin_clientes.js
function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

async function loadClientes() {
    const tbody = document.getElementById('clientes-table');
    if (!tbody) return;
    try {
        const response = await fetch(`${window.API_BASE}/clientes`);
        if (!response.ok) throw new Error('Erro ao carregar clientes');
        const clientes = await response.json();
        
        if (clientes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="empty-state-icon"><i class="fas fa-users"></i></div>Nenhum cliente encontrado.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = clientes.map(cliente => `
            <tr>
                <td class="client-name"><i class="fas fa-user-circle text-amber-400 mr-2"></i>${cliente.nome}</td>
                <td class="text-center">${cliente.total_agendamentos}</td>
                <td class="text-center"><span class="badge badge-concluido">${cliente.concluidos}</span></td>
                <td>${cliente.ultima_visita || '-'}</td>
                <td><button class="btn-action btn-edit" onclick="verHistoricoCliente('${cliente.nome}')" title="Ver histórico"><i class="fas fa-history"></i></button></td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="empty-state-icon"><i class="fas fa-exclamation-triangle"></i></div>Erro ao carregar clientes.</td></tr>`;
    }
}

async function verHistoricoCliente(nome) {
    try {
        const response = await fetch(`${window.API_BASE}/clientes/${encodeURIComponent(nome)}/historico`);
        if (!response.ok) throw new Error('Erro ao carregar histórico');
        const historico = await response.json();
        
        let modalHtml = `
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="modal-historico">
                <div class="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
                    <div class="p-6 border-b border-gray-200 flex justify-between items-center">
                        <h3 class="text-xl font-bold text-gray-800"><i class="fas fa-history text-amber-400 mr-2"></i>Histórico - ${nome}</h3>
                        <button onclick="fecharModalHistorico()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                    </div>
                    <div class="p-6 overflow-y-auto max-h-[60vh]">
                        <table class="w-full">
                            <thead class="bg-gray-50"><tr><th class="text-left p-3">Data</th><th class="text-left p-3">Hora</th><th class="text-left p-3">Serviço</th><th class="text-left p-3">Status</th></tr></thead>
                            <tbody>
        `;
        
        historico.forEach(item => {
            modalHtml += `
                <tr class="border-b">
                    <td class="p-3">${formatDate(item.data)}</td><td class="p-3">${item.hora}</td>
                    <td class="p-3">${item.servico}</td><td class="p-3"><span class="badge badge-${item.status === 'Concluído' ? 'concluido' : 'agendado'}">${item.status}</span></td>
                </tr>
            `;
        });
        
        modalHtml += `</tbody></table></div><div class="p-4 border-t border-gray-200 bg-gray-50"><button onclick="fecharModalHistorico()" class="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Fechar</button></div></div></div>`;
        const modalExistente = document.getElementById('modal-historico');
        if (modalExistente) modalExistente.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) { alert('Erro ao carregar histórico'); }
}

function fecharModalHistorico() {
    const modal = document.getElementById('modal-historico');
    if (modal) modal.remove();
}

const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.attributeName === 'class') {
            const clientesTab = document.getElementById('clientes');
            if (clientesTab && clientesTab.classList.contains('active')) loadClientes();
        }
    });
});
const clientesTab = document.getElementById('clientes');
if (clientesTab) {
    observer.observe(clientesTab, { attributes: true });
    if (clientesTab.classList.contains('active')) loadClientes();
}