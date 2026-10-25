import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const app=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../site/estilo.css',import.meta.url),'utf8');
const code=app.slice(app.indexOf('/* Orientação global:'));
let click,stored,focused=false;const nodes=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{textContent:'',setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},addEventListener(type,fn){if(key==='button'&&type==='click')click=fn},querySelector:node});return nodes.get(key)};
const panels=Object.fromEntries(['market','mesa','watch','heatmap','news','weekly','calendar','analysis','fund','indicators','calculator','options'].map(k=>[k+'-panel',{id:k+'-panel',setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]}}]));
const context={document:{createElement:()=>({querySelector:node}),body:{prepend(){},classList:{toggle(k,v){focused=v}}},querySelector:s=>s==='.topbar'?{after(){}}:s==='.tab-panel.active'?panels['market-panel']:null,querySelectorAll:()=>Object.values(panels)},window:{},localStorage:{getItem:()=>null,setItem:(k,v)=>stored=v}};
vm.runInNewContext(code,context);
for(const id of Object.keys(panels)){context.window.__onTabSwitch(id);assert.ok(node('h1').textContent);assert.equal(panels[id]['aria-describedby'],'mm-page-description');}
click();assert.equal(focused,true);assert.equal(stored,'1');click();assert.equal(focused,false);
function luminance(hex){return hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)}
for(const [text,bg] of [['edf2f5','1c2733'],['a6b7c5','1c2733'],['20332f','fcfcf8'],['526c62','fcfcf8'],['9bded8','1c2733'],['1b655d','fcfcf8']]){const a=luminance(text),b=luminance(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${text}/${bg}`)}
assert.match(css,/prefers-reduced-motion/);console.log('PASS: orientação nas 12 abas, modo foco e persistência, seis combinações de contraste >= 4,5:1.');
