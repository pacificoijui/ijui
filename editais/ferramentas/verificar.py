#!/usr/bin/env python3
"""Confere os .odt gerados pelo navegador.

O LibreOffice deste container não abre arquivo nenhum (falha até com um .txt),
então a conferência é estrutural: o pacote é um ODF válido, o XML está
bem-formado, nenhum marcador sobrou, e cada trecho condicional está presente
ou ausente conforme a marcação do cenário.
"""
import sys, zipfile, re
import xml.etree.ElementTree as ET

O = '{urn:oasis:names:tc:opendocument:xmlns:office:1.0}'
T = '{urn:oasis:names:tc:opendocument:xmlns:text:1.0}'

ok = falhas = 0


def checa(nome, cond, extra=''):
    global ok, falhas
    if cond:
        print(f'   ✓ {nome}')
        ok += 1
    else:
        print(f'   ✗ {nome}' + (f'\n       {extra}' if extra else ''))
        falhas += 1


CENARIOS = {
    'saida-registro-ata-aquisicao.odt': {
        'presentes': ['14. ATA DE REGISTRO DE PREÇOS E CONTRATAÇÃO',
                      'ANEXO II – MINUTA DA ATA DE REGISTRO DE PREÇOS',
                      'CLÁUSULA TERCEIRA – ENTREGA DO OBJETO',
                      '4. RECEBIMENTO DO OBJETO',
                      '8.5.2 Dentre os documentos',
                      '1.5 Os itens com o valor total de até 80',      # ME/EPP exclusivo
                      '4.12 Os itens com o valor total de até 80',
                      '4.1 Poderão participar desta licitação, pessoas jurídicas',  # seção 4 padrão
                      '2.1 Os quantitativos estimados',                # TR registro de preços
                      '3.1 Os itens 1,2,3',                           # TR itens exclusivos
                      'MENOR PREÇO POR ITEM',
                      'facultando-se ao licitante'],                  # não é item único
        'ausentes': ['14. SUBSTITUIÇÃO DO TERMO DE CONTRATO',
                     '14. CONTRATO',
                     'ANEXO II – MINUTA DO CONTRATO',
                     'CLÁUSULA TERCEIRA – EXECUÇÃO DOS SERVIÇOS',
                     '4. EXECUÇÃO DOS SERVIÇOS',
                     '17.12 As despesas decorrentes',                 # sai no registro de preços
                     '1.6 O licitante classificado em primeiro lugar que deverá apresentar amostra',
                     'CLÁUSULA NONA – SUBCONTRATAÇÃO',
                     'COMPRA MAIS',
                     'b) Deverão apresentar balanço patrimonial',      # sem balanço
                     '(Obras Acima de R$ 439.200)',
                     '(Serviços acima de R$ 732.000)',
                     '9.19 HABILITAÇÃO TÉCNICA',
                     'd) Fornecer catálogo do produto ofertado'],
        'valores': ['131/2026', '642/2026', '14 de setembro de 2026',
                    'Segunda-Feira', '09:30', '31 de agosto de 2026',
                    'Aquisição de equipamentos de musculação & acessórios <teste>'],
    },
    'saida-contratacao-contrato-servicos.odt': {
        'presentes': ['14. CONTRATO',
                      'ANEXO II – MINUTA DO CONTRATO',
                      'CLÁUSULA NONA – SUBCONTRATAÇÃO',
                      '4. EXECUÇÃO DOS SERVIÇOS',
                      '17.12 As despesas decorrentes',
                      '1.6 O licitante classificado em primeiro lugar que deverá apresentar amostra',
                      '14.4 Para retirar e assinar o contrato',
                      'PARÁGRAFO QUARTO: A CONTRATADA presta a garantia',
                      '14.1 Após a homologação do certame',
                      'SERVIÇOS: 16.1',
                      'COMPRA MAIS',                                  # preâmbulo Compra + Ijuí
                      '1.5 A aplicação da Lei Municipal nº 7.724/2025',
                      'b) Deverão apresentar balanço patrimonial',
                      '(Serviços acima de R$ 732.000)',
                      'b.5) No caso de a licitante não atender',
                      '9.19 HABILITAÇÃO TÉCNICA',
                      'd) Fornecer catálogo do produto ofertado',
                      'PARÁGRAFO SÉTIMO: Da repactuação',
                      'Apresentar ao fiscal técnico/administrativo do contrato o pertinente PCMSO',
                      'por ITEM ÚNICO'],
        'ausentes': ['14. ATA DE REGISTRO DE PREÇOS E CONTRATAÇÃO',
                     '14. SUBSTITUIÇÃO DO TERMO DE CONTRATO',
                     'ANEXO II – MINUTA DA ATA DE REGISTRO DE PREÇOS',
                     '4. RECEBIMENTO DO OBJETO',
                     '8.5.2 Dentre os documentos',
                     '14.1 Homologado o procedimento licitatório',
                     'AQUISIÇÃO: 16.1',
                     '(Obras Acima de R$ 439.200)',
                     'PARÁGRAFO SÉTIMO Do reajuste',
                     'facultando-se ao licitante',
                     '2.1 Os quantitativos estimados'],
        'valores': ['77/2026', '900/2026', '5 de outubro de 2026',
                    'Segunda-Feira', '14:00', '20 de setembro de 2026'],
    },
    'saida-contratacao-empenho-aquisicao.odt': {
        'presentes': ['14. SUBSTITUIÇÃO DO TERMO DE CONTRATO',
                      '4. RECEBIMENTO DO OBJETO',
                      '17.12 As despesas decorrentes',
                      'AQUISIÇÃO: 16.1',
                      '4.12 Será concedido tratamento favorecido',      # sem cota
                      '1.5 Não foi destinada cota/item',
                      'b) Deverão apresentar balanço patrimonial',
                      '(Obras Acima de R$ 439.200)'],
        'ausentes': ['14. ATA DE REGISTRO DE PREÇOS E CONTRATAÇÃO',
                     '14. CONTRATO',
                     'ANEXO II – MINUTA DA ATA DE REGISTRO DE PREÇOS',
                     'ANEXO II – MINUTA DO CONTRATO',
                     '4. EXECUÇÃO DOS SERVIÇOS',
                     'CLÁUSULA NONA – SUBCONTRATAÇÃO',
                     'COMPRA MAIS',
                     '(Serviços acima de R$ 732.000)',
                     '3.1 Os itens 1,2,3',
                     '9.19 HABILITAÇÃO TÉCNICA'],
        'valores': ['12/2026', '55/2026', '3 de novembro de 2026',
                    'Terça-Feira', '08:30', '15 de outubro de 2026'],
    },
}


