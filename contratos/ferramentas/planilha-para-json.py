#!/usr/bin/env python3
"""Converte a planilha de contratos em dados/contratos.json.

    python3 contratos/ferramentas/planilha-para-json.py PLANILHA.xlsx            # só relatório
    python3 contratos/ferramentas/planilha-para-json.py PLANILHA.xlsx --gravar   # grava o JSON

A planilha é preenchida à mão, ao longo de anos, por várias pessoas — então
vem com valor digitado de tudo quanto é jeito ("18.000.00", "191940 08",
"1.449,895,56"), data sem barra, secretaria separada por hífen e quebra de
linha, fiscal com "E" no meio. O trabalho aqui é normalizar isso SEM
inventar: tudo que exigiu adivinhação sai no relatório, marcado, para
conferência antes de virar cadastro.

O `id` de cada contrato é a chave do documento no Firestore. Contratos que
já existem no JSON atual mantêm o id que tinham (casando por número+ano);
os novos recebem ids seguintes. Assim reimportar não embaralha nada.
"""
import json, re, sys, unicodedata
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / "contratos" / "dados" / "contratos.json"

COLUNAS = {  # posição na planilha (0-based) -> campo
    0: "contr", 1: "ano", 2: "modalidade", 3: "empresa", 4: "secretarias",
    5: "objeto", 6: "tipo", 7: "palavra", 8: "valor", 9: "fiscalAdm",
    10: "fiscalTec", 11: "vencimento", 12: "situacao", 13: "obs",
}
SITUACOES = {"ATIVO", "INATIVO", "ATIVO-PARALIZADO"}

avisos = []
def avisar(linha, campo, bruto, virou, grau="ajustado"):
    avisos.append({"linha": linha, "campo": campo, "bruto": bruto, "virou": virou, "grau": grau})


def texto(v):
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v)).strip()


def maiusc(v):
    return texto(v).upper()


def titulo(nome):
    """Nome de pessoa em Caixa Alta vira Caixa de Título, como no cadastro
    que já existe ('Mariana', 'Mario Oliveira'). Preposições ficam baixas."""
    baixas = {"de", "da", "do", "das", "dos", "e"}
    partes = texto(nome).lower().split()
    return " ".join(p if i and p in baixas else p.capitalize() for i, p in enumerate(partes))


def lista_de_nomes(v, linha, campo):
    """Fiscais vêm separados por quebra de linha, por ' E ' ou por vírgula —
    às vezes os três na mesma célula."""
    bruto = str(v) if v is not None else ""
    if not texto(bruto):
        return []
    pedacos = re.split(r"[\n;,/]+|\s+[Ee]\s+", bruto)
    nomes = [titulo(p) for p in pedacos if texto(p)]
    nomes = [n for n in nomes if len(n) > 1]
    if len(nomes) > 1 and ("\n" in bruto or " E " in bruto.upper()):
        avisar(linha, campo, texto(bruto), nomes, "separado")
    return nomes


def lista_de_siglas(v, linha):
    """Secretarias: 'SMG-\\nSMF-\\nSMH' → ['SMG','SMF','SMH']."""
    bruto = str(v) if v is not None else ""
    if not texto(bruto):
        return []
    pedacos = re.split(r"[\n;,/-]+", bruto)
    siglas = [maiusc(p) for p in pedacos if texto(p)]
    if len(siglas) > 1:
        avisar(linha, "secretarias", texto(bruto), siglas, "separado")
    return siglas


def numero(v, linha):
    """Valor em reais. Aceita o que a planilha traz de verdade:
    '117.753,61', '67533.86', '191940 08', '18.000.00', '55426,24.'…

    A regra é: o ÚLTIMO separador que sobrar com 1 ou 2 dígitos depois é o
    decimal; todo o resto é separador de milhar. O que não couber nisso sai
    no relatório para conferência."""
    if v is None or texto(v) == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)

    bruto = texto(v)
    limpo = re.sub(r"[^\d.,\s]", "", bruto)           # tira ¨, R$, etc.
    limpo = re.sub(r"(?<=\d)\s+(?=\d)", ".", limpo)   # '191940 08' → '191940.08'
    limpo = re.sub(r"[.,]+$", "", limpo.strip())      # '72.600,00.' → '72.600,00'
    limpo = re.sub(r"\s", "", limpo)

    seps = [(m.start(), m.group()) for m in re.finditer(r"[.,]", limpo)]
    if not seps:
        valor = float(limpo) if limpo else None
    else:
        pos, _ = seps[-1]
        casas = len(limpo) - pos - 1
        if casas in (1, 2):                           # último separador é o decimal
            inteiro = re.sub(r"[.,]", "", limpo[:pos])
            valor = float(f"{inteiro}.{limpo[pos+1:]}")
        else:                                         # todos são de milhar
            valor = float(re.sub(r"[.,]", "", limpo))

    # Mais de um separador diferente, ou vírgula repetida, é digitação
    # ambígua: converte, mas manda conferir.
    grau = "CONFERIR" if len(seps) > 1 and len({s for _, s in seps}) > 1 or limpo.count(",") > 1 else "ajustado"
    avisar(linha, "valor", bruto, valor, grau)
    return valor


