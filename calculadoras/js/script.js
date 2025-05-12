
        // === FUNÇÕES DA CALCULADORA DE PREÇO MÉDIO ===
        document.addEventListener('DOMContentLoaded', function() {
            let operationCount = 1;

            // Adicionar nova operação
            document.getElementById('add-operation').addEventListener('click', function() {
                operationCount++;
                const newOperation = document.createElement('div');
                newOperation.className = 'operation-card';
                newOperation.id = 'operation' + operationCount;
                newOperation.innerHTML = `
                    <div class="operation-header">
                        <div class="operation-number">${operationCount}</div>
                        <button class="remove-operation" onclick="removeOperation(${operationCount})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="input-group">
                        <label>Quantidade</label>
                        <div class="input-field">
                            <i class="fas fa-hashtag"></i>
                            <input type="number" id="quantity${operationCount}" placeholder="Ex: 100" step="any" min="0">
                        </div>
                        <div class="error-message" id="quantity-error${operationCount}"></div>
                    </div>

                    <div class="input-group">
                        <label>Preço Unitário (R$)</label>
                        <div class="input-field">
                            <i class="fas fa-dollar-sign"></i>
                            <input type="number" id="price${operationCount}" placeholder="Ex: 25.50" step="0.01" min="0">
                        </div>
                        <div class="error-message" id="price-error${operationCount}"></div>
                    </div>
                `;
                document.getElementById('operations-container').appendChild(newOperation);
            });

            // Calcular preço médio
            document.getElementById('calculate').addEventListener('click', function() {
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
                document.getElementById('total-investment').textContent = 'R$ ' + totalInvestment.toFixed(2);
                document.getElementById('average-price').textContent = 'R$ ' + averagePrice.toFixed(2);

                document.getElementById('results').style.display = 'block';
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
        function formatCurrency(value) {
            return value.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            });
        }

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

        // === FUNÇÕES DE UI DA PÁGINA PRINCIPAL ===
        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
                document.getElementById('fullscreen-btn').style.display = 'none';
                document.getElementById('fullscreen-exit-btn').style.display = 'flex';
            } else {
                document.exitFullscreen();
                document.getElementById('fullscreen-exit-btn').style.display = 'none';
                document.getElementById('fullscreen-btn').style.display = 'flex';
            }
        }

        function toggleTheme() {
            document.body.classList.toggle('light-mode');
            const isLightMode = document.body.classList.contains('light-mode');
            localStorage.setItem('themePreference', isLightMode ? 'light' : 'dark');

            const themeIcon = document.querySelector('#theme-toggle i');
            themeIcon.classList.toggle('fa-moon', !isLightMode);
            themeIcon.classList.toggle('fa-sun', isLightMode);
        }

        // Controle do modal
        const hp12cButton = document.getElementById('hp12cButton');
        const hp12cModal = document.getElementById('hp12cModal');
        const hp12cCloseBtn = document.getElementById('hp12cCloseBtn');

        hp12cButton.addEventListener('click', function() {
            hp12cModal.style.display = 'flex';
            document.body.style.overflow = 'hidden'; // Impede rolagem da página principal
        });

        hp12cCloseBtn.addEventListener('click', function() {
            hp12cModal.style.display = 'none';
            document.body.style.overflow = 'auto'; // Restaura rolagem
        });

        // Fechar modal ao clicar fora
        hp12cModal.addEventListener('click', function(e) {
            if (e.target === hp12cModal) {
                hp12cModal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });

        // Inicialização
        document.addEventListener('DOMContentLoaded', function() {
            // Configurar tema salvo
            if (localStorage.getItem('themePreference') === 'light') {
                document.body.classList.add('light-mode');
                document.querySelector('#theme-toggle i').classList.add('fa-sun');
                document.querySelector('#theme-toggle i').classList.remove('fa-moon');
            }

            // Configurar botões
            document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
            document.getElementById('fullscreen-exit-btn').addEventListener('click', toggleFullscreen);
            document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

            // Botões de navegação
            document.getElementById('analises-btn').addEventListener('click', function() {
                window.location.href = '/analises.html';
            });

            document.getElementById('indicadores-btn').addEventListener('click', function() {
                window.location.href = '/indicadores.html';
            });

            document.getElementById('home-btn').addEventListener('click', function() {
                window.location.href = '/index.html';
            });
        });
    