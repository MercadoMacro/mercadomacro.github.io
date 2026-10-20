globalThis.caches = { default: { match: async () => null, put: async () => {} } };
const m = await import(process.argv[2]);
const { todas, falharam } = await m.coletarNoticias(null);
const fs = await import('fs'); fs.writeFileSync(process.argv[3], JSON.stringify(todas));
console.log('itens', todas.length, 'falharam', falharam.join(', '));
const por = {}; for (const n of todas) por[n.fonte] = (por[n.fonte] || 0) + 1; console.log(JSON.stringify(por));
