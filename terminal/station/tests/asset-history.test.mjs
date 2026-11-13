import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../site/asset-history.js',import.meta.url),'utf8');
function setup(){
 const charts=[];
 const L={AreaSeries:{type:'Area'},CrosshairMode:{Normal:0},createChart(host,config){
  const chart={config,destroyed:false,series:[],fits:0,
   remove(){this.destroyed=true;},
   addSeries(type,options){const s={type,options,data:[],setData(data){this.data=data;}};this.series.push(s);return s;},
   timeScale(){return {fitContent:()=>{this.fits++;}};},
   subscribeCrosshairMove(fn){this.crosshair=fn;}
  };charts.push(chart);return chart;
 }};
 const ctx=vm.createContext({LightweightCharts:L});vm.runInContext(code,ctx);return {core:ctx.MMAssetHistory,charts};
}
function box(){const nodes=new Map();const make=()=>({textContent:'',dataset:{},setAttribute(){},addEventListener(type,fn){this[type]=fn;}});for(const k of ['.wlh-canvas','.wlh-legend','[data-reset]','.wlh-caption','.wlh-note','button'])nodes.set(k,make());const buttons=[{...make(),dataset:{days:'31'}},{...make(),dataset:{days:'93'}}];return {innerHTML:'',querySelector:k=>nodes.get(k),querySelectorAll:()=>buttons,buttons,nodes};}
const series={t:[1700000000,1700100000,1700200000],c:[20,21,19],off:0};
test('VIX, Mexico and other international indices default to own history without symbol substitution',()=>{
 const {core}=setup();for(const [sym,tv]of [['^VIX','TVC:VIX'],['^MXX','BMV:ME'],['^GSPC','SP:SPX'],['^GDAXI','XETR:DAX'],['FTSEMIB.MI','INDEX:FTSEMIB'],['DX-Y.NYB','TVC:DXY']])assert.equal(core.defaultMode(sym,tv),'history');
 assert.equal(core.defaultMode('AAPL','AAPL'),'tradingview');assert.equal(core.defaultMode('PETR4.SA','BMFBOVESPA:PETR4'),'tradingview');
});
test('history sanitizes aligned data without turning missing closes into zero',()=>{
 const {core}=setup();assert.deepEqual(Array.from(core.points({t:[3,1,2,4,5],c:[30,10,null,Infinity,0]}),x=>[x.t,x.c]),[[1,10],[3,30],[5,0]]);
 assert.equal(core.points({t:[1,2],c:[10]}).length,0);assert.equal(core.points({error:'offline'}).length,0);
});
test('trading date honors exchange offset instead of the viewer local timezone',()=>{
 const {core}=setup();assert.equal(core.date(Date.parse('2026-10-16T01:00:00Z')/1000,-10800),'15/10/2026');
});
test('viewer requests exact Yahoo symbol, plots actual closes and caches subsequent opens',async()=>{
 const {core,charts}=setup();let calls=0;const v=new core.Viewer(async symbol=>{calls++;assert.equal(symbol,'^VIX');return {'^VIX':series};});const b=box();await v.show(b,'^VIX','VIX',false);
 assert.equal(charts.length,1);assert.deepEqual(Array.from(charts[0].series[0].data.map(p=>p.value)),[20,21,19]);assert.match(b.nodes.get('.wlh-note').textContent,/Até /);assert.match(b.nodes.get('.wlh-caption').textContent,/Yahoo/);
 await v.show(b,'^VIX','VIX',true);assert.equal(calls,1);assert.equal(charts[0].destroyed,true);
});
test('closing or switching assets ignores late history responses',async()=>{
 const {core,charts}=setup();let resolve;const v=new core.Viewer(()=>new Promise(r=>{resolve=r;}));const b=box();const pending=v.show(b,'^MXX','IPC',false);await Promise.resolve();v.destroy();const before=b.innerHTML;resolve({'^MXX':series});await pending;assert.equal(charts.length,0);assert.equal(b.innerHTML,before);
});
test('source failure or missing requested symbol shows a retry rather than another asset',async()=>{
 const {core,charts}=setup();for(const response of [{'^OTHER':series},{'^VIX':{error:'offline'}}]){const b=box();const v=new core.Viewer(async()=>response);await v.show(b,'^VIX','VIX',false);assert.match(b.innerHTML,/Tentar novamente/);assert.equal(charts.length,0);}
});
test('range controls update Lightweight Charts without creating a second canvas',async()=>{
 const {core,charts}=setup();const raw={t:[1700000000,1700000000+50*86400,1700000000+60*86400],c:[1,2,3]};const v=new core.Viewer(async()=>({TEST:raw}));const b=box();await v.show(b,'TEST','Test',false);b.buttons[0].click();assert.equal(charts[0].destroyed,false);assert.equal(charts.length,1);assert.deepEqual(Array.from(charts.at(-1).series[0].data.map(p=>p.value)),[2,3]);
});
function integration(){
 const extras=readFileSync(new URL('../site/extras.js',import.meta.url),'utf8'),fragment=extras.slice(extras.indexOf('  const TV_MAP ='),extras.indexOf('  css.textContent +=',extras.indexOf('  const TV_MAP =')));
 const calls=[],scripts=[],nodes=[];const classes={contains:()=>false,add(){},remove(){}};
 const chart={innerHTML:'',replaceChildren(){this.innerHTML='';},querySelector(){return {appendChild(s){scripts.push(s);}};}};
 const ctx=vm.createContext({window:{MMAssetHistory:{canEmbed:setup().core.canEmbed,defaultMode:setup().core.defaultMode,Viewer:class{destroy(){}show(box,sym){calls.push(sym);}}}},wl:[],wlMemo:{},nice:s=>s,esc:s=>s,PROXY:'https://api.test',getJSON(){throw Error('unexpected');},setTimeout(){},requestAnimationFrame:fn=>fn(),document:{activeElement:{},body:{classList:classes,appendChild(){}},addEventListener(){},createElement(){const node={dataset:{},classList:classes,hidden:true,addEventListener(k,fn){this[k]=fn;},querySelector:s=>s==='.wlc-chart'?chart:s==='.wlc-head'?{}:null};nodes.push(node);return node;}}});vm.runInContext(fragment,ctx);return {ctx,calls,scripts,nodes};
}
test('Mesa modal never mounts the TradingView widget for VIX or IPC by default',()=>{
 const u=integration();u.ctx.window.openAssetChart('^VIX','VIX');u.ctx.window.openAssetChart('^MXX','IPC');assert.deepEqual(u.calls,['^VIX','^MXX']);assert.equal(u.scripts.length,0);
});
test('manual history button and widget script failure keep the original symbol',()=>{
 const u=integration();u.ctx.window.openAssetChart('AAPL','Apple');assert.equal(u.scripts.length,1);u.scripts[0].onerror();assert.deepEqual(u.calls,['AAPL']);
 u.ctx.window.openAssetChart('PETR4.SA','Petrobras');u.nodes[0].click({target:{closest:()=>({dataset:{wlc:'history'}})}});assert.equal(u.calls.at(-1),'PETR4.SA');
});

