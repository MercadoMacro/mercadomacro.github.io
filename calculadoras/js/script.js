// === FUNÇÕES DA CALCULADORA DE PREÇO MÉDIO ===
document.addEventListener('DOMContentLoaded', function() {
    let operationCount = 1;

    // Adicionar nova operação
    document.getElementById('add-operation').addEventListener('click', function() {
        operationCount++;
        const newOperation = document.createElement('div');
        newOperation.className = 'operation-card new-operation';
        newOperation.id = 'operation' + operationCount;
        newOperation.innerHTML = `
            <div class="operation-header">
                <div class="operation-number">${operationCount}</div>
                <button class="remove-operation" onclick="removeOperation(${operationCount})" aria-label="Remover operação">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="input-group">
                <label for="quantity${operationCount}">Quantidade</label>
                <div class="input-field">
                    <i class="fas fa-hashtag"></i>
                    <input type="number" id="quantity${operationCount}" placeholder="Ex: 100" step="any" min="0" required>
                </div>
                <div class="error-message" id="quantity-error${operationCount}"></div>
            </div>
            <div class="input-group">
                <label for="price${operationCount}">Preço Unitário (R$)</label>
                <div class="input-field">
                    <i class="fas fa-dollar-sign"></i>
                    <input type="number" id="price${operationCount}" placeholder="Ex: 25.50" step="0.01" min="0" required>
                </div>
                <div class="error-message" id="price-error${operationCount}"></div>
            </div>
        `;
        document.getElementById('operations-container').appendChild(newOperation);
    });

    // Calcular preço médio
    document.getElementById('calculate-average').addEventListener('click', function() {
        let totalQuantity = 0;
        let totalInvestment = 0;
        let hasError = false;

        // Validar e calcular operações
        for (let i = 1; i <= operationCount; i++) {
            const operation = document.getElementById('operation' + i);
            if (!operation) continue;

            const quantity = parseFloat(document.getElementById('quantity' + i).value);
            const price = parseFloat(document.getElementById('price' + i).value);

            // Validação
            const quantityError = document.getElementById('quantity-error' + i);
            const priceError = document.getElementById('price-error' + i);

            quantityError.style.display = 'none';
            priceError.style.display = 'none';

            if (isNaN(quantity) || quantity <= 0) {
                quantityError.textContent = 'Informe uma quantidade válida';
                quantityError.style.display = 'block';
                hasError = true;
            }

            if (isNaN(price) || price <= 0) {
                priceError.textContent = 'Informe um preço válido';
                priceError.style.display = 'block';
                hasError = true;
            }

            if (!isNaN(quantity)) totalQuantity += quantity;
            if (!isNaN(price)) totalInvestment += quantity * price;
        }

        // Considerar posição atual se informada
        const currentQuantity = parseFloat(document.getElementById('current-quantity').value);
        const currentPrice = parseFloat(document.getElementById('current-price').value);

        if (!isNaN(currentQuantity)) {
            totalQuantity += currentQuantity;
            if (!isNaN(currentPrice)) {
                totalInvestment += currentQuantity * currentPrice;
            }
        }

        if (hasError) return;

        // Calcular e exibir resultados
        const averagePrice = totalInvestment / totalQuantity;

        document.getElementById('total-quantity').textContent = totalQuantity.toFixed(2);
        document.getElementById('total-investment').textContent = formatCurrency(totalInvestment);
        document.getElementById('average-price').textContent = formatCurrency(averagePrice);

        document.getElementById('average-results').style.display = 'block';
    });
});

// Função para remover operação
function removeOperation(id) {
    const operation = document.getElementById('operation' + id);
    if (operation && document.querySelectorAll('.operation-card').length > 1) {
        operation.remove();

        // Renumerar as operações restantes
        const operations = document.querySelectorAll('.operation-card');
        operations.forEach((op, index) => {
            const opNumber = index + 1;
            op.id = 'operation' + opNumber;
            op.querySelector('.operation-number').textContent = opNumber;
            op.querySelector('.remove-operation').setAttribute('onclick', `removeOperation(${opNumber})`);

            // Atualizar IDs dos inputs
            const inputs = op.querySelectorAll('input');
            inputs[0].id = 'quantity' + opNumber;
            inputs[1].id = 'price' + opNumber;

            // Atualizar IDs das mensagens de erro
            const errors = op.querySelectorAll('.error-message');
            errors[0].id = 'quantity-error' + opNumber;
            errors[1].id = 'price-error' + opNumber;
        });

        operationCount = operations.length;
    }
}

