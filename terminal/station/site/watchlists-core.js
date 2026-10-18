globalThis.MMWatchlists = (() => {
  const MAX_LISTS = 10, MAX_ITEMS = 30;
  const name = s => String(s || '').trim().replace(/\s+/g, ' ');
  const fold = s => name(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const itemValid = x => x && typeof x.s === 'string' && x.s.length > 0 && x.s.length <= 24 && (x.n == null || typeof x.n === 'string' && x.n.length <= 80);
  function valid(doc) {
    if (!doc || doc.version !== 1 || !Array.isArray(doc.lists) || !doc.lists.length || doc.lists.length > MAX_LISTS) return false;
    const ids = new Set(), names = new Set();
    return doc.lists.every(l => {
      if (!l || typeof l.id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(l.id) || ids.has(l.id) || typeof l.name !== 'string' || !name(l.name) || l.name.length > 30 || names.has(fold(l.name)) || !Array.isArray(l.items) || l.items.length > MAX_ITEMS || !l.items.every(itemValid) || new Set(l.items.map(x => x.s)).size !== l.items.length) return false;
      ids.add(l.id); names.add(fold(l.name)); return true;
    });
  }
  const clone = doc => ({ version: 1, lists: doc.lists.map(l => ({ id: l.id, name: name(l.name), items: l.items.map(x => ({ s: x.s, n: x.n || '' })) })) });
  function migrate(items) {
    const seen = new Set(), clean = [];
    for (const x of Array.isArray(items) ? items : []) {
      if (itemValid(x) && !seen.has(x.s) && clean.length < MAX_ITEMS) { seen.add(x.s); clean.push({ s: x.s, n: x.n || '' }); }
    }
    return { version: 1, lists: [{ id: 'main', name: 'Minha lista', items: clean }] };
  }
  function checked(doc) { if (!valid(doc)) throw new Error('As listas estão inválidas. Reabra o painel.'); return clone(doc); }
  function checkName(doc, value, except) {
    const n = name(value);
    if (!n || n.length > 30) throw new Error('Use um nome com 1 a 30 caracteres.');
    if (doc.lists.some(l => l.id !== except && fold(l.name) === fold(n))) throw new Error('Já existe uma lista com esse nome.');
    return n;
  }
  function create(doc, value, id) {
    const next = checked(doc);
    if (next.lists.length >= MAX_LISTS) throw new Error('Você pode criar até 10 listas.');
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(id) || next.lists.some(l => l.id === id)) throw new Error('Não foi possível criar a lista. Tente novamente.');
    next.lists.push({ id, name: checkName(next, value), items: [] }); return next;
  }
  function rename(doc, id, value) {
    const next = checked(doc), list = next.lists.find(l => l.id === id);
    if (!list) throw new Error('A lista mudou. Tente novamente.');
    list.name = checkName(next, value, id); return next;
  }
  function remove(doc, id) {
    const next = checked(doc);
    if (next.lists.length < 2) throw new Error('Mantenha pelo menos uma lista.');
    if (!next.lists.some(l => l.id === id)) throw new Error('A lista mudou. Tente novamente.');
    next.lists = next.lists.filter(l => l.id !== id); return next;
  }
  return { MAX_LISTS, MAX_ITEMS, valid, clone, migrate, create, rename, remove };
})();