test('known restricted symbols cannot reopen the broken embed through navigation context',()=>{const u=integration();vm.runInContext('wlChart("^VIX",{_chartMode:"tradingview"})',u.ctx);assert.equal(u.scripts.length,0);assert.deepEqual(u.calls,['^VIX']);});
const mesaSource=readFileSync(new URL('../site/mesa.js',import.meta.url),'utf8');
const catalogCode=mesaSource.slice(mesaSource.indexOf('  const CRYPTO ='),mesaSource.indexOf('  /* ---------------- dados'));
function mesaSymbols(){const ctx=vm.createContext({});vm.runInContext(catalogCode+';globalThis.symbols=SYMS;',ctx);return Array.from(ctx.symbols);}
test('all 72 current Mesa symbols route to own history and never create an embed',()=>{
 const symbols=mesaSymbols(),u=integration();assert.equal(symbols.length,72);
 for(const sym of symbols)u.ctx.window.openAssetChart(sym,sym,null,null,'mesa');
 assert.equal(u.scripts.length,0);assert.deepEqual(u.calls,symbols);
});
test('all futures including ES, YM, RTY and NQ cannot embed even with an advanced context',()=>{
 const u=integration();for(const sym of mesaSymbols().filter(s=>s.endsWith('=F')))vm.runInContext('wlChart('+JSON.stringify(sym)+',{_chartMode:"tradingview"})',u.ctx);
 assert.equal(u.scripts.length,0);for(const sym of ['ES=F','YM=F','NQ=F','RTY=F'])assert.ok(u.calls.includes(sym));
});
test('Mesa click handler explicitly identifies its chart context',()=>{
 const calls=[],ctx=vm.createContext({Q:{},window:{openAssetChart:(...args)=>calls.push(args)}});
 const source=mesaSource.slice(mesaSource.indexOf('  function openChart('),mesaSource.indexOf('  const listOf ='));
 vm.runInContext(source+';openChart("ES=F","S&P 500 futuro",[]);',ctx);assert.equal(calls[0][4],'mesa');assert.equal(calls[0][0],'ES=F');
});

test('Lightweight Charts receives sorted unique exchange calendar days',()=>{
 const {core}=setup();const values=[{t:Date.parse('2026-10-16T01:00Z')/1000,c:10},{t:Date.parse('2026-10-16T02:00Z')/1000,c:11},{t:Date.parse('2026-10-17T01:00Z')/1000,c:12}];
 const data=core.seriesData(values,-10800);assert.deepEqual(Array.from(data,p=>[p.time,p.value]),[['2026-10-15',11],['2026-10-16',12]]);
});
test('chart enables zoom, pan, attribution and a reset control',async()=>{
 const {core,charts}=setup();const b=box(),v=new core.Viewer(async()=>({TEST:series}));await v.show(b,'TEST','Test',false);
 const chart=charts[0];assert.equal(chart.config.autoSize,true);assert.equal(chart.config.layout.attributionLogo,true);assert.equal(chart.config.handleScale.pinch,true);assert.equal(chart.config.handleScroll.pressedMouseMove,true);
 const fits=chart.fits;b.nodes.get('[data-reset]').click();assert.equal(chart.fits,fits+1);assert.match(b.innerHTML,/Copyright \(с\) 2025 TradingView/);
});
test('crosshair exposes actual selected date and value without changing the data',async()=>{
 const {core,charts}=setup();const b=box(),v=new core.Viewer(async()=>({TEST:series}));await v.show(b,'TEST','Test',false);
 const chart=charts[0],line=chart.series[0];chart.crosshair({time:'2026-10-16',seriesData:new Map([[line,{value:12.5}]])});
 assert.match(b.nodes.get('.wlh-legend').textContent,/16\/10\/2026/);assert.match(b.nodes.get('.wlh-legend').textContent,/12,50/);assert.equal(line.data.length,3);
});
