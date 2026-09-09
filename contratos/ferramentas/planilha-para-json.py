#!/usr/bin/env python3
"""Converte a planilha de contratos em dados/contratos.json.

    python3 contratos/ferramentas/planilha-para-json.py PLANILHA.xlsx            # só relatório
    python3 contratos/ferramentas/planilha-para-json.py PLANILHA.xlsx --gravar   # grava o JSON
    ... --antes contratos-de-ontem.json                                          # compara com outro cadastro

O "antes" da comparação é o próprio dados/contratos.json, que este script
sobrescreve — então rodar duas vezes seguidas faz a segunda comparar o
arquivo com ele mesmo e não achar diferença nenhuma. Para refazer o
relatório depois de já ter gravado, use --antes apontando para a versão
anterior (`git show HEAD~1:contratos/dados/contratos.json > antes.json`).

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

def identificar(novos):
    """Amarra cada aviso ao contrato (nº/ano e empresa) — é assim que quem
    for conferir vai achar o registro na tela, não pelo número da linha."""
    por_linha = {c["_linha"]: c for c in novos}
    for a in avisos:
        c = por_linha.get(a["linha"])
        a["contrato"] = (f"{c['contr']}/{c['ano']}" if c and c["contr"] else
                         (f"?/{c['ano']}" if c else "?"))
        a["empresa"] = (c["empresa"] if c else "")[:42]


def texto(v):
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v)).strip()


def maiusc(v):
    return texto(v).upper()


# Traços de todo tipo aparecem na planilha como separador de item, tanto
# entre secretarias ("SMG-\nSMF-") quanto entre fiscais ("Laura- Matias").
SEPARADORES = r"[\n;,/\-–—]+"

def limpar_ponta(v):
    """Tira o traço/vírgula que sobra quando o separador vem grudado no
    nome ('Laura-' → 'Laura'). O ponto fica: abreviação ('Andre Z.')."""
    return texto(v).strip(" -–—,;:")


def titulo(nome):
    """Nome de pessoa em Caixa Alta vira Caixa de Título, como no cadastro
    que já existe ('Mariana', 'Mario Oliveira'). Preposições ficam baixas."""
    baixas = {"de", "da", "do", "das", "dos", "e"}
    partes = limpar_ponta(nome).lower().split()
    return " ".join(p if i and p in baixas else p.capitalize() for i, p in enumerate(partes))


def lista_de_nomes(v, linha, campo):
    """Fiscais vêm separados por quebra de linha, por ' E ' ou por vírgula —
    às vezes os três na mesma célula."""
    bruto = str(v) if v is not None else ""
    if not texto(bruto):
        return []
    pedacos = re.split(SEPARADORES + r"|\s+[Ee]\s+", bruto)
    nomes = [titulo(p) for p in pedacos if limpar_ponta(p)]
    nomes = [n for n in nomes if len(n) > 1]
    if len(nomes) > 1 and ("\n" in bruto or " E " in bruto.upper()):
        avisar(linha, campo, texto(bruto), nomes, "separado")
    return nomes


def lista_de_siglas(v, linha):
    """Secretarias: 'SMG-\\nSMF-\\nSMH' → ['SMG','SMF','SMH']."""
    bruto = str(v) if v is not None else ""
    if not texto(bruto):
        return []
    pedacos = re.split(SEPARADORES, bruto)
    siglas = [maiusc(limpar_ponta(p)) for p in pedacos if limpar_ponta(p)]
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


def numero_do_cadastro(empresa, ano, modalidade):
    if not DESTINO.exists():
        return None
    try:
        ano = int(float(ano))
    except (TypeError, ValueError):
        return None
    achados = [c for c in cadastro_anterior()
               if c.get("ano") == ano and c.get("empresa", "").upper() == empresa
               and c.get("modalidade", "").upper() == modalidade and c.get("contr")]
    return achados[0]["contr"] if len(achados) == 1 else None


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
            # Número caiu da planilha. Se o contrato já existe no cadastro
            # (mesma empresa, ano e modalidade), o número é o de lá — isso é
            # recuperar, não adivinhar. Sai no relatório de qualquer forma.
            contr = numero_do_cadastro(maiusc(col(3)), col(1), maiusc(col(2)))
            avisar(i, "contr", "(vazio na planilha)",
                   contr if contr else "continua sem número", "CONFERIR")
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


def cadastro_anterior():
    """O cadastro contra o qual comparar: o arquivo atual, ou o que vier em
    --antes (para refazer o relatório depois de já ter gravado)."""
    if "--antes" in sys.argv:
        caminho = Path(sys.argv[sys.argv.index("--antes") + 1])
        return json.loads(caminho.read_text(encoding="utf-8"))
    return json.loads(DESTINO.read_text(encoding="utf-8")) if DESTINO.exists() else []


def casar_ids(novos):
    """Mantém o id de quem já está no cadastro, casando por número+ano."""
    antigos = cadastro_anterior()
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
        print(f"  contrato {a['contrato']:<10} {a['campo']:<11} {a['bruto']!r:<26} → {a['virou']!r}")
        print(f"           {a['empresa']}")
    print(f"\nnormalizados sem dúvida: {len(ajustes)} "
          f"(valores com ponto/vírgula trocados, listas separadas)")


def rotulo(c):
    """Como o contrato aparece no relatório. Sem número não dá para procurar
    pelo número: mostra o id, que é por onde a tela abre o registro."""
    if c.get("contr") and c.get("ano"):
        return f"{c['contr']}/{c['ano']}"
    return f"sem número (id {c.get('id')})"


def escrever_conferencia(novos, antigos):
    """Deixa a lista de pendências num arquivo, não só na tela: quem for
    conferir faz isso depois, contrato por contrato, direto na tela do
    sistema — e precisa da lista em mãos, pelo NÚMERO do contrato."""
    conferir = [a for a in avisos if a["grau"] == "CONFERIR"]
    antes = {(c.get("contr"), c.get("ano")) for c in antigos}
    entram = [c for c in novos if (c["contr"], c["ano"]) not in antes]
    saem = [c for c in antigos if (c.get("contr"), c.get("ano")) not in
            {(n["contr"], n["ano"]) for n in novos}]
    mudou_valor = []
    por_chave = {(c.get("contr"), c.get("ano")): c for c in antigos}
    for c in novos:
        velho = por_chave.get((c["contr"], c["ano"]))
        if velho and velho.get("valor") and c["valor"] and \
           abs(velho["valor"] - c["valor"]) / max(velho["valor"], c["valor"]) > 0.01:
            mudou_valor.append((c, velho["valor"]))

    def brl(v):
        return "—" if v is None else f"R$ {v:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")

    L = []
    L.append("# Contratos a conferir na tela\n")
    L.append(f"Gerado a partir da planilha em {datetime.now():%d/%m/%Y}. "
             f"São {len(conferir)} registros em que a planilha estava ambígua e o "
             f"conversor teve de decidir. Tudo já entrou no sistema com o valor da "
             f"coluna \"virou\" — basta abrir o contrato pelo número, conferir e "
             f"corrigir o que estiver errado.\n")

    L.append("## Onde o conversor teve de decidir\n")
    L.append("| Contrato | Empresa | Campo | Estava na planilha | Entrou como |")
    L.append("|---|---|---|---|---|")
    for a in sorted(conferir, key=lambda x: (x["campo"], x["contrato"])):
        virou = a["virou"]
        if a["campo"] == "valor":
            virou = brl(virou)
        L.append(f"| **{a['contrato']}** | {a['empresa']} | {a['campo']} | "
                 f"`{a['bruto']}` | **{virou if virou is not None else 'em branco'}** |")

    # Linha com número mas nada mais: ou é um contrato ainda por preencher, ou
    # é sobra da planilha. Quem confere decide — o conversor não apaga nada.
    vazios = [c for c in novos if not c["empresa"] and not c["objeto"]]
    if vazios:
        L.append(f"\n## Linhas praticamente em branco na planilha ({len(vazios)})\n")
        L.append("Só o número veio preenchido. Entraram assim mesmo: confira se é "
                 "contrato a preencher ou se deve ser excluído pela tela.\n")
        L.append("| Contrato | O que veio |")
        L.append("|---|---|")
        for c in sorted(vazios, key=lambda x: (x["ano"] or 0, x["contr"] or 0)):
            veio = ", ".join(k for k in ("empresa", "objeto", "valor", "vencimento",
                                         "modalidade") if c.get(k)) or "nada além do número"
            L.append(f"| **{rotulo(c)}** | {veio} |")

    ativos_sem = [c for c in novos if c["situacao"].startswith("ATIVO") and not c["vencimento"]]
    if ativos_sem:
        L.append(f"\n## Contratos ATIVOS sem vencimento ({len(ativos_sem)})\n")
        L.append("A planilha não trazia a data. Entraram em branco.\n")
        L.append("| Contrato | Empresa |")
        L.append("|---|---|")
        for c in sorted(ativos_sem, key=lambda x: (x["ano"] or 0, x["contr"] or 0)):
            L.append(f"| **{c['contr']}/{c['ano']}** | {c['empresa'][:52]} |")

    ativos_sv = [c for c in novos if c["situacao"].startswith("ATIVO") and not c["valor"]]
    if ativos_sv:
        L.append(f"\n## Contratos ATIVOS sem valor ({len(ativos_sv)})\n")
        L.append("A planilha trazia a célula vazia ou zerada.\n")
        L.append("| Contrato | Empresa | Na planilha |")
        L.append("|---|---|---|")
        for c in sorted(ativos_sv, key=lambda x: (x["ano"] or 0, x["contr"] or 0)):
            L.append(f"| **{c['contr']}/{c['ano']}** | {c['empresa'][:52]} | "
                     f"{'zero' if c['valor'] == 0 else 'em branco'} |")

    if mudou_valor:
        L.append(f"\n## Valores que mudaram em relação ao cadastro anterior ({len(mudou_valor)})\n")
        L.append("Provavelmente aditivos lançados na planilha. Não é erro — "
                 "está aqui só para você saber o que mudou.\n")
        L.append("| Contrato | Empresa | Era | Agora |")
        L.append("|---|---|---|---|")
        for c, antigo in sorted(mudou_valor, key=lambda x: (x[0]["ano"] or 0, x[0]["contr"] or 0)):
            L.append(f"| **{c['contr']}/{c['ano']}** | {c['empresa'][:40]} | {brl(antigo)} | {brl(c['valor'])} |")

    if entram:
        L.append(f"\n## Entraram agora ({len(entram)})\n")
        L.append("| Contrato | Empresa | Situação | Vencimento |")
        L.append("|---|---|---|---|")
        for c in sorted(entram, key=lambda x: (x["ano"] or 0, x["contr"] or 0)):
            L.append(f"| **{c['contr']}/{c['ano']}** | {c['empresa'][:40]} | {c['situacao']} | "
                     f"{c['vencimento'] or '—'} |")

    if saem:
        L.append(f"\n## Estavam no cadastro e não vieram na planilha ({len(saem)})\n")
        L.append("Não entram no banco. Se algum deveria estar lá, cadastre pela tela.\n")
        L.append("| Contrato | Empresa | Situação |")
        L.append("|---|---|---|")
        for c in sorted(saem, key=lambda x: (x.get("ano") or 0, x.get("contr") or 0)):
            L.append(f"| **{rotulo(c)}** | {(c.get('empresa') or '(em branco)')[:40]} | "
                     f"{c.get('situacao') or '—'} |")

    destino = RAIZ / "contratos" / "dados" / "CONFERIR.md"
    destino.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"relatório de conferência: {destino.relative_to(RAIZ)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    novos = converter(sys.argv[1])
    antigos = casar_ids(novos)
    identificar(novos)
    relatorio(novos, antigos)

    if "--gravar" in sys.argv:
        escrever_conferencia(novos, antigos)
        saida = [{k: v for k, v in sorted(c.items()) if k != "_linha"} for c in novos]
        DESTINO.write_text(
            "[\n" + ",\n".join("  " + json.dumps(c, ensure_ascii=False) for c in saida) + "\n]\n",
            encoding="utf-8")
        print(f"\ngravado: {DESTINO.relative_to(RAIZ)}  ({len(saida)} contratos)")
    else:
        print("\n(ensaio — nada gravado. Use --gravar para valer.)")
