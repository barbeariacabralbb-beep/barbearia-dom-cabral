// admin_parte3.js
let currentEditingId = null;

function openEditModal(id) {
    const booking = allBookings.find(b => b.id === id);
    if (!booking) return showToast('Agendamento não encontrado.', 'error');
    currentEditingId = id;
    
    document.getElementById('editNome').value = booking.nome;
    document.getElementById('editTelefone').value = booking.telefone || '';
    document.getElementById('editData').value = booking.data;
    document.getElementById('editHora').value = booking.hora;
    document.getElementById('editServico').value = booking.servico;
    document.getElementById('editStatus').value = booking.status || 'Agendado';
    document.getElementById('editPagamento').value = booking.status_pagamento || 'Pendente';
    
    document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    currentEditingId = null;
}

async function saveEditedBooking(event) {
    event.preventDefault();
    if (!currentEditingId) return;
    
    const updatedData = {
        nome: document.getElementById('editNome').value,
        telefone: document.getElementById('editTelefone').value.replace(/\D/g, "") || null,
        data: document.getElementById('editData').value,
        hora: document.getElementById('editHora').value,
        servico: document.getElementById('editServico').value,
        status: document.getElementById('editStatus').value,
        status_pagamento: document.getElementById('editPagamento').value
    };
    
    try {
        const response = await fetch(`${window.API_BASE}/agendamentos/${currentEditingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
        showToast('Agendamento atualizado com sucesso!', 'success');
        closeEditModal();
        loadBookings();
    } catch (error) {
        showToast('Erro ao atualizar agendamento. Tente novamente.', 'error');
    }
}

function openNewBookingModal() {
    document.getElementById('newBookingForm').reset();
    document.getElementById('newData').min = new Date().toISOString().split('T')[0];
    document.getElementById('newBookingModal').classList.add('active');
}

function closeNewBookingModal() {
    document.getElementById('newBookingModal').classList.remove('active');
}

async function createNewBooking(event) {
    event.preventDefault();
    const newBookingData = {
        nome: document.getElementById('newNome').value,
        telefone: document.getElementById('newTelefone').value.replace(/\D/g, "") || null,
        data: document.getElementById('newData').value,
        hora: document.getElementById('newHora').value,
        servico: document.getElementById('newServico').value
    };
    
    try {
        const response = await fetch(`${window.API_BASE}/agendar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newBookingData)
        });
        if (response.status === 400) return showToast('Horário indisponível.', 'error');
        if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
        showToast('Agendamento criado com sucesso!', 'success');
        closeNewBookingModal();
        loadBookings();
    } catch (error) {
        showToast('Erro ao criar agendamento.', 'error');
    }
}

async function markAsCompleted(id) {
    const booking = allBookings.find(b => b.id === id);
    if (!booking) return;
    try {
        const response = await fetch(`${window.API_BASE}/agendamentos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...booking, status: 'Concluído' })
        });
        if (!response.ok) throw new Error();
        showToast('Agendamento concluído!', 'success');
        loadBookings();
    } catch (error) { showToast('Erro ao atualizar status.', 'error'); }
}

async function markAsPaid(id) {
    const booking = allBookings.find(b => b.id === id);
    if (!booking) return;
    try {
        const response = await fetch(`${window.API_BASE}/agendamentos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...booking, status_pagamento: 'Pago' })
        });
        if (!response.ok) throw new Error();
        showToast('Agendamento pago!', 'success');
        loadBookings();
    } catch (error) { showToast('Erro ao atualizar pagamento.', 'error'); }
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('active');
    currentDeletingId = null;
}

async function confirmDelete() {
    if (!currentDeletingId) return;
    try {
        const response = await fetch(`${window.API_BASE}/agendamentos/${currentDeletingId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error();
        showToast('Agendamento cancelado!', 'success');
        closeDeleteModal();
        loadBookings();
    } catch (error) { showToast('Erro ao cancelar agendamento.', 'error'); }
}

window.addEventListener('DOMContentLoaded', function() {
    const btnNewBooking = document.getElementById('btn-new-booking');
    if (btnNewBooking) btnNewBooking.addEventListener('click', openNewBookingModal);
    
    const newBookingForm = document.getElementById('newBookingForm');
    if (newBookingForm) newBookingForm.addEventListener('submit', createNewBooking);
    
    const btnCloseNew = document.getElementById('btn-close-new');
    if (btnCloseNew) btnCloseNew.addEventListener('click', closeNewBookingModal);
    
    const btnCancelNew = document.getElementById('btn-cancel-new');
    if (btnCancelNew) btnCancelNew.addEventListener('click', closeNewBookingModal);
    
    const editForm = document.getElementById('editForm');
    if (editForm) editForm.addEventListener('submit', saveEditedBooking);
    
    const btnCloseEdit = document.getElementById('btn-close-edit');
    if (btnCloseEdit) btnCloseEdit.addEventListener('click', closeEditModal);
    
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    if (btnCancelEdit) btnCancelEdit.addEventListener('click', closeEditModal);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeEditModal(); closeNewBookingModal(); closeDeleteModal(); }
});