TBL = '{urn:oasis:names:tc:opendocument:xmlns:table:1.0}'


def tabelas_vazias(zf):
    """Nomes das tabelas sem nenhum texto dentro.

    Muitos títulos do edital moram numa tabela de uma célula só, usada como
    faixa. Se o trecho sai e a moldura fica, o edital ganha uma caixa com
    borda e nada dentro — foi exatamente o que acontecia antes."""
    r = ET.fromstring(zf.read('content.xml').decode('utf-8'))
    vazias = set()
    for t in r.iter(TBL + 'table'):
        texto = ''.join(''.join(p.itertext()) for p in t.iter(T + 'p'))
        if not texto.strip():
            vazias.add(t.get(TBL + 'name'))
    return vazias


with zipfile.ZipFile('/home/user/ijui/editais/modelo-edital.odt') as _z:
    VAZIAS_NO_MODELO = tabelas_vazias(_z)


def texto_do(zf, arquivo):
    r = ET.fromstring(zf.read(arquivo).decode('utf-8'))
    partes = []
    for el in r.iter():
        if el.tag in (T + 'p', T + 'h'):
            partes.append(''.join(el.itertext()))
    return '\n'.join(partes)


for arq, esperado in CENARIOS.items():
    print(f'\n{"="*72}\n{arq}')
    try:
        zf = zipfile.ZipFile(arq)
    except Exception as e:
        checa('abre como zip', False, str(e))
        continue

    # ── pacote ODF válido ────────────────────────────────────────────
    nomes = zf.namelist()
    checa('mimetype é o primeiro arquivo do pacote', nomes[0] == 'mimetype',
          f'primeiro é {nomes[0]!r}')
    info = zf.getinfo('mimetype')
    checa('mimetype está sem compressão (exigência do ODF)',
          info.compress_type == zipfile.ZIP_STORED)
    checa('mimetype com o valor certo',
          zf.read('mimetype') == b'application/vnd.oasis.opendocument.text')
    checa('zip íntegro (CRC de todos os membros)', zf.testzip() is None)
    for obrig in ('content.xml', 'styles.xml', 'META-INF/manifest.xml'):
        checa(f'contém {obrig}', obrig in nomes)

    # ── XML bem-formado ──────────────────────────────────────────────
    try:
        ET.fromstring(zf.read('content.xml').decode('utf-8'))
        ET.fromstring(zf.read('styles.xml').decode('utf-8'))
        checa('content.xml e styles.xml bem-formados', True)
    except Exception as e:
        checa('content.xml e styles.xml bem-formados', False, str(e))
        continue

    # ── prefixos de namespace preservados ────────────────────────────
    cab = zf.read('content.xml')[:4000].decode('utf-8', 'replace')
    checa('prefixos originais preservados (sem ns0:, ns2:…)',
          'xmlns:ns' not in cab and 'xmlns:draw=' in cab and 'xmlns:text=' in cab)

    texto = texto_do(zf, 'content.xml')
    estilos = zf.read('styles.xml').decode('utf-8')

    # ── nenhum marcador sobrando ─────────────────────────────────────
    sobra = sorted(set(re.findall(r'@@\w+@@', texto)) | set(re.findall(r'@@\w+@@', estilos)))
    checa('nenhum marcador @@…@@ restante', not sobra, f'sobraram: {sobra}')

    # ── valores substituídos ─────────────────────────────────────────
    for v in esperado['valores']:
        checa(f'valor presente: {v[:52]}', v in texto)

    # ── blocos condicionais ──────────────────────────────────────────
    for p in esperado['presentes']:
        checa(f'MANTIDO: {p[:56]}', p in texto)
    for a in esperado['ausentes']:
        checa(f'REMOVIDO: {a[:56]}', a not in texto)

    # ── nenhuma moldura de tabela sobrando sem conteúdo ──────────────
    sobrando = tabelas_vazias(zf) - VAZIAS_NO_MODELO
    checa('nenhuma tabela ficou vazia por causa da remoção',
          not sobrando, f'ficaram: {sorted(sobrando)}')

    # ── nada de comentário de redação sobrando ───────────────────────
    checa('sem comentários de redação (office:annotation)',
          b'office:annotation' not in zf.read('content.xml'))
    for lixo in ['SOMENTE QUANDO', 'EXCLUIR ITEM', 'ATUALIZAR O SUMÁRIO',
                 'EM AMARELO', 'EM LARANJA', 'COLAR A PARTE',
                 'EXCLUIR BALANÇO', 'b.5 somente para serviços']:
        checa(f'sem a instrução "{lixo}" no corpo', lixo not in texto)