// === FUNÇÕES DA CALCULADORA DE AMORTIZAÇÃO ===
function calculateAmortization() {
    const amount = parseFloat(document.getElementById('loan-amount').value);
    const annualRate = parseFloat(document.getElementById('loan-rate').value) / 100;
    const term = parseInt(document.getElementById('loan-term').value);
    const type = document.getElementById('loan-type').value;

    const monthlyRate = annualRate / 12;
    const months = term * 12;
    let installment, totalInterest = 0;

    if (type === 'price') {
        // Sistema Price
        installment = amount * (monthlyRate * Math.pow(1 + monthlyRate, months)) /
                     (Math.pow(1 + monthlyRate, months) - 1);

        totalInterest = (installment * months) - amount;
    } else {
        // Sistema SAC
        const amortization = amount / months;
        let balance = amount;
        let totalInstallment = 0;

        for (let i = 1; i <= months; i++) {
            const interest = balance * monthlyRate;
            installment = amortization + interest;
            totalInterest += interest;
            balance -= amortization;

            if (i === 1) {
                totalInstallment = installment;
            }
        }

        installment = totalInstallment; // Mostra a primeira parcela
    }

    document.getElementById('monthly-payment').textContent = formatCurrency(installment);
    document.getElementById('total-loan-interest').textContent = formatCurrency(totalInterest);
    document.getElementById('total-paid').textContent = formatCurrency(amount + totalInterest);
    document.getElementById('amortization-result').style.display = 'block';
}

// === FUNÇÕES DA CALCULADORA DE CDB/LCI/LCA ===
function calculateCDB() {
    const amount = parseFloat(document.getElementById('cdb-amount').value);
    const rate = parseFloat(document.getElementById('cdb-rate').value) / 100;
    const days = parseInt(document.getElementById('cdb-days').value);
    const type = document.getElementById('cdb-type').value;

    // Calcular rendimento bruto
    const dailyRate = Math.pow(1 + rate, 1/365) - 1;
    const grossValue = amount * Math.pow(1 + dailyRate, days);
    const grossEarnings = grossValue - amount;

    // Calcular imposto (se aplicável)
    let taxRate = 0;
    if (type === 'cdb') {
        if (days <= 180) taxRate = 0.225;
        else if (days <= 360) taxRate = 0.20;
        else if (days <= 720) taxRate = 0.175;
        else taxRate = 0.15;
    }

    const tax = grossEarnings * taxRate;
    const netEarnings = grossEarnings - tax;
    const netValue = amount + netEarnings;

    document.getElementById('cdb-gross').textContent = formatCurrency(grossEarnings);
    document.getElementById('cdb-tax').textContent = formatCurrency(tax);
    document.getElementById('cdb-net').textContent = formatCurrency(netEarnings);
    document.getElementById('cdb-final').textContent = formatCurrency(netValue);
    document.getElementById('cdb-result').style.display = 'block';
}

// === FUNÇÕES DA CALCULADORA DE JUROS COMPOSTOS ===
function calculateCompoundInterest() {
    const principal = parseFloat(document.getElementById('principal').value);
    const monthly = parseFloat(document.getElementById('monthly').value) || 0;
    const rate = parseFloat(document.getElementById('rate').value) / 100;
    const time = parseInt(document.getElementById('time').value);

    const monthlyRate = Math.pow(1 + rate, 1/12) - 1;
    let amount = principal;
    let totalInvested = principal;

    for (let year = 1; year <= time; year++) {
        for (let month = 1; month <= 12; month++) {
            amount = amount * (1 + monthlyRate) + monthly;
            totalInvested += monthly;
        }
    }

    const interest = amount - totalInvested;

    document.getElementById('total-invested').textContent = formatCurrency(totalInvested);
    document.getElementById('total-interest').textContent = formatCurrency(interest);
    document.getElementById('final-amount').textContent = formatCurrency(amount);
    document.getElementById('compound-result').style.display = 'block';
}

// === FUNÇÕES DE EXPORTAÇÃO ===
function setupExportButtons() {
    document.querySelectorAll('.export-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const format = this.getAttribute('data-format');
            const target = this.getAttribute('data-target');
            const resultDiv = document.getElementById(target);
            
            switch(format) {
                case 'pdf':
                    exportToPDF(resultDiv);
                    break;
                case 'csv':
                    exportToCSV(resultDiv);
                    break;
                case 'image':
                    exportToImage(resultDiv);
                    break;
            }
        });
    });
}

