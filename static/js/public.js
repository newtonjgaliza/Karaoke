document.getElementById('requestForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    
    // Add visual loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-text">Enviando...</span>';

    const data = {
        name: document.getElementById('name').value,
        song: document.getElementById('song').value,
        reference: document.getElementById('reference').value,
        extra_info: document.getElementById('extra_info').value
    };

    fetch('/api/requests', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.error || 'Erro ao enviar pedido.'); });
        }
        return response.json();
    })
    .then(result => {
        // Show success modal
        document.getElementById('successModal').style.display = 'flex';
        
        // Reset form except Name (people usually sing multiple times, so keeping their name is nice!)
        document.getElementById('song').value = '';
        document.getElementById('reference').value = '';
        document.getElementById('extra_info').value = '';
    })
    .catch(error => {
        alert(error.message);
    })
    .finally(() => {
        // Reset button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    });
});

function closeModal() {
    document.getElementById('successModal').style.display = 'none';
    // Focus back on song name input for convenience
    document.getElementById('song').focus();
}
