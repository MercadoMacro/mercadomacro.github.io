// === FUNÇÕES DE VALIDAÇÃO GERAIS ===
function validateNumericInput(inputId, errorId, allowZero = false, isInteger = false) {
    const inputElement = document.getElementById(inputId);
    const errorElement = document.getElementById(errorId);
    if (!inputElement) return null;

    const valueStr = inputElement.value.replace(',', '.');
    const value = parseFloat(valueStr);
    let isValid = !isNaN(value) && (allowZero ? value >= 0 : value > 0);
    
    if (isInteger && !Number.isInteger(value) && value !== 0) {
        if (valueStr.includes('.') && parseFloat(valueStr.split('.')[1]) !== 0) {
            isValid = false;
        }
    }

    if (!isValid) {
        if (errorElement) {
            errorElement.textContent = `Valor inválido para ${inputElement.labels[0] ? inputElement.labels[0].textContent.replace(':', '') : inputId}.`;
            errorElement.style.display = 'block';
        }
        if(inputElement) inputElement.classList.add('invalid');
        return null;
    }
    if (errorElement) errorElement.style.display = 'none';
    if(inputElement) inputElement.classList.remove('invalid');
    return value;
}

// === FUNÇÕES DA CALCULADORA DE PREÇO MÉDIO ===
document.addEventListener('DOMContentLoaded', function() {
    let pm_operationCount = 1; // Renomeado para escopo local
    const priceAverageCalc = document.getElementById('price-average-calc');

    if (priceAverageCalc) {
        const addOperationBtn = document.getElementById('add-operation');
        if (addOperationBtn) {
            addOperationBtn.addEventListener('click', function() {
                const operationsContainer = document.getElementById('operations-container');
                pm_operationCount = operationsContainer.children.length + 1;
                const newOperation = document.createElement('div');
                newOperation.className = 'operation-card new-operation';
                newOperation.id = 'operation' + pm_operationCount;
                newOperation.innerHTML = `
                    <div class="operation-header">
                        <div class="operation-number">${pm_operationCount}</div>
                        <button class="remove-operation" aria-label="Remover operação"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="input-group">
                        <label for="quantity${pm_operationCount}">Quantidade</label>
                        <div class="input-field">
                            <i class="fas fa-hashtag"></i>
                            <input type="number" id="quantity${pm_operationCount}" placeholder="Ex: 100" step="any" min="0" required>
                        </div>
                        <div class="error-message" id="quantity-error${pm_operationCount}"></div>
                    </div>
                    <div class="input-group">
                        <label for="price${pm_operationCount}">Preço Unitário (R$)</label>
                        <div class="input-field">
                            <i class="fas fa-dollar-sign"></i>
                            <input type="number" id="price${pm_operationCount}" placeholder="Ex: 25.50" step="0.01" min="0" required>
                        </div>
                        <div class="error-message" id="price-error${pm_operationCount}"></div>
                    </div>
                `;
                operationsContainer.appendChild(newOperation);
                newOperation.querySelector('.remove-operation').addEventListener('click', function() {
                    removeOperationCard(this.closest('.operation-card'));
                });
                addRealTimeValidation(newOperation.querySelectorAll('input[required]'));
            });
        }

        const calculateAverageBtn = document.getElementById('calculate-average');
        if (calculateAverageBtn) {
            calculateAverageBtn.addEventListener('click', function() {
                const button = this;
                const originalButtonText = button.innerHTML;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...';
                button.disabled = true;
                setTimeout(() => {
                    let totalQuantity = 0; let totalInvestment = 0; let hasError = false;
                    document.querySelectorAll('#operations-container .operation-card').forEach((card) => {
                        const quantityInput = card.querySelector(`input[id^="quantity"]`);
                        const priceInput = card.querySelector(`input[id^="price"]`);
                        const quantityError = card.querySelector(`.error-message[id^="quantity-error"]`);
                        const priceError = card.querySelector(`.error-message[id^="price-error"]`);
                        const quantity = validateNumericInput(quantityInput.id, quantityError.id);
                        const price = validateNumericInput(priceInput.id, priceError.id);
                        if (quantity === null || price === null) hasError = true;
                        else { totalQuantity += quantity; totalInvestment += quantity * price; }
                    });
                    const currentQuantityVal = document.getElementById('current-quantity').value;
                    const currentPriceVal = document.getElementById('current-price').value;
                    const currentQuantity = currentQuantityVal ? parseFloat(currentQuantityVal.replace(',', '.')) : 0;
                    const currentPrice = currentPriceVal ? parseFloat(currentPriceVal.replace(',', '.')) : 0;
                    if (currentQuantity < 0 && currentQuantityVal) { showToast("Quantidade atual não pode ser negativa.", true, 3000); hasError = true; }
                    if (currentPrice < 0 && currentPriceVal) { showToast("Preço médio atual não pode ser negativo.", true, 3000); hasError = true; }
                    if (currentQuantity > 0 && currentPrice > 0) {
                        totalQuantity += currentQuantity; totalInvestment += currentQuantity * currentPrice;
                    } else if ((currentQuantityVal && !currentPriceVal && currentQuantity > 0) || (!currentQuantityVal && currentPriceVal && currentPrice > 0 )) {
                        if (!hasError) { showToast("Para posição atual, preencha Quantidade e Preço Médio válidos.", true, 5000); hasError = true; }
                    }
                    if (hasError || totalQuantity === 0) {
                        document.getElementById('average-results').style.display = 'none';
                        if(totalQuantity === 0 && !hasError) showToast("Nenhuma operação válida para calcular.", true);
                    } else {
                        const averagePrice = totalInvestment / totalQuantity;
                        document.getElementById('total-quantity').textContent = totalQuantity.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 4});
                        document.getElementById('total-investment').textContent = formatCurrency(totalInvestment);
                        document.getElementById('average-price').textContent = formatCurrency(averagePrice);
                        document.getElementById('average-results').style.display = 'block';
                    }
                    button.innerHTML = originalButtonText; button.disabled = false;
                }, 200);
            });
        }
        const firstRemoveButton = document.querySelector('#operation1 .remove-operation');
        if (firstRemoveButton) {
            firstRemoveButton.addEventListener('click', function() { removeOperationCard(this.closest('.operation-card')); });
        }
        const clearAverageBtn = document.getElementById('clear-average-calc');
        if (clearAverageBtn) clearAverageBtn.addEventListener('click', clearPriceAverageInputs);
    }
});

