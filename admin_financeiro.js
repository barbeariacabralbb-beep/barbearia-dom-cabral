// admin_financeiro.js
let revenueChart = null;

function formatCurrency(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

async function loadFinanceiro() {
    console.log('Carregando financeiro...');
    try {
        // Usando window.API_BASE para evitar erro de escopo
        const response = await fetch(`${window.API_BASE}/financeiro/resumo`);
        if (!response.ok) throw new Error('Erro ao carregar dados');
        
        const data = await response.json();
        console.log('Dados financeiros:', data);
        
        document.getElementById('receita-total').innerHTML = `
            <div class="text-2xl font-bold text-green-600">${formatCurrency(data.receita_total)}</div>
            <div class="text-sm text-gray-500 mt-1">Total acumulado</div>
        `;
        
        document.getElementById('receita-mes').innerHTML = `
            <div class="text-2xl font-bold text-amber-600">${formatCurrency(data.receita_mes)}</div>
            <div class="text-sm text-gray-500 mt-1">Este mês</div>
        `;
        
        document.getElementById('pagamentos-pendentes').innerHTML = `
            <div class="text-2xl font-bold text-orange-600">${data.pendentes}</div>
            <div class="text-sm text-gray-500 mt-1">Agendamentos pendentes</div>
        `;
        
        document.getElementById('ticket-medio').innerHTML = `
            <div class="text-2xl font-bold text-purple-600">${formatCurrency(data.ticket_medio)}</div>
            <div class="text-sm text-gray-500 mt-1">Ticket médio</div>
        `;
        
        await loadRevenueChart();
        
    } catch (error) {
        console.error('Erro:', error);
        const elementos = ['receita-total', 'receita-mes', 'pagamentos-pendentes', 'ticket-medio'];
        elementos.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<div class="text-red-500">Erro ao carregar</div>`;
        });
    }
}

async function loadRevenueChart() {
    try {
        // Usando window.API_BASE para evitar erro de escopo
        const response = await fetch(`${window.API_BASE}/financeiro/receita-por-mes`);
        if (!response.ok) throw new Error('Erro ao carregar gráfico');
        
        const data = await response.json();
        console.log('Dados do gráfico:', data);
        
        const ctx = document.getElementById('revenueChart');
        if (!ctx) return;
        
        const meses = data.map(item => {
            const [ano, mes] = item.mes.split('-');
            const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            return `${nomesMeses[parseInt(mes)-1]}/${ano}`;
        });
        
        const valores = data.map(item => item.receita);
        
        if (revenueChart) {
            revenueChart.destroy();
        }
        
        revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: meses,
                datasets: [{
                    label: 'Receita (R$)',
                    data: valores,
                    borderColor: '#fbbf24',
                    backgroundColor: 'rgba(251, 191, 36, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#f97316',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Receita: ${formatCurrency(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Erro ao carregar gráfico:', error);
    }
}

// Observa quando a aba Financeiro é ativada
const financeiroObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.attributeName === 'class') {
            const financeiroTab = document.getElementById('financeiro');
            if (financeiroTab && financeiroTab.classList.contains('active')) {
                loadFinanceiro();
            }
        }
    });
});

const financeiroTab = document.getElementById('financeiro');
if (financeiroTab) {
    financeiroObserver.observe(financeiroTab, { attributes: true });
    if (financeiroTab.classList.contains('active')) {
        loadFinanceiro();
    }
}