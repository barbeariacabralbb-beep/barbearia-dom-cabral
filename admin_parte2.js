// admin_parte2.js
let allBookings = [];
let filteredBookings = [];
let currentDeletingId = null;

const servicePrices = {
    'Corte': 50,
    'Barba': 40,
    'Combo': 80
};

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function formatCurrency(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

function getStatusBadge(status) {
    const statusMap = {
        'Agendado': { classe: 'badge-agendado', texto: '🟡 Agendado' },
        'Confirmado': { classe: 'badge-confirmado', texto: '🔵 Confirmado' },
        'Concluído': { classe: 'badge-concluido', texto: '🟢 Concluído' },
        'Cancelado': { classe: 'badge-cancelado', texto: '🔴 Cancelado' }
    };
    return statusMap[status] || statusMap['Agendado'];
}

function getPagamentoBadge(pagamento) {
    const pagamentoMap = {
        'Pendente': { classe: 'badge-pendente', texto: '🟡 Pendente' },
        'Pago': { classe: 'badge-pago', texto: '🟢 Pago' }
    };
    return pagamentoMap[pagamento] || pagamentoMap['Pendente'];
}

function showToast(mensagem, tipo) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    const icon = tipo === 'success' ? 'check-circle' : 'exclamation-circle';
    toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${mensagem}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 4000);
}

async function loadBookings() {
    try {
        const response = await fetch(`${window.API_BASE}/agendamentos`);
        if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
        
        allBookings = await response.json();
        allBookings = allBookings.map(booking => ({
            ...booking,
            status: booking.status || 'Agendado',
            status_pagamento: booking.status_pagamento || 'Pendente'
        }));
        
        allBookings.sort((a, b) => {
            const dateA = new Date(`${a.data}T${a.hora}`);
            const dateB = new Date(`${b.data}T${b.hora}`);
            return dateA - dateB;
        });
        
        filteredBookings = [...allBookings];
        renderBookings(filteredBookings);
        updateKPIs();
        updateChart();
    } catch (error) {
        console.error('Erro ao carregar agendamentos:', error);
        document.getElementById('bookings-table').innerHTML = `
            <tr><td colspan="8" class="empty-state"><div class="empty-state-icon"><i class="fas fa-exclamation-triangle"></i></div>Erro ao conectar com o servidor. Verifique se o backend está rodando.</td></tr>
        `;
    }
}

