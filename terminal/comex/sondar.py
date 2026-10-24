"""Sonda temporária da API do Comex Stat (lista campos de detalhe e filtros)."""
import json, sys
sys.path.insert(0, 'terminal/comex')
from gerar_comex import pedir
for p in ('/general/details', '/general/filters', '/general/metrics'):
    try: print(p, json.dumps(pedir(p), ensure_ascii=False)[:3000])
    except SystemExit as e: print(p, e)
r = pedir('/general', {'flow': 'export', 'monthDetail': True, 'period': {'from': '2026-08', 'to': '2026-09'}, 'filters': [{'filter': 'heading', 'values': ['2601', '1201']}], 'details': ['heading'], 'metrics': ['metricFOB', 'metricKG']})
print('heading', json.dumps(r, ensure_ascii=False)[:1500])
r = pedir('/general', {'flow': 'export', 'monthDetail': False, 'period': {'from': '2026-09', 'to': '2026-09'}, 'filters': [], 'details': ['country'], 'metrics': ['metricFOB']})
print('country', json.dumps(r, ensure_ascii=False)[:1500])