function removeOperationCard(operationCardElement) {
    const operationsContainer = document.getElementById('operations-container');
    if (operationsContainer.querySelectorAll('.operation-card').length > 1) {
        operationCardElement.remove();
        const remainingCards = operationsContainer.querySelectorAll('.operation-card');
        remainingCards.forEach((card, index) => {
            const currentOpNumber = index + 1;
            card.id = 'operation' + currentOpNumber;
            card.querySelector('.operation-number').textContent = currentOpNumber;
            card.querySelector('label[for^="quantity"]').setAttribute('for', 'quantity' + currentOpNumber);
            const qtyInput = card.querySelector('input[id^="quantity"]'); if(qtyInput) qtyInput.id = 'quantity' + currentOpNumber;
            const qtyError = card.querySelector('div[id^="quantity-error"]'); if(qtyError) qtyError.id = 'quantity-error' + currentOpNumber;
            card.querySelector('label[for^="price"]').setAttribute('for', 'price' + currentOpNumber);
            const priceInput = card.querySelector('input[id^="price"]'); if(priceInput) priceInput.id = 'price' + currentOpNumber;
            const priceError = card.querySelector('div[id^="price-error"]'); if(priceError) priceError.id = 'price-error' + currentOpNumber;
        });
    } else {
        showToast('Pelo menos uma operação é necessária.', true);
    }
}