function renderBookings(bookings) {
    const tbody = document.getElementById('bookings-table');
    if (!bookings || bookings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-state-icon"><i class="fas fa-inbox"></i></div>Nenhum agendamento encontrado.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = bookings.map(booking => {
        const price = servicePrices[booking.servico] || 0;
        const statusBadge = getStatusBadge(booking.status);
        const pagamentoBadge = getPagamentoBadge(booking.status_pagamento);
        const telefoneStr = booking.telefone ? `<br><small class="text-gray-500"><i class="fab fa-whatsapp text-green-500"></i> ${booking.telefone}</small>` : '';
        
        return `
            <tr>
                <td><span class="client-name">${booking.nome}</span>${telefoneStr}</td>
                <td>${formatDate(booking.data)}</td>
                <td>${booking.hora}</td>
                <td>${booking.servico}</td>
                <td><strong>${formatCurrency(price)}</strong></td>
                <td><span class="badge ${statusBadge.classe}">${statusBadge.texto}</span></td>
                <td><span class="badge ${pagamentoBadge.classe}">${pagamentoBadge.texto}</span></td>
                <td>
                    <div class="actions-group">
                        <button class="btn-action btn-edit" title="Editar" data-id="${booking.id}" onclick="openEditModal(${booking.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-action btn-complete" title="Concluir" data-id="${booking.id}" onclick="markAsCompleted(${booking.id})"><i class="fas fa-check"></i></button>
                        <button class="btn-action btn-payment" title="Marcar como Pago" data-id="${booking.id}" onclick="markAsPaid(${booking.id})"><i class="fas fa-money-bill"></i></button>
                        <button class="btn-action btn-print" title="Imprimir" data-id="${booking.id}" onclick="printBooking(${booking.id})"><i class="fas fa-print"></i></button>
                        <button class="btn-action btn-delete" title="Deletar" data-id="${booking.id}" onclick="openDeleteModal(${booking.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateKPIs() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('total-bookings').textContent = allBookings.length;
    document.getElementById('today-bookings').textContent = allBookings.filter(b => b.data === today).length;
    
    const totalRevenue = allBookings.filter(b => b.status === 'Concluído' && b.status_pagamento === 'Pago').reduce((sum, booking) => sum + (servicePrices[booking.servico] || 0), 0);
    document.getElementById('revenue').textContent = formatCurrency(totalRevenue);
    
    const completedBookings = allBookings.filter(b => b.status === 'Concluído');
    const averageTicket = completedBookings.length > 0 ? totalRevenue / completedBookings.length : 0;
    document.getElementById('average-ticket').textContent = formatCurrency(averageTicket);
}

function updateChart() {
    const serviceCounts = {};
    allBookings.forEach(booking => { serviceCounts[booking.servico] = (serviceCounts[booking.servico] || 0) + 1; });
    const ctx = document.getElementById('servicesChart');
    if (!ctx) return;
    const canvasContext = ctx.getContext('2d');
    if (window.servicesChartInstance) window.servicesChartInstance.destroy();
    
    window.servicesChartInstance = new Chart(canvasContext, {
        type: 'bar',
        data: {
            labels: Object.keys(serviceCounts),
            datasets: [{ label: 'Quantidade de Agendamentos', data: Object.values(serviceCounts), backgroundColor: ['#fbbf24', '#3b82f6', '#22c55e'], borderColor: ['#f59e0b', '#1e40af', '#15803d'], borderWidth: 2, borderRadius: 8 }]
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}

function filterByDate() {
    const dateFilter = document.getElementById('filter-date').value;
    if (!dateFilter) return showToast('Por favor, selecione uma data.', 'error');
    filteredBookings = allBookings.filter(booking => booking.data === dateFilter);
    renderBookings(filteredBookings);
    showToast(`${filteredBookings.length} agendamento(s) encontrado(s) para ${formatDate(dateFilter)}.`, 'success');
}

function resetFilter() {
    document.getElementById('filter-date').value = '';
    filteredBookings = [...allBookings];
    renderBookings(filteredBookings);
    showToast('Filtro removido. Mostrando todos os agendamentos.', 'success');
}

function openDeleteModal(id) {
    currentDeletingId = id;
    document.getElementById('deleteModal').classList.add('active');
}

async function deleteBooking() {
    if (!currentDeletingId) return;
    try {
        const response = await fetch(`${window.API_BASE}/agendamentos/${currentDeletingId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
        showToast('Agendamento cancelado com sucesso!', 'success');
        document.getElementById('deleteModal').classList.remove('active');
        loadBookings();
    } catch (error) {
        showToast('Erro ao cancelar agendamento. Tente novamente.', 'error');
    }
}

function printBooking(id) {
    const booking = allBookings.find(b => b.id === id);
    if (!booking) return;
    const printContent = `
        <html><head><title>Comprovante</title><style>body { font-family: Arial; padding: 20px; } h2 { color: #1f2937; } strong { color: #fbbf24; }</style></head>
        <body><h2>Comprovante de Agendamento</h2><p><strong>Cliente:</strong> ${booking.nome}</p>
        <p><strong>WhatsApp:</strong> ${booking.telefone || 'Não informado'}</p>
        <p><strong>Data:</strong> ${formatDate(booking.data)}</p><p><strong>Hora:</strong> ${booking.hora}</p>
        <p><strong>Serviço:</strong> ${booking.servico}</p><hr><p style="font-size: 12px; color: #9ca3af;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p></body></html>
    `;
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
}

window.addEventListener('DOMContentLoaded', function() {
    loadBookings();
    document.getElementById('btn-filter').addEventListener('click', filterByDate);
    document.getElementById('btn-clear-filter').addEventListener('click', resetFilter);
    document.getElementById('btn-close-delete').addEventListener('click', () => document.getElementById('deleteModal').classList.remove('active'));
    document.getElementById('btn-cancel-delete').addEventListener('click', () => document.getElementById('deleteModal').classList.remove('active'));
    document.getElementById('btn-confirm-delete').addEventListener('click', deleteBooking);
    setInterval(loadBookings, 30000);
});