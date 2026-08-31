#!/usr/bin/env python3
"""
Gera editais/blocos.json — o mapa dos trechos condicionais do modelo.

Cada bloco é uma faixa de parágrafos (índices do modelo, que é arquivo fixo)
mais a condição que o mantém no documento. O navegador apaga o que não casa.

A "impressao" é o começo do texto do primeiro parágrafo da faixa. Serve de
trava: se o modelo for trocado sem regerar este arquivo, os índices saem do
lugar e a conferência falha — melhor parar do que emitir um edital mutilado.
"""
import json
from pathlib import Path

# (id, título legível, início, fim inclusive, condição)
# condição = (campo, [valores que MANTÊM o bloco])
BLOCOS = [
    # ── Sumário (é manual no modelo; some junto com a seção que indexa) ──
    ('sum_14_ata',      'Sumário: 14. Ata de Registro de Preços',   105, 105, ('instrumento', ['ata'])),
    ('sum_14_empenho',  'Sumário: 14. Substituição do Termo',       106, 106, ('instrumento', ['empenho'])),
    ('sum_14_contrato', 'Sumário: 14. Contrato',                    107, 107, ('instrumento', ['contrato'])),
    ('sum_anexo2_ata',      'Sumário: Anexo II — Minuta da Ata',    112, 112, ('instrumento', ['ata'])),
    ('sum_anexo2_contrato', 'Sumário: Anexo II — Minuta do Contrato', 113, 113, ('instrumento', ['contrato'])),

    # ── Corpo do edital ────────────────────────────────────────────────
    ('item_1_6_amostra', 'Item 1.6 — exigência de amostra',         143, 152, ('amostra', [True])),

    ('item_4_12_exclusivo',  'Item 4.12 — itens exclusivos ME/EPP',  316, 317, ('itensExclusivosMeEpp', [True])),
    ('item_4_12_favorecido', 'Item 4.12 — tratamento favorecido',    318, 319, ('itensExclusivosMeEpp', [False])),

    ('item_8_5_2', 'Item 8.5.2 — catálogo/marca do produto',         442, 443, ('natureza', ['aquisicao'])),

    ('sec_14_ata',      'Seção 14 — Ata de Registro de Preços',     666, 681, ('instrumento', ['ata'])),
    ('sec_14_empenho',  'Seção 14 — Substituição do Termo de Contrato', 682, 693, ('instrumento', ['empenho'])),
    ('sec_14_emp_aquis',   '  └ variante AQUISIÇÃO',                684, 688, ('natureza', ['aquisicao'])),
    ('sec_14_emp_contrat', '  └ variante CONTRATAÇÃO',              689, 693, ('natureza', ['servicos'])),
    ('sec_14_contrato', 'Seção 14 — Contrato',                      694, 711, ('instrumento', ['contrato'])),
    ('item_14_1_docs',  '  └ 14.1 com documentos antes da assinatura', 696, 697, ('docsAntesAssinatura', [True])),
    ('item_14_1_simples', '  └ 14.1 convocação direta',              698, 703, ('docsAntesAssinatura', [False])),
    ('item_14_4_garantia', '  └ 14.4 garantia contratual',           708, 711, ('garantiaContratual', [True])),

    ('item_16_servicos', 'Item 16.1 — pagamento (serviços)',         756, 757, ('natureza', ['servicos'])),
    ('item_16_aquisicao', 'Item 16.1 — pagamento (aquisição)',       758, 759, ('natureza', ['aquisicao'])),

    ('item_17_12_dotacao', 'Item 17.12 — dotação orçamentária',      803, 836, ('regime', ['contratacao'])),

    ('anexo_lista_ata',      'Lista de anexos: Minuta da Ata',       840, 840, ('instrumento', ['ata'])),
    ('anexo_lista_contrato', 'Lista de anexos: Minuta do Contrato',  841, 841, ('instrumento', ['contrato'])),

    # ── Anexo II — Minuta da Ata de Registro de Preços ─────────────────
    ('anexo2_ata', 'ANEXO II — Minuta da Ata de Registro de Preços', 1148, 1385, ('instrumento', ['ata'])),
    ('ata_cl3_servicos', '  └ Cláusula 3ª — Execução dos serviços', 1169, 1178, ('natureza', ['servicos'])),
    ('ata_cl3_entrega',  '  └ Cláusula 3ª — Entrega do objeto',     1179, 1189, ('natureza', ['aquisicao'])),

    # ── Anexo II — Minuta do Contrato ──────────────────────────────────
    ('anexo2_contrato', 'ANEXO II — Minuta do Contrato',            1386, 1659, ('instrumento', ['contrato'])),
    ('ct_par2_entrega',  '  └ Par. 2º — prazo de entrega',          1444, 1445, ('natureza', ['aquisicao'])),
    ('ct_par2_execucao', '  └ Par. 2º — prazo de execução',         1446, 1447, ('natureza', ['servicos'])),
    ('ct_garantia',      '  └ Par. 4º a 6º — garantia de execução', 1450, 1455, ('garantiaContratual', [True])),
    ('ct_pag_servicos',  '  └ Cláusula 7ª — pagamento (serviços)',  1504, 1505, ('natureza', ['servicos'])),
    ('ct_pag_aquisicao', '  └ Cláusula 7ª — pagamento (aquisição)', 1506, 1507, ('natureza', ['aquisicao'])),
    ('ct_cl9_subcontrat', '  └ Cláusula 9ª — subcontratação',       1590, 1603, ('subcontratacao', [True])),

    # ── Anexo III — Termo de Referência ────────────────────────────────
    ('tr_4_recebimento', 'TR item 4 — Recebimento do objeto',       1937, 1964, ('natureza', ['aquisicao'])),
    ('tr_4_execucao',    'TR item 4 — Execução dos serviços',       1965, 1972, ('natureza', ['servicos'])),
]


def main():
    linhas = [l.rstrip('\n').split('\t') for l in open('indice.txt', encoding='utf-8')]
    textos = {int(a): (b if len(l) > 1 else '') for l in linhas for a, b in [(l[0], l[1] if len(l) > 1 else '')]}
    total = max(textos)

    saida = []
    erros = []
    for bid, titulo, ini, fim, (campo, valores) in BLOCOS:
        if ini > fim or fim > total:
            erros.append(f'{bid}: faixa inválida {ini}..{fim}')
            continue
        impressao = textos.get(ini, '')[:60]
        if not impressao.strip():
            erros.append(f'{bid}: parágrafo inicial {ini} está vazio — faixa provavelmente errada')
        saida.append({
            'id': bid, 'titulo': titulo,
            'ini': ini, 'fim': fim,
            'impressao': impressao,
            'campo': campo, 'valores': valores,
        })

    if erros:
        print('PROBLEMAS:')
        for e in erros:
            print('  -', e)

    mapa = {
        'modelo': 'modelo-edital.odt',
        'paragrafos': total + 1,
        'campos': ['@@PREGAO@@', '@@PROCESSO@@', '@@OBJETO@@', '@@DATA_EXTENSO@@',
                   '@@DATA_CURTA@@', '@@DIA_SEMANA@@', '@@HORARIO@@', '@@DATA_EDITAL@@'],
        'blocos': saida,
    }
    Path('blocos.json').write_text(json.dumps(mapa, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'\nblocos.json: {len(saida)} blocos, modelo com {total+1} parágrafos')
    for b in saida:
        print(f"  {b['ini']:>5}..{b['fim']:<5} {b['campo']}={b['valores']}  {b['titulo']}")
        print(f"         ⌙ {b['impressao'][:70]}")


if __name__ == '__main__':
    main()
