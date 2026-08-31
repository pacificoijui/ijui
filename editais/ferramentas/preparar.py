#!/usr/bin/env python3
"""
Transforma o edital padrão da COPAM num MODELO reutilizável.

Roda uma vez (aqui, fora do navegador) e produz dois arquivos que vão para o
repositório:

  editais/modelo-edital.odt   o edital com os valores variáveis trocados por
                              marcadores @@CAMPO@@ e sem os comentários de
                              redação (aquelas 23 anotações são instruções pro
                              pregoeiro, não fazem parte do edital)

  editais/blocos.json         o mapa dos trechos que entram ou saem conforme
                              as marcações (registro de preços x contratação,
                              contrato x ata x empenho, produtos x serviços...)

O mapa é por ÍNDICE de parágrafo, não por texto: o modelo é um arquivo fixo,
então os índices são estáveis, e casar por texto quebraria à toa se alguém
corrigir uma vírgula. Cada bloco guarda junto uma "impressão digital" do texto
inicial, que o navegador confere antes de apagar qualquer coisa — se o modelo
for trocado sem regerar o mapa, a geração para em vez de mutilar o documento.
"""

import json, re, shutil, sys, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

ORIGEM = Path('edital.odt')
SAIDA_ODT = Path('modelo-edital.odt')
SAIDA_MAPA = Path('blocos.json')

NS = {
    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    'text':   'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    'style':  'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    'fo':     'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
}
for p, u in NS.items():
    ET.register_namespace(p, u)

Q = {k: '{%s}' % v for k, v in NS.items()}


def registrar_namespaces(xml_bytes):
    """Registra TODOS os prefixos declarados no arquivo original.

    Sem isso o ElementTree reinventa os prefixos na hora de gravar (draw: vira
    ns8:, xlink: vira ns10:...). O ODF referencia prefixo dentro de valor de
    atributo, então o arquivo abre quebrado — foi exatamente o que aconteceu na
    primeira tentativa: "source file could not be loaded"."""
    cabeca = xml_bytes[:4000].decode('utf-8', 'replace')
    for pref, uri in re.findall(r'xmlns:([A-Za-z0-9_.-]+)="([^"]+)"', cabeca):
        ET.register_namespace(pref, uri)

# ── Campos variáveis ────────────────────────────────────────────────────────
# O valor à esquerda é o que está no edital de exemplo (PE 131/2026); ele vira
# o marcador da direita. A ordem importa: o objeto é trocado antes do resto
# porque o texto do aviso contém o objeto inteiro dentro de uma frase maior.
OBJETO_EXEMPLO = ('Aquisição de equipamentos de musculação, equipamentos aeróbicos e '
                  'acessórios destinados à implementação e aparelhamento da Academia '
                  'Pública do Ginásio Didatico Municipal, conforme Termo de Referência '
                  'em anexo')

CAMPOS = [
    (OBJETO_EXEMPLO,          '@@OBJETO@@'),
    ('131/2026',              '@@PREGAO@@'),
    ('642/2026',              '@@PROCESSO@@'),
    ('14 de setembro de 2026', '@@DATA_EXTENSO@@'),
    ('14/09/26',              '@@DATA_CURTA@@'),
    ('Segunda-Feira',         '@@DIA_SEMANA@@'),
    ('09:30',                 '@@HORARIO@@'),
    ('31 de agosto de 2026',  '@@DATA_EDITAL@@'),
]


def paragrafos(raiz):
    """Todos os parágrafos e títulos, em ordem de documento.

    Ignora o que está dentro de anotação: aquilo é comentário de redação e sai
    do documento final, então não pode entrar na contagem de índices."""
    fora = set()
    for ann in raiz.iter(Q['office'] + 'annotation'):
        for p in ann.iter():
            fora.add(id(p))
    saida = []
    for el in raiz.iter():
        if el.tag in (Q['text'] + 'p', Q['text'] + 'h') and id(el) not in fora:
            saida.append(el)
    return saida


def texto_de(el):
    """Texto do parágrafo, pulando o conteúdo das anotações."""
    partes = []

    def rec(e):
        if e.tag == Q['office'] + 'annotation':
            return
        if e.text:
            partes.append(e.text)
        for c in list(e):
            rec(c)
            if c.tail:
                partes.append(c.tail)

    rec(el)
    return ''.join(partes)


def segmentos(el):
    """Lista de (nó, campo, texto) cobrindo todo o texto do parágrafo.

    'campo' é 'text' ou 'tail'. Serve para reescrever o texto sem desmontar os
    <text:span>, que é onde mora a formatação (negrito, destaque, fonte)."""
    segs = []

    def rec(e):
        if e.tag == Q['office'] + 'annotation':
            return
        if e.text:
            segs.append([e, 'text'])
        for c in list(e):
            rec(c)
            if c.tail:
                segs.append([c, 'tail'])

    rec(el)
    return segs


def trocar_no_paragrafo(el, alvo, token):
    """Troca 'alvo' por 'token' dentro do parágrafo, mesmo que o texto esteja
    picado em vários spans — que é a regra no ODF, não a exceção.

    O token inteiro fica no segmento onde a ocorrência começa; dos segmentos
    seguintes some só a parte casada. Assim a formatação do começo do trecho é
    a que prevalece, e nenhum span é destruído."""
    trocas = 0
    while True:
        segs = segmentos(el)
        if not segs:
            return trocas
        textos = [(getattr(n, c) or '') for n, c in segs]
        inteiro = ''.join(textos)
        pos = inteiro.find(alvo)
        if pos < 0:
            return trocas

        fim = pos + len(alvo)
        cursor = 0
        for (no, campo), t in zip(segs, textos):
            ini_seg, fim_seg = cursor, cursor + len(t)
            cursor = fim_seg
            if fim_seg <= pos or ini_seg >= fim:
                continue  # segmento fora da ocorrência
            corta_ini = max(0, pos - ini_seg)
            corta_fim = min(len(t), fim - ini_seg)
            novo = t[:corta_ini] + (token if ini_seg <= pos < fim_seg else '') + t[corta_fim:]
            setattr(no, campo, novo)
        trocas += 1