# ── Cenário dos itens: as duas tabelas remontadas a partir de uma colagem ──
print(f'\n{"="*72}\nsaida-itens.odt (tabelas de itens)')
try:
    zf = zipfile.ZipFile('saida-itens.odt')
    r = ET.fromstring(zf.read('content.xml').decode('utf-8'))
    TBL2 = TBL

    def linhas_de(nome):
        for t in r.iter(TBL2 + 'table'):
            if t.get(TBL2 + 'name') == nome:
                return [[' '.join(''.join(p.itertext()).strip()
                                  for p in c.iter(T + 'p')).strip()
                         for c in ln.findall(TBL2 + 'table-cell')]
                        for ln in t.iter(TBL2 + 'table-row')]
        return []

    tr = linhas_de('Tabela1')     # Termo de Referência
    an = linhas_de('Tabela18')    # modelo de proposta do Anexo I

    checa('TR: cabeçalho + 4 itens', len(tr) == 5, f'{len(tr)} linhas')
    checa('Anexo I: cabeçalho + 4 itens', len(an) == 5, f'{len(an)} linhas')
    checa('TR manteve o cabeçalho original', tr and tr[0][0] == 'Lote', tr[0] if tr else None)
    checa('descrição colada chegou inteira',
          tr[1][3] == 'Arroz branco tipo 1, pacote de 5kg', tr[1][3] if len(tr) > 1 else None)
    checa('valor total ausente foi calculado (7,25 x 150 = 1.087,50)',
          len(tr) > 3 and tr[3][8] == '1.087,50', tr[3][8] if len(tr) > 3 else None)
    checa('Anexo I sai sem valor unitário (é o formulário da empresa)',
          len(an) > 1 and an[1][5] == '', repr(an[1][5]) if len(an) > 1 else None)
    checa('Anexo I sai sem valor total',
          len(an) > 1 and an[1][8] == '', repr(an[1][8]) if len(an) > 1 else None)
    checa('Anexo I mantém quantidade e unidade',
          len(an) > 1 and an[1][6] == '100' and an[1][7] == 'PCT', an[1] if len(an) > 1 else None)

    texto = texto_do(zf, 'content.xml')
    checa('valor estimado saiu somado dos itens (7.157,50)', '7.157,50' in texto)
    checa('nenhum item do edital de exemplo sobrou',
          'Esteria Profissional' not in texto and 'Bicicleta ergométrica' not in texto)
    checa('nenhum marcador @@…@@ restante', not re.findall(r'@@\w+@@', texto))
    sobrando = tabelas_vazias(zf) - VAZIAS_NO_MODELO
    checa('nenhuma tabela ficou vazia', not sobrando, f'ficaram: {sorted(sobrando)}')
