#!/usr/bin/env python3
"""Converte os quatro cadernos do Arquivo em arquivo/dados/*.json.

    python3 arquivo/ferramentas/planilhas-para-json.py PASTA_COM_AS_PLANILHAS [--gravar]

Sem --gravar é ensaio: mostra o relatório e não toca em arquivo nenhum.
Escreve também arquivo/dados/CONFERIR.md com o que ficou em dúvida.

Os quatro cadernos contam a MESMA história de jeitos diferentes: um papel
saiu daqui, foi parar com alguém, e precisa voltar. Por isso a conversão não
espelha as abas — ela derrete tudo em quatro listas:

  tramites.json   o que SAIU e precisa voltar: assinatura, parecer,
                  empréstimo do arquivo. É daqui que sai a tela de
                  pendências, e por isso só entra aqui o que tem volta
                  esperada.
  memorandos.json o que CHEGOU: protocolo de entrada, com a descrição e
                  para quem foi entregue. Não espera volta — é a origem do
                  pedido, e o que as anulações citam em "REF. MEMORANDO".
  anulacoes.json  a anulação de empenho, que é um objeto de verdade (tem
                  número próprio, credor, valor) e não só um deslocamento.
  pastas.json     o que já está arquivado: processo, vencedor, data.

A separação entre trâmite e memorando não é burocracia de programador: sem
ela, os 300 memorandos entrariam na conta de "está fora" e a tela de
pendências nasceria com 580 linhas em vermelho — o mesmo ruído que hoje
esconde as 18 que importam de verdade.

O "de onde veio" fica gravado em cada registro (campo "origem"), para
conferir contra a planilha quando alguém duvidar.
"""
import json
import re
import sys
import unicodedata
from datetime import datetime, date
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / "arquivo" / "dados"
avisos = []


def aviso(grau, onde, campo, bruto, virou):
    avisos.append({"grau": grau, "onde": onde, "campo": campo,
                   "bruto": str(bruto), "virou": str(virou)})


def texto(v):
    """Um traço sozinho é como a planilha escreve "não tem"."""
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return v.strftime("%d/%m/%Y")
    s = str(v).replace("\xa0", " ")
    s = unicodedata.normalize("NFC", " ".join(s.split()))
    return "" if s in ("-", "--", "---", "–", "—", ".", "") else s


def iso(v, onde=""):
    """Data em aaaa-mm-dd, que é como o resto do sistema guarda.

    Duas armadilhas da planilha, as duas já vistas nos dados de verdade:
    ano digitado errado (2062 em vez de 2026) e ano de outro exercício
    numa planilha de 2026. Nenhuma das duas some calada: viram aviso no
    CONFERIR.md, com o valor bruto ao lado."""
    if v is None or texto(v) == "":
        return None
    if isinstance(v, datetime):
        d = v.date()
    elif isinstance(v, date):
        d = v
    else:
        s = texto(v)
        m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$", s)
        if not m:
            aviso("data", onde, "data", v, "(vazio)")
            return None
        dia, mes, ano = int(m.group(1)), int(m.group(2)), int(m.group(3))
        ano = ano + 2000 if ano < 100 else ano
        try:
            d = date(ano, mes, dia)
        except ValueError:
            aviso("data", onde, "data", v, "(vazio)")
            return None
    if d.year > 2030 or d.year < 2015:
        aviso("ano-estranho", onde, "data", v, d.isoformat())
    return d.isoformat()


