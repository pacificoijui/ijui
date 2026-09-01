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

    # ── nada de comentário de redação sobrando ───────────────────────
    checa('sem comentários de redação (office:annotation)',
          b'office:annotation' not in zf.read('content.xml'))
    for lixo in ['SOMENTE QUANDO', 'EXCLUIR ITEM', 'ATUALIZAR O SUMÁRIO',
                 'EM AMARELO', 'EM LARANJA', 'COLAR A PARTE',
                 'EXCLUIR BALANÇO', 'b.5 somente para serviços']:
        checa(f'sem a instrução "{lixo}" no corpo', lixo not in texto)

print(f'\n{"="*72}\n{ok} conferências passaram, {falhas} falharam.')
sys.exit(1 if falhas else 0)