function clearPriceAverageInputs() {
    const operationsContainer = document.getElementById('operations-container');
    if (operationsContainer) { while (operationsContainer.children.length > 1) operationsContainer.removeChild(operationsContainer.lastChild); }
    ['quantity1', 'price1', 'current-quantity', 'current-price'].forEach(id => { const el = document.getElementById(id); if (el) { el.value = ''; el.classList.remove('invalid'); } });
    ['quantity-error1', 'price-error1'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    const resultsDiv = document.getElementById('average-results'); if(resultsDiv) resultsDiv.style.display = 'none';
    const firstOpNum = document.querySelector('#operation1 .operation-number'); if(firstOpNum) firstOpNum.textContent = '1';
    showToast('Campos da Calculadora de Preço Médio Limpos!');
}

const amortCalcButton = document.getElementById('calculate-amortization');
if (amortCalcButton) amortCalcButton.addEventListener('click', calculateAmortization);
const clearAmortizationButton = document.getElementById('clear-amortization-calc');
if(clearAmortizationButton) clearAmortizationButton.addEventListener('click', clearAmortizationInputs);

function calculateAmortization(event) {
    const button = event ? event.target.closest('button') : document.getElementById('calculate-amortization');
    const originalButtonText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...'; button.disabled = true;
    setTimeout(() => {
        const amount = validateNumericInput('loan-amount', null);
        const annualRatePercent = validateNumericInput('loan-rate', null);
        const termYears = validateNumericInput('loan-term', null, false, true);
        const typeEl = document.getElementById('loan-type'); const type = typeEl ? typeEl.value : 'price';
        if (amount === null || annualRatePercent === null || termYears === null) {
            showToast('Preencha todos os campos com valores válidos.', true);
        } else {
            const annualRate = annualRatePercent / 100; const monthlyRate = annualRate / 12; const months = termYears * 12;
            let installment = 0, totalInterest = 0;
            if (type === 'price') {
                if (monthlyRate === 0) installment = months > 0 ? amount / months : 0;
                else installment = amount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
                if (months > 0) totalInterest = (installment * months) - amount; else totalInterest = 0;
            } else {
                if (months > 0) {
                    const amortization = amount / months; let balance = amount; let firstInstallment = 0;
                    for (let i = 1; i <= months; i++) {
                        const interest = balance * monthlyRate; let currentInstallment = amortization + interest;
                        totalInterest += interest; balance -= amortization;
                        if (i === 1) firstInstallment = currentInstallment;
                    }
                    installment = firstInstallment;
                }
            }
            document.getElementById('monthly-payment').textContent = formatCurrency(installment);
            document.getElementById('total-loan-interest').textContent = formatCurrency(totalInterest);
            document.getElementById('total-paid').textContent = formatCurrency(amount + totalInterest);
            document.getElementById('amortization-result').style.display = 'block';
        }
        button.innerHTML = originalButtonText; button.disabled = false;
    }, 200);
}
function clearAmortizationInputs() {
    ['loan-amount', 'loan-rate', 'loan-term'].forEach(id => { const el = document.getElementById(id); if(el) el.value = '';});
    const loanTypeEl = document.getElementById('loan-type'); if(loanTypeEl) loanTypeEl.value = 'price';
    const resultEl = document.getElementById('amortization-result'); if(resultEl) resultEl.style.display = 'none';
    showToast('Campos da Calculadora de Amortização Limpos!');
}

const cdbCalcButton = document.getElementById('calculate-cdb');
if (cdbCalcButton) cdbCalcButton.addEventListener('click', calculateCDB);
const clearCdbButton = document.getElementById('clear-cdb-calc');
if(clearCdbButton) clearCdbButton.addEventListener('click', clearCDBInputs);

function calculateCDB(event) {
    const button = event ? event.target.closest('button') : document.getElementById('calculate-cdb');
    const originalButtonText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...'; button.disabled = true;
    setTimeout(() => {
        const amount = validateNumericInput('cdb-amount', null);
        const ratePercent = validateNumericInput('cdb-rate', null);
        const days = validateNumericInput('cdb-days', null, false, true);
        const typeEl = document.getElementById('cdb-type'); const type = typeEl ? typeEl.value : 'cdb';
        if (amount === null || ratePercent === null || days === null) {
            showToast('Preencha todos os campos com valores válidos.', true);
        } else {
            const annualRate = ratePercent / 100; const dailyRate = Math.pow(1 + annualRate, 1/252) - 1;
            const grossValue = amount * Math.pow(1 + dailyRate, days * (252/365.25) );
            const grossEarnings = grossValue - amount; let taxRate = 0;
            if (type === 'cdb') {
                if (days <= 180) taxRate = 0.225; else if (days <= 360) taxRate = 0.20;
                else if (days <= 720) taxRate = 0.175; else taxRate = 0.15;
            }
            const tax = grossEarnings * taxRate; const netEarnings = grossEarnings - tax; const netValue = amount + netEarnings;
            document.getElementById('cdb-gross').textContent = formatCurrency(grossEarnings);
            document.getElementById('cdb-tax').textContent = formatCurrency(tax);
            document.getElementById('cdb-net').textContent = formatCurrency(netEarnings);
            document.getElementById('cdb-final').textContent = formatCurrency(netValue);
            document.getElementById('cdb-result').style.display = 'block';
        }
        button.innerHTML = originalButtonText; button.disabled = false;
    }, 200);
}
function clearCDBInputs() {
    ['cdb-amount', 'cdb-rate', 'cdb-days'].forEach(id => { const el = document.getElementById(id); if(el) el.value = '';});
    const cdbTypeEl = document.getElementById('cdb-type'); if(cdbTypeEl) cdbTypeEl.value = 'cdb';
    const resultEl = document.getElementById('cdb-result'); if(resultEl) resultEl.style.display = 'none';
    showToast('Campos da Calculadora de CDB/LCI/LCA Limpos!');
}

const compoundCalcButton = document.getElementById('calculate-compound');
if(compoundCalcButton) compoundCalcButton.addEventListener('click', calculateCompoundInterest);
const clearCompoundButton = document.getElementById('clear-compound-calc');
if(clearCompoundButton) clearCompoundButton.addEventListener('click', clearCompoundInterestInputs);

function calculateCompoundInterest(event) {
    const button = event ? event.target.closest('button') : document.getElementById('calculate-compound');
    const originalButtonText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...'; button.disabled = true;
    setTimeout(() => {
        const principal = validateNumericInput('principal', null, true);
        const monthlyStr = document.getElementById('monthly').value.replace(',', '.');
        const monthly = monthlyStr === '' ? 0 : parseFloat(monthlyStr);
        const ratePercent = validateNumericInput('rate', null);
        const timeYears = validateNumericInput('time', null, false, true);
        if (principal === null || ratePercent === null || timeYears === null || isNaN(monthly) || monthly < 0) {
            showToast('Preencha os campos com valores válidos. Aporte mensal deve ser zero ou positivo.', true);
        } else {
            const annualRate = ratePercent / 100; const monthlyRate = Math.pow(1 + annualRate, 1/12) - 1;
            const nPeriods = timeYears * 12;
            let finalAmount = principal * Math.pow(1 + monthlyRate, nPeriods);
            if (monthly > 0 && monthlyRate > 0) finalAmount += monthly * ((Math.pow(1 + monthlyRate, nPeriods) - 1) / monthlyRate) * (1 + monthlyRate);
            else if (monthly > 0 && monthlyRate === 0) finalAmount += monthly * nPeriods;
            const totalInvested = principal + (monthly * nPeriods);
            const totalInterest = finalAmount - totalInvested;
            document.getElementById('total-invested').textContent = formatCurrency(totalInvested);
            document.getElementById('total-interest').textContent = formatCurrency(totalInterest);
            document.getElementById('final-amount').textContent = formatCurrency(finalAmount);
            document.getElementById('compound-result').style.display = 'block';
        }
        button.innerHTML = originalButtonText; button.disabled = false;
    }, 200);
}
function clearCompoundInterestInputs() {
    ['principal', 'monthly', 'rate', 'time'].forEach(id => { const el = document.getElementById(id); if(el) el.value = '';});
    const resultEl = document.getElementById('compound-result'); if(resultEl) resultEl.style.display = 'none';
    showToast('Campos da Calculadora de Juros Compostos Limpos!');
}

// === FUNÇÕES UTILITÁRIAS GERAIS ===
function formatCurrency(value) {
    if (isNaN(value) || value === null) return "R$ -";
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function showToast(message, isError = false, duration = 3000) {
    const toast = document.getElementById('toast'); if(!toast) return;
    toast.textContent = message; toast.className = 'toast';
    if(isError) toast.classList.add('error-toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLightMode = document.body.classList.contains('light-mode');
    localStorage.setItem('themePreference', isLightMode ? 'light' : 'dark');
    const themeIcon = document.querySelector('#theme-toggle i');
    if (themeIcon) {
        themeIcon.classList.toggle('fa-moon', !isLightMode);
        themeIcon.classList.toggle('fa-sun', isLightMode);
    }
    showToast(`Tema ${isLightMode ? 'claro' : 'escuro'} ativado.`);
}
function setupBackToTop() {
    const backToTopButton = document.getElementById('top-btn'); if(!backToTopButton) return;
    window.addEventListener('scroll', () => backToTopButton.classList.toggle('visible', window.pageYOffset > 300));
    backToTopButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
function setupRefreshButton() {
    const refreshButton = document.getElementById('refresh-btn'); if(!refreshButton) return;
    refreshButton.addEventListener('click', function() {
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; this.disabled = true;
        setTimeout(() => window.location.reload(), 500);
    });
}
function setupHP12Modal() {
    const hp12cButton = document.getElementById('hp12cButton');
    const hp12cModal = document.getElementById('hp12cModal');
    const hp12cCloseBtn = document.getElementById('hp12cCloseBtn');
    if (!hp12cButton || !hp12cModal || !hp12cCloseBtn) return;
    hp12cButton.addEventListener('click', () => { hp12cModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; });
    hp12cCloseBtn.addEventListener('click', () => { hp12cModal.style.display = 'none'; document.body.style.overflow = 'auto'; });
    hp12cModal.addEventListener('click', e => { if (e.target === hp12cModal) { hp12cModal.style.display = 'none'; document.body.style.overflow = 'auto'; } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && hp12cModal.style.display === 'flex') { hp12cModal.style.display = 'none'; document.body.style.overflow = 'auto'; } });
}
function addRealTimeValidation(inputsNodeList) {
    inputsNodeList.forEach(input => {
        input.addEventListener('input', function() {
            const errorElementId = this.id.replace(/^(quantity|price)/, '$1-error');
            const errorElement = document.getElementById(errorElementId);
            const valueStr = this.value.replace(',', '.');
            const value = parseFloat(valueStr);
            let isValid = this.checkValidity() && !isNaN(value) && (this.min === undefined || value >= parseFloat(this.min.replace(',','.')));
             if(this.step && this.step.toLowerCase() !== 'any' && valueStr.includes('.')){
                const decimals = valueStr.split('.')[1].length;
                const stepDecimals = this.step.includes('.') ? this.step.split('.')[1].length : 0;
                if(decimals > stepDecimals) isValid = false;
            }
            if(this.required && value <= 0 && this.min !== undefined && parseFloat(this.min.replace(',','.')) === 0) {
                 if (this.id.startsWith("quantity") || this.id.startsWith("price")) { isValid = value > 0; }
            }
            this.classList.toggle('invalid', !isValid);
            if (errorElement) {
                errorElement.textContent = isValid ? '' : 'Valor inválido.';
                errorElement.style.display = isValid ? 'none' : 'block';
            }
        });
    });
}

// Inicialização Geral
document.addEventListener('DOMContentLoaded', function() {
    const savedTheme = localStorage.getItem('themePreference');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    let isLightMode = (savedTheme === 'light') || (!savedTheme && !prefersDark);
    if (isLightMode) document.body.classList.add('light-mode');
    else document.body.classList.remove('light-mode');
    const themeIcon = document.querySelector('#theme-toggle i');
    if(themeIcon){ themeIcon.classList.toggle('fa-moon', !isLightMode); themeIcon.classList.toggle('fa-sun', isLightMode); }

    const themeToggleButton = document.getElementById('theme-toggle');
    if(themeToggleButton) themeToggleButton.addEventListener('click', toggleTheme);
    const homeButton = document.getElementById('home-btn');
    if(homeButton) homeButton.addEventListener('click', () => window.location.href = 'index.html'); // Mudado para index.html

    setupHP12Modal(); setupBackToTop(); setupRefreshButton();

    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target'); const resultDiv = document.getElementById(targetId);
            if (!resultDiv) return; let textToCopy = "";
            const titleH3 = resultDiv.querySelector('h3');
            if(titleH3) textToCopy += titleH3.textContent.trim() + "\n";
            resultDiv.querySelectorAll('p').forEach(p => {
                const labelSpan = p.querySelector('span:first-child'); const valueSpan = p.querySelector('span.result-value');
                if (labelSpan && valueSpan) textToCopy += `${labelSpan.textContent.trim()} ${valueSpan.textContent.trim()}\n`;
            });
            textToCopy = textToCopy.trim();
            if (textToCopy && navigator.clipboard) {
                navigator.clipboard.writeText(textToCopy).then(() => showToast('Resultados copiados!'))
                    .catch(err => { showToast('Falha ao copiar.', true); console.error('Erro ao copiar: ', err); });
            }
        });
    });
    
    // As funções de exportação foram removidas, então setupExportButtons também
    // if(typeof setupExportButtons === "function") setupExportButtons(); 
    
    const priceAverageCalcForm = document.getElementById('price-average-calc');
    if (priceAverageCalcForm) addRealTimeValidation(priceAverageCalcForm.querySelectorAll('input[required]'));
});