function exportToPDF(element) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Título
    const title = element.querySelector('h3').textContent;
    doc.setFontSize(16);
    doc.text(title, 10, 10);
    
    // Conteúdo
    doc.setFontSize(12);
    const lines = element.querySelectorAll('p');
    let yPosition = 20;
    
    lines.forEach(line => {
        const text = line.textContent.trim();
        doc.text(text, 10, yPosition);
        yPosition += 7;
    });
    
    // Salvar
    doc.save('resultado-financeiro.pdf');
    showToast('PDF gerado com sucesso!');
}

function exportToCSV(element) {
    const title = element.querySelector('h3').textContent;
    const lines = element.querySelectorAll('p');
    let csvContent = "Dados,Valores\n";
    
    lines.forEach(line => {
        const spans = line.querySelectorAll('span');
        const label = spans[0].textContent.replace(':', '').trim();
        const value = spans[1].textContent.trim();
        csvContent += `"${label}","${value}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'resultado-financeiro.csv');
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('CSV gerado com sucesso!');
}

function exportToImage(element) {
    html2canvas(element).then(canvas => {
        const link = document.createElement('a');
        link.download = 'resultado-financeiro.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('Imagem gerada com sucesso!');
    });
}

// === FUNÇÕES UTILITÁRIAS ===
function formatCurrency(value) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLightMode = document.body.classList.contains('light-mode');
    localStorage.setItem('themePreference', isLightMode ? 'light' : 'dark');

    const themeIcon = document.querySelector('#theme-toggle i');
    themeIcon.classList.toggle('fa-moon', !isLightMode);
    themeIcon.classList.toggle('fa-sun', isLightMode);
    
    showToast(`Tema ${isLightMode ? 'claro' : 'escuro'} ativado`);
}

// Configurar botão "Voltar ao Topo"
function setupBackToTop() {
    const backToTopButton = document.getElementById('top-btn');
    
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            backToTopButton.classList.add('visible');
        } else {
            backToTopButton.classList.remove('visible');
        }
    });
    
    backToTopButton.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// Configurar botão de atualizar
function setupRefreshButton() {
    document.getElementById('refresh-btn').addEventListener('click', function() {
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        this.disabled = true;
        
        setTimeout(() => {
            window.location.reload();
        }, 500);
    });
}

// Configurar modal HP12C
function setupHP12Modal() {
    const hp12cButton = document.getElementById('hp12cButton');
    const hp12cModal = document.getElementById('hp12cModal');
    const hp12cCloseBtn = document.getElementById('hp12cCloseBtn');

    hp12cButton.addEventListener('click', function() {
        hp12cModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    });

    hp12cCloseBtn.addEventListener('click', function() {
        hp12cModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    });

    hp12cModal.addEventListener('click', function(e) {
        if (e.target === hp12cModal) {
            hp12cModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });
}

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    // Configurar tema salvo
    if (localStorage.getItem('themePreference') === 'light') {
        document.body.classList.add('light-mode');
        document.querySelector('#theme-toggle i').classList.add('fa-sun');
        document.querySelector('#theme-toggle i').classList.remove('fa-moon');
    }

    // Configurar botões
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Botão home
    document.getElementById('home-btn').addEventListener('click', function() {
        window.location.href = 'index.html';
    });

    // Configurar modal HP12C
    setupHP12Modal();

    // Configurar botões de UI
    setupBackToTop();
    setupRefreshButton();

    // Configurar botões de copiar
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const target = this.getAttribute('data-target');
            const resultDiv = document.getElementById(target);
            const textToCopy = resultDiv.textContent.replace('Copiar Resultados', '').trim();
            
            navigator.clipboard.writeText(textToCopy).then(() => {
                showToast('Resultados copiados!');
            });
        });
    });

    // Configurar botões de exportação
    setupExportButtons();

    // Validação em tempo real
    document.querySelectorAll('input[required]').forEach(input => {
        input.addEventListener('input', function() {
            this.classList.toggle('invalid', !this.checkValidity());
        });
    });
});

// Evento para fechar o modal com ESC
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('hp12cModal').style.display === 'flex') {
        document.getElementById('hp12cModal').style.display = 'none';
        document.body.style.overflow = 'auto';
    }
});