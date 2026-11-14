
const form = document.getElementById('jade-whatsapp');
const status = document.getElementById('jade-status');
const link = document.getElementById('jade-abrir');
const unlink = document.getElementById('jade-desvincular');
const generate = form.querySelector('[type=submit]');
let canUnlink = false;

async function update(method) {
  link.hidden = true;
  link.removeAttribute('href');
  generate.disabled = unlink.disabled = true;
  try {
    const response = await fetch('/api/conta/jade-whatsapp', { method, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.erro || 'Não foi possível consultar o vínculo.');
    if (data.link) {
      canUnlink = true;
      link.href = data.link;
      link.hidden = false;
      status.textContent = 'Abra o WhatsApp e envie a mensagem em até cinco minutos.';
    } else {
      canUnlink = data.vinculado || data.pendente;
      status.textContent = data.vinculado ? 'WhatsApp vinculado.' : 'WhatsApp sem vínculo.';
    }
  } catch (error) {
    status.textContent = error.message;
  } finally {
    generate.disabled = false;
    unlink.disabled = !canUnlink;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  void update('POST');
});
unlink.addEventListener('click', () => void update('DELETE'));
window.addEventListener('focus', () => { if (link.hidden) void update('GET'); });
void update('GET');
