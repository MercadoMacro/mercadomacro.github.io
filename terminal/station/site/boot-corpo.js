/* Logo no começo do <body> (saiu do index.html em 22/11/2026, regra de scripts). */
/* barra lateral: recolhida só se a pessoa recolheu (o app.js monta a barra) */ try { if (localStorage.getItem('trader_side_collapsed') === '1') document.body.classList.add('side-collapsed'); } catch (e) { /* sem armazenamento */ }
