/* Mercado Macro — motor financeiro independente, períodos uniformes. */
(function(root){
'use strict';
function value(v,r){const i=r/100;if(i<=-1||v.n<0)throw Error('Prazo ou taxa inválidos');const q=Math.exp(v.n*Math.log1p(i));const a=Math.abs(i)<1e-12?v.n:Math.expm1(v.n*Math.log1p(i))/i;return v.PV*q+v.PMT*(v.begin?1+i:1)*a+v.FV;}
function bisect(fn,a,b){let fa=fn(a),fb=fn(b);if(!Number.isFinite(fa)||!Number.isFinite(fb)||fa*fb>0)throw Error('Não foi encontrada uma solução neste intervalo');for(let j=0;j<200;j++){const m=(a+b)/2,f=fn(m);if(!Number.isFinite(f))throw Error('Resultado fora do limite');if(Math.abs(b-a)<1e-10*Math.max(1,Math.abs(m)))return m;if(f===0)return m;if(fa*f<=0){b=m;fb=f;}else{a=m;fa=f;}}return(a+b)/2;}
function solve(v,k){if(k==='i')return bisect(r=>value(v,r),-99.9,1000);if(k==='n')return bisect(n=>value({...v,n},v.i),0,10000);const z={...v,[k]:0},a=value(z,v.i),b=value({...z,[k]:1},v.i)-a;if(Math.abs(b)<1e-14)throw Error('Sem solução única');const out=-a/b;if(!Number.isFinite(out))throw Error('Resultado fora do limite');return out;}
function npv(flows,r){if(r<=-100)throw Error('Taxa deve superar −100%');return flows.reduce((a,c,t)=>a+c/Math.pow(1+r/100,t),0);}
function irr(flows){let changes=0;const nonzero=flows.filter(x=>x!==0);for(let j=1;j<nonzero.length;j++)if(nonzero[j]*nonzero[j-1]<0)changes++;if(changes!==1)throw Error('TIR exige uma única mudança de sinal nesta versão');return bisect(r=>npv(flows,r),-99.9,1000);}
const api={value,solve,npv,irr};if(typeof module==='object')module.exports=api;else root.MMFinance=api;
})(typeof globalThis==='object'?globalThis:this);
