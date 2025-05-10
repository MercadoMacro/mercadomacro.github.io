// Calculadora de Preço Médio
function setupPriceAverageCalculator() {
    let operationCount = 1;

    document.getElementById('add-operation').addEventListener('click', function() {
        operationCount++;
        const newOperation = document.createElement('div');
        newOperation.className = 'operation-card';
        newOperation.id = `operation${operationCount}`;
        newOperation.innerHTML = `
            <div class="operation-header">
                <div class="operation-number">${operationCount}</div>
                <button class="remove-operation" onclick="removeOperation(${operationCount})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="input-group">
                <label>Quantidade</label>
                <input type="number" id="quantity${operationCount}" placeholder="Ex: 100" step="any" min="0">
            </div>
            <div class="input-group">
                <label>Preço Unitário (R$)</label>
                <input type="number" id="price${operationCount}" placeholder="Ex: 25.50" step="0.01" min="0">
            </div>
        `;
        document.getElementById('operations-container').appendChild(newOperation);
    });

    document.getElementById('calculate').addEventListener('click', calculateAveragePrice);
}

function calculateAveragePrice() {
    // Lógica de cálculo...
}

// Calculadora de Amortização
function setupAmortizationCalculator() {
    document.getElementById('calculate-amortization').addEventListener('click', calculateAmortization);
}

function calculateAmortization() {
    // Lógica de cálculo...
}

// Inicialização quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    setupPriceAverageCalculator();
    setupAmortizationCalculator();
    // Outras inicializações...
});