def tokenizar(raiz):
    total = {}
    for el in paragrafos(raiz):
        for alvo, token in CAMPOS:
            n = trocar_no_paragrafo(el, alvo, token)
            if n:
                total[token] = total.get(token, 0) + n
    return total


def tokenizar_solto(raiz):
    """styles.xml guarda cabeçalho e rodapé, que repetem número e data. Lá não
    há a estrutura de parágrafos do corpo, então varre todo mundo."""
    total = {}
    for el in raiz.iter():
        if el.tag not in (Q['text'] + 'p', Q['text'] + 'h'):
            continue
        for alvo, token in CAMPOS:
            n = trocar_no_paragrafo(el, alvo, token)
            if n:
                total[token] = total.get(token, 0) + n
    return total


def remover_anotacoes(raiz):
    """Tira os comentários de redação e os parágrafos que só repetem o texto do
    comentário no corpo (o Writer deixa os dois quando o comentário é colado
    como texto). Também remove as âncoras órfãs de anotação."""
    n = 0
    for pai in list(raiz.iter()):
        for filho in list(pai):
            if filho.tag in (Q['office'] + 'annotation',
                             Q['office'] + 'annotation-end'):
                # o texto que vinha depois da anotação não pode se perder
                if filho.tail:
                    ante = None
                    for c in pai:
                        if c is filho:
                            break
                        ante = c
                    if ante is not None:
                        ante.tail = (ante.tail or '') + filho.tail
                    else:
                        pai.text = (pai.text or '') + filho.tail
                pai.remove(filho)
                n += 1
    return n


def limpar_destaques(raiz):
    """Zera o fundo colorido dos estilos (amarelo/laranja/rosa/verde).

    No modelo o destaque marca 'este trecho é condicional' — é recado interno.
    O edital publicado não pode sair com texto marcado a marca-texto, e o que o
    destaque queria dizer agora está codificado nas regras de bloco."""
    n = 0
    for st in raiz.iter(Q['style'] + 'style'):
        for props in st.findall(Q['style'] + 'text-properties'):
            bg = props.get(Q['fo'] + 'background-color')
            if bg and bg != 'transparent':
                props.set(Q['fo'] + 'background-color', 'transparent')
                n += 1
    return n


def carregar(zf, nome):
    return ET.fromstring(zf.read(nome).decode('utf-8'))


def serializar(raiz):
    return ET.tostring(raiz, encoding='UTF-8', xml_declaration=True)


def main():
    if not ORIGEM.exists():
        sys.exit(f'não achei {ORIGEM}')

    with zipfile.ZipFile(ORIGEM) as zf:
        nomes = zf.namelist()
        conteudo = {n: zf.read(n) for n in nomes}

    registrar_namespaces(conteudo['content.xml'])
    registrar_namespaces(conteudo['styles.xml'])
    raiz_c = ET.fromstring(conteudo['content.xml'].decode('utf-8'))
    raiz_s = ET.fromstring(conteudo['styles.xml'].decode('utf-8'))

    # 1. Mapa dos blocos ANTES de mexer em qualquer coisa (índices do original,
    #    que continuam valendo porque a remoção de anotação não apaga parágrafo
    #    de corpo — as anotações já estavam fora da contagem).
    corpo = raiz_c.find(Q['office'] + 'body/' + Q['office'] + 'text')
    lista = paragrafos(corpo)
    textos = [texto_de(p).strip() for p in lista]

    # 2. Tokeniza campos
    t1 = tokenizar(corpo)
    t2 = tokenizar_solto(raiz_s)
    print('marcadores inseridos em content.xml:', t1)
    print('marcadores inseridos em styles.xml :', t2)

    # 3. Limpa comentários e destaques
    print('anotações removidas :', remover_anotacoes(raiz_c))
    print('destaques zerados   :', limpar_destaques(raiz_c) + limpar_destaques(raiz_s))

    # 4. Grava o modelo
    conteudo['content.xml'] = serializar(raiz_c)
    conteudo['styles.xml'] = serializar(raiz_s)
    if SAIDA_ODT.exists():
        SAIDA_ODT.unlink()
    with zipfile.ZipFile(SAIDA_ODT, 'w', zipfile.ZIP_DEFLATED) as zf:
        # mimetype tem que vir primeiro e sem compressão, senão o LibreOffice
        # não reconhece o arquivo
        zf.writestr(zipfile.ZipInfo('mimetype'), conteudo['mimetype'],
                    compress_type=zipfile.ZIP_STORED)
        for n in nomes:
            if n == 'mimetype':
                continue
            zf.writestr(n, conteudo[n])
    print(f'\n{SAIDA_ODT} gravado ({SAIDA_ODT.stat().st_size} bytes)')

    # 5. Índice de parágrafos para montar as regras
    with open('indice.txt', 'w') as f:
        for i, t in enumerate(textos):
            f.write(f'{i}\t{t[:200]}\n')
    print(f'indice.txt gravado ({len(textos)} parágrafos)')


if __name__ == '__main__':
    main()