def data(v, linha):
    """Vencimento. A planilha guarda data de verdade quase sempre; o resto é
    digitação em que a barra escapou ('0308/2027' = 03/08/2027)."""
    if v is None or texto(v) == "":
        return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")

    bruto = texto(v)
    so_digito = re.sub(r"\D", "", bruto)
    if len(so_digito) == 8:                           # ddmmaaaa
        d, m, a = so_digito[:2], so_digito[2:4], so_digito[4:]
        try:
            iso = datetime(int(a), int(m), int(d)).strftime("%Y-%m-%d")
            avisar(linha, "vencimento", bruto, iso, "CONFERIR")
            return iso
        except ValueError:
            pass
    avisar(linha, "vencimento", bruto, None, "CONFERIR")
    return None


def converter(caminho):
    import openpyxl
    ws = openpyxl.load_workbook(caminho, data_only=True)[ "Planilha1" ]
    linhas = [(i, r) for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True), 2)
              if any(texto(x) for x in r)]

    contratos = []
    for i, r in linhas:
        def col(n):
            return r[n] if n < len(r) else None

        situacao = maiusc(col(12))
        if situacao and situacao not in SITUACOES:
            corrigida = "ATIVO-PARALIZADO" if "PARALIZ" in situacao else situacao
            avisar(i, "situacao", situacao, corrigida, "CONFERIR")
            situacao = corrigida

        contr = col(0)
        if contr is None or texto(contr) == "":
            avisar(i, "contr", "(vazio)", None, "CONFERIR")
            contr = None
        else:
            contr = int(float(contr))

        contratos.append({
            "contr": contr,
            "ano": int(float(col(1))) if texto(col(1)) else None,
            "modalidade": maiusc(col(2)),
            "empresa": maiusc(col(3)),
            "objeto": texto(col(5)),
            "tipo": maiusc(col(6)),
            "palavra": maiusc(col(7)),
            "situacao": situacao,
            "obs": texto(col(13)),
            "secretarias": lista_de_siglas(col(4), i),
            "fiscalAdm": lista_de_nomes(col(9), i, "fiscalAdm"),
            "fiscalTec": lista_de_nomes(col(10), i, "fiscalTec"),
            "vencimento": data(col(11), i),
            "valor": numero(col(8), i),
            "_linha": i,
        })
    return contratos


def casar_ids(novos):
    """Mantém o id de quem já está no cadastro, casando por número+ano."""
    antigos = json.loads(DESTINO.read_text(encoding="utf-8")) if DESTINO.exists() else []
    por_chave = {(c.get("contr"), c.get("ano")): c["id"] for c in antigos}
    usados = {c["id"] for c in antigos}
    proximo = max(usados) + 1 if usados else 1

    for c in novos:
        chave = (c["contr"], c["ano"])
        if chave in por_chave and por_chave[chave] not in [x.get("id") for x in novos if "id" in x]:
            c["id"] = por_chave[chave]
        else:
            while proximo in usados:
                proximo += 1
            c["id"] = proximo
            usados.add(proximo)
    return antigos


def relatorio(novos, antigos):
    print(f"\n{'='*66}\nPLANILHA → JSON\n{'='*66}")
    print(f"contratos na planilha ....... {len(novos)}")
    print(f"contratos no cadastro hoje .. {len(antigos)}")

    antes = {(c.get("contr"), c.get("ano")) for c in antigos}
    agora = {(c["contr"], c["ano"]) for c in novos}
    print(f"  entram (novos) ............ {len(agora - antes)}")
    print(f"  saem (não vieram) ......... {len(antes - agora)}")
    print(f"  continuam ................. {len(agora & antes)}")

    faltando = {campo: sum(1 for c in novos if not c.get(campo)) for campo in
                ("vencimento", "valor", "empresa", "objeto", "situacao", "secretarias")}
    print("\ncampos em branco:")
    for campo, n in faltando.items():
        if n:
            print(f"  {campo:14} {n}")

    ativos = [c for c in novos if c["situacao"].startswith("ATIVO")]
    print(f"\nativos: {len(ativos)}   inativos: {len(novos)-len(ativos)}")
    sem_venc = [c for c in ativos if not c["vencimento"]]
    if sem_venc:
        print(f"  ATENÇÃO: {len(sem_venc)} contrato(s) ATIVO(s) sem vencimento — "
              f"linha(s) {[c['_linha'] for c in sem_venc]}")

    conferir = [a for a in avisos if a["grau"] == "CONFERIR"]
    ajustes = [a for a in avisos if a["grau"] == "ajustado"]
    print(f"\n{'-'*66}\nPRECISA DE CONFERÊNCIA: {len(conferir)}\n{'-'*66}")
    for a in conferir:
        print(f"  linha {a['linha']:>5}  {a['campo']:<11} {a['bruto']!r:<28} → {a['virou']!r}")
    print(f"\nnormalizados sem dúvida: {len(ajustes)} "
          f"(valores com ponto/vírgula trocados, listas separadas)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    novos = converter(sys.argv[1])
    antigos = casar_ids(novos)
    relatorio(novos, antigos)

    if "--gravar" in sys.argv:
        saida = [{k: v for k, v in sorted(c.items()) if k != "_linha"} for c in novos]
        DESTINO.write_text(
            "[\n" + ",\n".join("  " + json.dumps(c, ensure_ascii=False) for c in saida) + "\n]\n",
            encoding="utf-8")
        print(f"\ngravado: {DESTINO.relative_to(RAIZ)}  ({len(saida)} contratos)")
    else:
        print("\n(ensaio — nada gravado. Use --gravar para valer.)")
