# Plano de implementação — Quiz Teórica

## Problema

Site estático (GitHub Pages) para colegas treinarem a teórica, mas a matéria da escola não pode ficar pública.

## Decisão: cifrar no build, decifrar no browser

```
materia/ (PDFs, slides)      -- gitignored, só no teu PC
   │  Claude lê e escreve perguntas
   ▼
content/<cadeira>/<tema>.json -- gitignored, texto em claro
   │  node tools/build.mjs  (pede password)
   ▼
docs/data/bundle.enc          -- commitado, AES-256-GCM
   │  GitHub Pages
   ▼
browser: password -> PBKDF2 -> AES-GCM decrypt -> quiz
```

- **Cripto:** Web Crypto API (nativa no browser e no Node 24, zero dependências).
  - Chave: PBKDF2-SHA256, 600 000 iterações, salt aleatório de 16 bytes.
  - Cifra: AES-256-GCM, IV aleatório de 12 bytes. O GCM autentica: password errada = erro, nunca lixo.
  - O mesmo `docs/crypto.js` é usado pelo browser e pelo script de build.
- **Um só bundle** com todas as cadeiras. Uma password, um pedido, um decrypt.
- **Password** partilhada em privado (grupo da turma). O browser pode lembrá-la (localStorage).
- `<meta name="robots" content="noindex">` para não aparecer em pesquisas.

## O que protege e o que não protege

| Protege | Não protege |
|---|---|
| Quem encontra o repo/site sem password | Um colega que partilha a password |
| Indexação por motores de busca | Alguém que copie as perguntas depois de entrar |
| Matéria original (PDFs nunca saem do PC) | Password fraca: o ficheiro cifrado é público, dá para tentar offline |

Regras:
1. Password longa (4+ palavras aleatórias). PBKDF2 só atrasa, não salva uma password fraca.
2. Nunca commitar `materia/` nem `content/`. Estão no `.gitignore`. Se algum dia entrar em claro, o histórico git fica com ele: apagar o repo e recriar, não basta um commit novo.
3. Trocar a password = `node tools/build.mjs` com a nova + push. O histórico guarda bundles antigos com a password antiga (que já era conhecida pela turma, aceitável).

## Alternativa considerada

Cloudflare Pages + Cloudflare Access (login por email, grátis até 50 pessoas): controlo por pessoa e revogação. Rejeitado por agora: mais setup e gestão de lista. Migração fácil depois: o site é o mesmo, só muda o host.

## Formato das perguntas

`content/<cadeira>/<tema>.json`:

```json
{
  "cadeira": "SAD",
  "tema": "Normalização",
  "perguntas": [
    {
      "q": "Texto da pergunta",
      "opcoes": ["A", "B", "C", "D"],
      "certa": 1,
      "explicacao": "Porque B é correta e as outras não.",
      "fonte": "T3 slides, p. 12"
    }
  ]
}
```

O build valida cada pergunta (opções ≥ 2, `certa` dentro do intervalo, texto não vazio) e falha antes de cifrar.

## Funcionalidades (MVP)

1. Desbloquear com password.
2. Lista de cadeiras e temas com progresso local.
3. Quiz por tema: opções baralhadas, feedback imediato, explicação e fonte.
4. Modo exame: N perguntas aleatórias de uma cadeira, com tempo, correção no fim.
5. Progresso guardado no browser (localStorage).

## Passos

- [x] PRODUCT.md (impeccable init)
- [x] `docs/crypto.js` partilhado + `tools/build.mjs` + validação
- [x] Teste roundtrip (`node --test`)
- [x] App: unlock, lista, quiz, exame, progresso
- [x] Repo GitHub + Pages a servir `docs/`
- [ ] Tu: pôr PDFs em `materia/<cadeira>/` e pedir ao Claude para gerar `content/`
- [ ] Tu: escolher password real, `node tools/build.mjs`, push
- [ ] Depois: passe visual com `/impeccable` (mundo visual próprio)

## Fluxo para adicionar uma cadeira

```bash
mkdir -p materia/SAD   # copia PDFs/slides para aqui
# pede ao Claude: "gera perguntas de materia/SAD por tema" (segue CLAUDE.md)
node tools/build.mjs   # pede password, valida, cifra
git add docs/data && git commit -m "content: SAD" && git push
```
