// Caixa das Notícias Agrícolas (na-caixa.html): manda o HTML que o widget escreveu para a página que abriu a caixa.
// Roda dentro do quadro com sandbox; o terminal só aceita a mensagem vinda deste quadro e lê o HTML sem executar nada.
try { parent.postMessage({ tipo: 'mm-na', html: document.body.innerHTML.slice(0, 300000) }, '*'); } catch (e) { /* sem quem ouvir */ }