def numero(v):
    """Valor em reais: a planilha traz tanto número quanto texto à
    brasileira (25.000,00)."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = texto(v)
    if not s:
        return None
    s = re.sub(r"[^\d,.-]", "", s)
    if not s:
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def ref(v, onde="", campo=""):
    """Referência tipo "33/2026".

    O Excel lê "11/2026" como novembro de 2026 e guarda uma DATA. O mês é o
    número da referência — mesma armadilha já resolvida no conversor das
    requisições. Sem isto, "REF. MEMORANDO 11/2026" viraria "01/11/2026" na
    tela e ninguém acharia o memorando."""
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        virou = "%d/%d" % (v.month, v.year)
        aviso("num-virou-data", onde, campo, v, virou)
        return virou
    return texto(v)


def limpar(d):
    """Campo vazio não vai para o JSON: o arquivo fica menor e a tela não
    precisa distinguir "" de ausente."""
    return {k: v for k, v in d.items() if v not in (None, "", [])}


# ══════════════ ANULAÇÕES ══════════════
def ler_anulacoes(caminho):
    """Numero | Requisição interna | REF. MEMORANDO | PED. EXCLUIDO |
       EMP. EXCLUIDO | Credor | Valor | CONTABILIDADE | DATA RETORNO"""
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb["GERAL"]
    saida = []
    for li, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
        bruto = texto(row[0])
        if not bruto or bruto.upper().startswith("ANULA"):
            continue          # linha de título no meio da planilha
        onde = "ANULAÇÕES!A%d" % li
        # "02/2026 (MATHEUS)" → número 2, ano 2026, lançado por MATHEUS
        m = re.match(r"^(\d+)\s*/\s*(\d{4})\s*(?:\(([^)]*)\))?", bruto)
        if not m:
            aviso("numero", onde, "Numero", bruto, "(pulada)")
            continue
        req = texto(row[1])
        # "11-24-2026-SMODUTRAN" → a requisição interna, do módulo /requisicao/
        mr = re.match(r"^(\d+)-(\w+)-(\d{4})-(.+)$", req)
        saida.append(limpar({
            "id": "%s-%s" % (m.group(2), m.group(1)),
            "num": int(m.group(1)),
            "ano": int(m.group(2)),
            "quem": (m.group(3) or "").strip().upper(),
            "requisicao": req,
            "reqSec": (mr.group(4).upper() if mr else ""),
            "reqNum": (mr.group(2) if mr else ""),
            "memorando": ref(row[2], onde, "REF. MEMORANDO"),
            "pedido": ref(row[3], onde, "PED. EXCLUIDO"),
            "empenho": ref(row[4], onde, "EMP. EXCLUIDO"),
            "credor": texto(row[5]).upper(),
            "valor": numero(row[6]),
            "contabilidadeEm": iso(row[7], onde),
            "retornoEm": iso(row[8], onde),
            "origem": "ANULAÇÕES/GERAL",
        }))
    return saida


# ══════════════ MEMORANDOS ══════════════
def ler_memorandos(caminho):
    """Uma aba por secretaria: MEMORANDO | RECEBIDO EM | DESCRIÇÃO |
    ENTREGUE PARA.

    É protocolo de ENTRADA, não empréstimo: o papel chegou da secretaria e
    foi para a mão de alguém, e a planilha nem tem coluna de devolução. Por
    isso não vira trâmite — viraria pendência eterna."""
    wb = openpyxl.load_workbook(caminho, data_only=True)
    saida = []
    for ws in wb.worksheets:
        sigla = ws.title.strip()
        for li, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
            num, receb, desc, para = (texto(row[0]), row[1],
                                      texto(row[2]), texto(row[3]))
            if not num and not desc:
                continue
            onde = "MEMORANDOS!%s!%d" % (sigla, li)
            saida.append(limpar({
                "num": num,
                "secretaria": sigla,
                "descricao": desc,
                "entregueA": para.upper(),
                "recebidoEm": iso(receb, onde),
                "origem": "MEMORANDOS/%s" % sigla,
            }))
    return saida


# ══════════════ CONTROLE DO ARQUIVO ══════════════
def ler_controle(caminho):
    """Devolve (tramites, pastas).

    Retiradas/Devoluções é empréstimo puro. As abas por modalidade são o
    contrário: o que já ESTÁ arquivado, com vencedor e data."""
    wb = openpyxl.load_workbook(caminho, data_only=True)
    tramites, pastas = [], []

    ws = wb["RetiradasDevoluções Processos"]
    for li, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
        mod, num, dest = texto(row[0]), texto(row[1]), texto(row[2])
        if not mod and not num:
            continue
        onde = "Arquivo!Retiradas!%d" % li
        tramites.append(limpar({
            "tipo": "emprestimo",
            "docTipo": mod.upper(),
            "docNum": num,
            "comQuem": dest.upper(),
            "saiuEm": iso(row[3], onde),
            "voltouEm": iso(row[4], onde),
            "origem": "Controle do Arquivo/Retiradas",
        }))

    # Processo | Vencedor e Valor | [Pregoeiro] | Arquivado | Checklist
    for aba, mod, tem_pregoeiro in [("Concorrências", "CONCORRÊNCIA", True),
                                    ("Pregões", "PREGÃO", True),
                                    ("Dispensas", "DISPENSA", False),
                                    ("Inexigibilidade", "INEXIGIBILIDADE", False)]:
        if aba not in wb.sheetnames:
            continue
        ws = wb[aba]
        for li, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
            proc = texto(row[0])
            if not proc:
                continue
            onde = "Arquivo!%s!%d" % (aba, li)
            venc = texto(row[1])
            if tem_pregoeiro:
                pregoeiro, arquivado, check = texto(row[2]), row[3], row[4]
            else:
                pregoeiro, arquivado, check = "", row[2], row[3]
            pastas.append(limpar({
                "modalidade": mod,
                "processo": proc,
                "vencedor": venc,
                "pregoeiro": pregoeiro.upper(),
                "arquivadoEm": iso(arquivado, onde),
                "checklist": bool(check) and texto(check).lower() not in ("false", "0"),
                "origem": "Controle do Arquivo/%s" % aba,
            }))

    aba = 'Req. "não se aplica"'
    if aba in wb.sheetnames:
        ws = wb[aba]
        for li, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
            sec, num = texto(row[0]), texto(row[1])
            if not sec and not num:
                continue
            onde = "Arquivo!NãoSeAplica!%d" % li
            pastas.append(limpar({
                "modalidade": "REQ. NÃO SE APLICA",
                "processo": num,
                "secretaria": sec.upper(),
                "vencedor": texto(row[2]).upper(),
                "valor": numero(row[3]),
                "termo": texto(row[4]),
                "arquivadoEm": iso(row[5], onde),
                "origem": "Controle do Arquivo/Req. não se aplica",
            }))
    return tramites, pastas


# ══════════════ PROCESSOS ══════════════
def ler_processos(caminho):
    """Montagem → assinatura → volta ao arquivo, e as abas de cada
    signatário. Tudo vira trâmite: quem está com o quê, desde quando."""
    wb = openpyxl.load_workbook(caminho, data_only=True)
    saida = []

    # DISPENSAS: Número | Modalidade | Montagem | Assinatura | Retorno
    # INEXIGIBILIDADE: Número | Montagem | Assinatura | Retorno
    for aba, tem_mod in [("DISPENSAS", True), ("INEXIGIBILIDADE", False)]:
        if aba not in wb.sheetnames:
            continue
        ws = wb[aba]
        for li, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
            num = texto(row[0])
            if not num:
                continue
            onde = "PROCESSOS!%s!%d" % (aba, li)
            mod = texto(row[1]).upper() if tem_mod else "INEXIGIBILIDADE"
            montagem, assin, ret = (row[2], row[3], row[4]) if tem_mod else (row[1], row[2], row[3])
            saida.append(limpar({
                "tipo": "assinatura",
                "docTipo": mod or "DISPENSA",
                "docNum": num,
                "comQuem": "ANDREI",
                "montadoEm": iso(montagem, onde),
                "saiuEm": iso(assin, onde) or iso(montagem, onde),
                "voltouEm": iso(ret, onde),
                "origem": "PROCESSOS/%s" % aba,
            }))

    # MODALIDADE | N° | DATA ENVIO | DATA RETORNO | DESTINO
    for aba, quem in [("PROCESSOS ASS. ANDREI", "ANDREI"),
                      ("PROCESSOS ASS. SERAFIM", "SERAFIM")]:
        if aba not in wb.sheetnames:
            continue
        ws = wb[aba]
        for li, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            mod, num = texto(row[0]), ref(row[1], "PROCESSOS!%s!%d" % (aba, li), "N°")
            if not mod and not num:
                continue
            if mod.upper() == "MODALIDADE":
                continue
            onde = "PROCESSOS!%s!%d" % (aba, li)
            saida.append(limpar({
                "tipo": "assinatura",
                "docTipo": mod.upper(),
                "docNum": num,
                "comQuem": quem,
                "saiuEm": iso(row[2], onde),
                "voltouEm": iso(row[3], onde),
                "destino": texto(row[4]).upper(),
                "origem": "PROCESSOS/%s" % aba,
            }))

    # MODALIDADE | N° | SECRETARIA | DATA ENVIO | DATA RETORNO
    aba = "MAITÃDENER"
    if aba in wb.sheetnames:
        ws = wb[aba]
        for li, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            mod, num = texto(row[0]), ref(row[1], "PROCESSOS!%s!%d" % (aba, li), "N°")
            if not mod and not num:
                continue
            if mod.upper() == "MODALIDADE":
                continue
            onde = "PROCESSOS!%s!%d" % (aba, li)
            # "REQUISIÇÃO (parecer Dener)" diz o documento E com quem foi
            quem = "DENER" if "dener" in mod.lower() else ("MAITÃ" if "maitã" in mod.lower() else "MAITÃ/DENER")
            docTipo = re.sub(r"\s*\(.*\)", "", mod).strip().upper()
            saida.append(limpar({
                "tipo": "parecer",
                "docTipo": docTipo,
                "docNum": num,
                "secretaria": texto(row[2]).upper(),
                "comQuem": quem,
                "saiuEm": iso(row[3], onde),
                "voltouEm": iso(row[4], onde),
                "origem": "PROCESSOS/%s" % aba,
            }))
    return saida


def achar(pasta, pedaco):
    for p in sorted(pasta.iterdir()):
        if pedaco.lower() in p.name.lower() and p.suffix.lower() == ".xlsx":
            return p
    raise SystemExit("não achei a planilha de %s em %s" % (pedaco, pasta))


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    pasta = Path(sys.argv[1])
    gravar = "--gravar" in sys.argv

    anulacoes = ler_anulacoes(achar(pasta, "ANULA"))
    memorandos = ler_memorandos(achar(pasta, "MEMORANDOS"))
    tramites, pastas = ler_controle(achar(pasta, "Controle_do_Arquivo"))
    tramites += ler_processos(achar(pasta, "PROCESSOS"))

    # id estável: a tela precisa de chave para gravar e desfazer
    for i, t in enumerate(tramites, 1):
        t["id"] = i
    for i, m in enumerate(memorandos, 1):
        m["id"] = i
    for i, p in enumerate(pastas, 1):
        p["id"] = i

    print("anulações : %4d" % len(anulacoes))
    print("trâmites  : %4d" % len(tramites))
    print("memorandos: %4d" % len(memorandos))
    print("pastas    : %4d" % len(pastas))
    print("avisos    : %4d" % len(avisos))

    abertos = [t for t in tramites if t.get("saiuEm") and not t.get("voltouEm")]
    print("\nAINDA FORA (saiu e não consta volta): %d" % len(abertos))
    hoje = date.today()
    def idade(t):
        try:
            return (hoje - date.fromisoformat(t["saiuEm"])).days
        except Exception:
            return -1
    for t in sorted(abertos, key=idade, reverse=True)[:12]:
        print("  %4d dias  %-16s %-22s %s" % (idade(t), t.get("comQuem", ""),
                                              t.get("docTipo", ""), t.get("docNum", "")))

    if not gravar:
        print("\n(ensaio — rode com --gravar para escrever os arquivos)")
        return

    DESTINO.mkdir(parents=True, exist_ok=True)
    for nome, dados in [("tramites", tramites), ("anulacoes", anulacoes),
                        ("memorandos", memorandos), ("pastas", pastas)]:
        alvo = DESTINO / ("%s.json" % nome)
        # uma linha por registro: o diff do git fica legível
        linhas = ",\n".join(json.dumps(d, ensure_ascii=False, sort_keys=True) for d in dados)
        alvo.write_text("[\n%s\n]\n" % linhas, encoding="utf-8")
        print("gravado %s (%d)" % (alvo.relative_to(RAIZ), len(dados)))

    graus = {}
    for a in avisos:
        graus.setdefault(a["grau"], []).append(a)
    md = ["# O que ficou em dúvida na conversão", "",
          "Gerado por `arquivo/ferramentas/planilhas-para-json.py`. Cada linha diz",
          "onde estava, o que a planilha trazia e o que virou. Nada aqui impede o",
          "sistema de funcionar — é lista de conferência.", ""]
    for grau, itens in sorted(graus.items()):
        md.append("## %s (%d)" % (grau, len(itens)))
        md.append("")
        md.append("| onde | campo | na planilha | virou |")
        md.append("|---|---|---|---|")
        for a in itens[:200]:
            md.append("| %s | %s | %s | %s |" % (a["onde"], a["campo"], a["bruto"], a["virou"]))
        md.append("")
    (DESTINO / "CONFERIR.md").write_text("\n".join(md), encoding="utf-8")
    print("gravado arquivo/dados/CONFERIR.md")


if __name__ == "__main__":
    main()
