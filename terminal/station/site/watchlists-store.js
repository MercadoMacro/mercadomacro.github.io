/* Sincronização versionada; a lista antiga permanece como backup após a migração. */
globalThis.MMWatchlistsStore = class {
  constructor({ changed = () => {}, notify = () => {} } = {}) {
    this.changed = changed; this.notify = notify;
    this.user = null; this.ready = false; this.doc = null; this.active = 'main';
    this.ts = 0; this.migrating = false; this.error = ''; this.generation = 0; this.timer = null;
  }
  get core() { return globalThis.MMWatchlists; }
  get loggingOut() { return !!window.__mmLoggingOut; }
  get writable() { return this.ready && !this.migrating && !this.loggingOut; }
  get key() { return 'trader_watchlists_v1:' + this.user; }
  get tsKey() { return 'trader_watchlists_ts_v1:' + this.user; }
  get activeKey() { return 'trader_watchlists_active_v1:' + this.user; }
  get items() { return this.doc?.lists.find(l => l.id === this.active)?.items || []; }
  read(key, fallback = null) { try { const s = localStorage.getItem(key); return s == null ? fallback : JSON.parse(s); } catch { return fallback; } }
  write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* A conta ainda pode guardar a alteração. */ } }
  stamp(key) { const n = Number(this.read(key, 0)); return Number.isSafeInteger(n) && n > 0 ? n : 0; }
  persist() { this.write(this.key, this.doc); this.write(this.tsKey, this.ts); }
  state() {
    const allowed = this.ready && !this.loggingOut;
    return { user: allowed ? this.user : null, ready: allowed, writable: this.writable, migrating: allowed && this.migrating,
      active: this.active, error: this.error,
      lists: allowed ? this.doc.lists.map(l => ({ id: l.id, name: l.name, count: l.items.length })) : [] };
  }
  emit(quotes = false) { this.changed({ ...this.state(), items: this.ready && !this.loggingOut ? this.items : [], quotes }); }
  choose(id) { this.active = this.doc.lists.some(l => l.id === id) ? id : this.doc.lists[0].id; this.write(this.activeKey, this.active); }
  requireWrite() {
    if (!this.writable) throw new Error(this.migrating ? 'Preparando suas listas na conta. Aguarde a sincronização.' : 'Confirme sua conta antes de alterar as listas.');
  }
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), 1200);
  }
  async push() {
    if (!this.ready || this.loggingOut || !this.doc) return;
    const generation = this.generation, owner = this.user, ts = this.ts, migrating = this.migrating, value = this.core.clone(this.doc);
    try {
      const r = await fetch('/api/conta/dados', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: owner, k: 'watchlists', v: value, ts, migracao: migrating }) });
      if (generation !== this.generation || owner !== this.user || this.loggingOut) return;
      if (r.status === 409 && migrating) {
        const body = await r.json().catch(() => ({}));
        if (body.codigo === 'listas-existem') {
          // A migração em outro aparelho venceu. Os dados legados continuam intactos.
          try { localStorage.removeItem(this.key); localStorage.removeItem(this.tsKey); } catch { /* sem cache */ }
          this.notify('As listas já foram criadas em outro aparelho. Carregando a versão da conta.');
          await this.sync(true); return;
        }
      }
      if (r.status === 409 && !migrating) {
        const body = await r.clone().json().catch(() => ({}));
        if (body.codigo === 'versao-mais-nova') {
          // Outro aparelho gravou uma versão mais nova: a conta vale, esta alteração não foi salva.
          this.notify('Suas listas mudaram em outro aparelho. Carregando a versão da conta; refaça a última alteração se ela não aparecer.');
          await this.sync(true); return;
        }
      }
      if (r.status === 401 || r.status === 409) { this.ready = false; this.doc = null; this.emit(); throw new Error('A conta mudou. Reabra o painel.'); }
      if (!r.ok) throw new Error('Listas não sincronizadas. Use Tentar novamente.');
      this.migrating = false; this.error = ''; this.emit();
    } catch (e) {
      if (generation !== this.generation || owner !== this.user || this.loggingOut) return;
      this.error = e.message || 'Não foi possível sincronizar as listas.'; this.notify(this.error); this.emit();
    }
  }
  saveItems(items, sync = true) {
    if (sync) this.requireWrite();
    else if (!this.ready || this.loggingOut) return;
    const next = this.core.clone(this.doc), list = next.lists.find(l => l.id === this.active);
    list.items = items.map(x => ({ s: x.s, n: typeof x.n === 'string' ? x.n.slice(0,80) : '' }));
    if (!this.core.valid(next)) throw new Error('Lista inválida ou com mais de 30 ativos.');
    this.doc = next;
    if (sync) this.ts = Math.max(Date.now(), this.ts + 1);
    this.persist(); if (sync) this.schedule();
  }
  select(id) {
    if (!this.ready || this.loggingOut || !this.doc.lists.some(l => l.id === id)) return;
    this.choose(id); this.emit(true);
  }
  create(name, id) {
    this.requireWrite(); this.doc = this.core.create(this.doc, name, id); this.choose(id); this.commit(true);
  }
  rename(id, name) { this.requireWrite(); this.doc = this.core.rename(this.doc,id,name); this.commit(); }
  remove(id) {
    this.requireWrite(); this.doc = this.core.remove(this.doc,id); this.choose(this.active); this.commit(true);
  }
  commit(quotes = false) { this.ts = Math.max(Date.now(), this.ts + 1); this.persist(); this.schedule(); this.emit(quotes); }
  async sync(preferRemote = false) {
    const generation = ++this.generation; clearTimeout(this.timer); this.ready = false; this.doc = null; this.error = ''; this.emit();
    if (this.loggingOut) return;
    const current = () => generation === this.generation && !this.loggingOut;
    try {
      const r = await fetch('/api/conta/dados?k=watchlists', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) throw new Error('Não foi possível confirmar suas listas. Tente novamente.');
      const j = await r.json();
      if (!current()) return;
      if (!Number.isSafeInteger(j.usuario) || j.usuario <= 0) throw new Error('Identidade da conta não confirmada.');
      this.user = j.usuario;
      const local = preferRemote ? null : this.read(this.key), localTS = this.stamp(this.tsKey);
      const localValid = this.core.valid(local), remoteValid = this.core.valid(j.v);
      if (j.v != null && !remoteValid) throw new Error('A conta contém uma versão de listas incompatível. Reabra o painel.');
      if (remoteValid && (!Number.isSafeInteger(j.ts) || j.ts <= 0)) throw new Error('Data das listas inválida. Tente novamente.');
      let next, ts, pending = false;
      this.migrating = j.v == null;
      if (remoteValid) {
        if (localValid && localTS > j.ts && !preferRemote) { next = local; ts = localTS; pending = true; }
        else { next = j.v; ts = j.ts; }
      } else if (localValid) { next = local; ts = localTS || Date.now(); pending = true; }
      else {
        const old = await fetch('/api/conta/dados?k=watchlist', { credentials: 'same-origin', cache: 'no-store' });
        if (!old.ok) throw new Error('Não foi possível recuperar a watchlist anterior. Tente novamente.');
        const legacy = await old.json();
        if (!current()) return;
        if (legacy.usuario !== this.user) throw new Error('A conta mudou durante a migração. Reabra o painel.');
        if (legacy.v != null && !Array.isArray(legacy.v)) throw new Error('A watchlist anterior não pôde ser validada.');
        const oldLocal = this.read('trader_watchlist_v2:' + this.user), oldTS = this.stamp('trader_watchlist_ts_v2:' + this.user);
        const items = Array.isArray(oldLocal) && oldTS > (legacy.ts || 0) ? oldLocal : legacy.v;
        next = this.core.migrate(items); ts = Math.max(Date.now(), oldTS + 1, (legacy.ts || 0) + 1); pending = true;
      }
      if (!current()) return;
      this.doc = this.core.clone(next); this.ts = ts; this.choose(this.read(this.activeKey, this.active));
      this.ready = true; this.persist(); this.emit(true); if (pending) this.schedule();
    } catch (e) {
      if (!current()) return;
      this.ready = false; this.doc = null; this.error = e.message; this.emit(); this.notify(this.error);
    }
  }
};
