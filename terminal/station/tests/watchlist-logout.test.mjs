import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const extras = read('site/extras.js');
const watchCode = extras.slice(extras.indexOf('  const WL3_KEY ='), extras.indexOf('  const inWl ='));
function watch({ user = 2, remote = null, ts = 0, local = [], fail = false } = {}) {
  const data = new Map(local), writes = [], timers = new Map();
  let timer = 0;
  const ctx = vm.createContext({
    localStorage: { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) },
    window: {}, document: { getElementById: () => null },
    setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id),
    wlRender() {}, wlStars() {}, wlRefresh() {}, say() {},
    fetch: async (url, opts) => {
      if (fail) throw new Error('offline');
      if (opts.method === 'PUT') { writes.push(JSON.parse(opts.body)); return { ok: true }; }
      return { ok: true, json: async () => ({ usuario: user, v: remote, ts }) };
    }
  });
  vm.runInContext(watchCode, ctx);
  return { ctx, data, writes, run: code => vm.runInContext(code, ctx), flush: async () => {
    for (const [id, fn] of [...timers]) { timers.delete(id); await fn(); }
    await new Promise(resolve => setImmediate(resolve));
  } };
}
test('legacy list is not uploaded to a new account and remains available locally', async () => {
  const legacy = JSON.stringify([{s:'PETR4.SA'}]);
  const w = watch({local:[['trader_watchlist_v1',legacy],['trader_watchlist_ts','999999']]});
  await w.run('wlSync()'); await w.flush();
  assert.equal(w.run('wl.length'), 0); assert.equal(w.writes.length, 0);
  assert.equal(w.data.get('trader_watchlist_v1'), legacy);
});
test('account B does not load scoped cache belonging to account A', async () => {
  const w = watch({local:[['trader_watchlist_v2:1','[{"s":"PETR4.SA"}]'],['trader_watchlist_ts_v2:1','1000']]});
  await w.run('wlSync()'); await w.flush();
  assert.equal(w.run('wl.length'), 0); assert.equal(w.writes.length, 0);
});
test('remote list is loaded into its own account cache', async () => {
  const w = watch({remote:[{s:'AAPL'}],ts:2000}); await w.run('wlSync()');
  assert.equal(w.run('wl[0].s'), 'AAPL');
  assert.equal(JSON.parse(w.data.get('trader_watchlist_v2:2'))[0].s, 'AAPL');
});
test('newer cache from the same account can sync, including empty-list deletion', async () => {
  const w = watch({remote:[{s:'AAPL'}],ts:1000,local:[['trader_watchlist_v2:2','[]'],['trader_watchlist_ts_v2:2','2000']]});
  await w.run('wlSync()'); await w.flush();
  assert.equal(w.writes[0].usuario,2); assert.deepEqual(w.writes[0].v,[]);
});
test('identity failure blocks local data loading and upload', async () => {
  const w = watch({fail:true}); await w.run('wlSync();'); w.run('wlSave();'); await w.flush();
  assert.equal(w.run('wlReady'),false); assert.equal(w.writes.length,0); assert.equal(w.data.size,0);
});
test('pending sync is not sent while logging out', async () => {
  const w = watch(); await w.run('wlSync()'); w.run("wl = [{s:'AAPL'}]; wlSave(); window.__mmLoggingOut = true;");
  await w.flush(); assert.equal(w.writes.length,0);
});
const server = read('src/index.js');
const apiCode = server.slice(server.indexOf('const CHAVES_DADOS'),server.indexOf('/* ---------------- cadastro, login'));
test('server rejects a stale tab from another user before any write', async () => {
  let writes=0;
  const ctx = vm.createContext({URL, json:(o,status=200)=>({o,status}),mesmaOrigem:()=>true});
  vm.runInContext(apiCode,ctx);
  ctx.req = new Request('https://mercadomacro.com.br/api/conta/dados',{method:'PUT',body:JSON.stringify({usuario:1,k:'watchlist',v:[{s:'AAPL'}],ts:2000})});
  ctx.env={DB:{prepare(){writes++;throw new Error('Must not write');}}}; ctx.u={id:2};
  assert.equal((await vm.runInContext('apiDados(req,env,u)',ctx)).status,409); assert.equal(writes,0);
});
test('server accepts a write for the current account', async () => {
  let bound;
  const statement={bind(...args){bound=args;return this;},async run(){return {};}};
  const ctx = vm.createContext({URL,json:(o,status=200)=>({o,status}),mesmaOrigem:()=>true});
  vm.runInContext(apiCode,ctx);
  ctx.req=new Request('https://mercadomacro.com.br/api/conta/dados',{method:'PUT',body:JSON.stringify({usuario:2,k:'watchlist',v:[{s:'AAPL'}],ts:2000})});
  ctx.env={DB:{prepare:()=>statement}};ctx.u={id:2};
  assert.equal((await vm.runInContext('apiDados(req,env,u)',ctx)).status,200);assert.equal(bound[0],2);
});
const settings = read('site/ajustes.js');
const logoutCode = settings.slice(settings.indexOf("    if (act === 'sair') {"),settings.indexOf("    if (act === 'backup')"));
async function logout(fetch) {
  const alerts=[], redirects=[];
  const ctx=vm.createContext({act:'sair',b:{disabled:false},window:{},AbortController,setTimeout,clearTimeout,fetch,
    toast:t=>alerts.push(t),location:{replace:p=>redirects.push(p)},navigator:{}});
  vm.runInContext('(function(){'+logoutCode+'})()',ctx);
  await new Promise(resolve=>setImmediate(resolve));
  return {ctx,alerts,redirects};
}
for (const [name, fetch] of [
  ['network failure',async()=>{throw Error('offline');}],
  ['HTTP error',async()=>({ok:false})],
  ['unconfirmed body',async()=>({ok:true,json:async()=>({ok:false})})]
]) test('logout stays on page and allows retry on '+name,async()=>{
  const l=await logout(fetch);assert.equal(l.redirects.length,0);assert.equal(l.alerts.length,1);
  assert.equal(l.ctx.b.disabled,false);assert.equal(l.ctx.window.__mmLoggingOut,false);
});
test('confirmed logout redirects to login',async()=>{
  const l=await logout(async()=>({ok:true,json:async()=>({ok:true})}));
  assert.deepEqual(l.redirects,['/entrar']);assert.equal(l.alerts.length,0);
});