except FileNotFoundError:
    print('   (saida-itens.odt não gerado — rode t-itens.js antes)')


# ── Cenário da dotação: as duas tabelas preenchidas de uma colagem só ──
print(f'\n{"="*72}\nsaida-dotacao.odt (dotação orçamentária)')
try:
    zf = zipfile.ZipFile('saida-dotacao.odt')
    r = ET.fromstring(zf.read('content.xml').decode('utf-8'))

    def linha_tabela(nome):
        for t in r.iter(TBL + 'table'):
            if t.get(TBL + 'name') == nome:
                for ln in t.iter(TBL + 'table-row'):
                    return [' '.join(''.join(p.itertext()).strip()
                                     for p in c.iter(T + 'p')).strip()
                            for c in ln.findall(TBL + 'table-cell')]
        return None

    GRUPO1 = ['Tabela52','Tabela53','Tabela54','Tabela55','Tabela56','Tabela63','Tabela64','Tabela73']
    GRUPO2 = ['Tabela67','Tabela68','Tabela69','Tabela70','Tabela71','Tabela72','Tabela74','Tabela76']
    ESPERADO = [
        ['ÓRGÃO', '09', 'SEC. MUN. DE EDUCAÇÃO'],
        ['UNIDADE', '0901', 'Coordenadoria de Ensino Fundamental'],
        ['FUNÇÃO', '12', 'Educação'],
        ['SUBFUNÇÃO', '361', 'Ensino Fundamental'],
        ['PROGRAMA', '201', 'Educação de Qualidade para Todos'],
        ['PROJETO/ATIVIDADE', '2044', 'Manutenção do Ensino Fundamental'],
        ['DESPESA', '10500', '1001', 'Recursos do Tesouro Municipal'],
        ['CATEGORIA ECONÔMICA', '339030000000', 'MATERIAL DE CONSUMO'],
    ]
    for grupo, rotulo in ((GRUPO1, 'item 17.12 do edital'), (GRUPO2, 'Cláusula Quarta do contrato')):
        for nome, esp in zip(grupo, ESPERADO):
            real = linha_tabela(nome)
            checa(f'{rotulo} — {esp[0]}', real == esp, f'esperava {esp}, achei {real}')

    checa('FUNÇÃO e SUBFUNÇÃO não se confundiram (bug do prefixo)',
          linha_tabela('Tabela54') != linha_tabela('Tabela55'))

    texto = texto_do(zf, 'content.xml')
    checa('nenhum dado do exemplo (Esporte e Lazer) sobrou', 'Esporte e Lazer' not in texto)
    checa('nenhum marcador @@…@@ restante', not re.findall(r'@@\w+@@', texto))
except FileNotFoundError:
    print('   (saida-dotacao.odt não gerado — rode t-dotacao.js antes)')


print(f'\n{"="*72}\n{ok} conferências passaram, {falhas} falharam.')
sys.exit(1 if falhas else 0)
