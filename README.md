# Quiz Teórica

Quizzes da teórica por cadeira e tema, para treinar com a turma. Site estático em GitHub Pages; as perguntas estão cifradas (AES-256-GCM) e só abrem com a password da turma.

- Porquê e como: [PLAN.md](PLAN.md)
- Regras para gerar perguntas: [CLAUDE.md](CLAUDE.md)

Demo atual: conteúdo sintético (`content.example/`), password `demo-quiz-teorica`. Ao gerar o bundle com conteúdo real e uma password nova, a demo desaparece.

```bash
node --test                          # testes
node tools/build.mjs                 # cifra content/ -> docs/data/bundle.enc
python3 -m http.server -d docs 8000  # preview local
```

`materia/` e `content/` estão no `.gitignore` e nunca devem ser commitados.
