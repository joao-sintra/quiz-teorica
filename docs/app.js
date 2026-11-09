import { decrypt, open } from './crypto.js';

const main = document.querySelector('main');
let data = null;
let key = null;
let cleanup = () => {};
let onKey = null;

// --- tiny DOM helpers ------------------------------------------------------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...kids.flat().filter((k) => k != null && k !== false));
  return el;
}

function show(...kids) {
  cleanup();
  cleanup = () => {};
  onKey = null;
  main.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  main.querySelector('h1')?.focus();
  scrollTo(0, 0);
}

addEventListener('keydown', (e) => {
  if (onKey && !e.target.matches('input, textarea') && !e.ctrlKey && !e.metaKey && !e.altKey) onKey(e);
});

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- storage (may be unavailable in private windows) ----------------------
const store = {
  get(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  },
  set(k, v) {
    try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
};

// Progress is keyed by question text so reordering or adding questions keeps it.
// Leitner boxes: a right answer moves the question up a box (reviewed less often), a wrong one resets it.
const DAY = 864e5;
const BOX_DAYS = [0, 1, 3, 7, 14];
const progress = store.get('qt-progress', {});
for (const k of Object.keys(progress)) {
  if (typeof progress[k] === 'boolean') progress[k] = { ok: progress[k], box: progress[k] ? 1 : 0, due: Date.now() + (progress[k] ? DAY : 0) };
}
const marks = new Set(store.get('qt-marks', []));
const log = store.get('qt-log', {}); // 'YYYY-MM-DD': [answered, right]
const today = () => new Date().toLocaleDateString('sv');

const pkey = (it) => `${it.c}|${it.t}|${it.p.q}`;
const seen = (it) => progress[pkey(it)];
const isRight = (it) => seen(it)?.ok === true;
const isWrong = (it) => seen(it)?.ok === false;
const isDue = (it) => seen(it) && seen(it).due <= Date.now();
const isMarked = (it) => marks.has(pkey(it));

function record(it, ok) {
  const box = ok ? Math.min((seen(it)?.box ?? 0) + 1, BOX_DAYS.length - 1) : 0;
  progress[pkey(it)] = { ok, box, due: Date.now() + BOX_DAYS[box] * DAY };
  const d = (log[today()] ??= [0, 0]);
  d[0]++;
  if (ok) d[1]++;
  store.set('qt-progress', progress);
  store.set('qt-log', log);
}

function toggleMark(it) {
  const k = pkey(it);
  marks.has(k) ? marks.delete(k) : marks.add(k);
  store.set('qt-marks', [...marks]);
}

// --- questions -------------------------------------------------------------
const itemsOf = (c, temas = c.temas) => temas.flatMap((t) => t.perguntas.map((p) => ({ c: c.nome, t: t.nome, p })));
const certasOf = (p) => (Array.isArray(p.certa) ? p.certa : [p.certa]);
const optionsOf = (p) => shuffle(p.opcoes.map((text, i) => ({ text, ok: certasOf(p).includes(i) })));
const isMulti = (opts) => opts.filter((o) => o.ok).length > 1;
// sel = chosen option indexes; right only when exactly the correct set is chosen
const gradeOf = (opts, sel) => sel.length > 0 && opts.every((o, k) => o.ok === sel.includes(k));
const answerText = (p) => certasOf(p).map((k) => p.opcoes[k]).join(' · ');

function topBar(label, ...extra) {
  return h('header', { class: 'bar' },
    h('button', { class: 'link', onclick: () => home() }, 'Temas'),
    h('span', { class: 'crumb' }, label),
    ...extra);
}

function option(o, n, onclick) {
  return h('button', { class: 'opcao', 'aria-pressed': 'false', onclick }, h('kbd', {}, String(n + 1)), h('span', {}, o.text));
}

function markButton(it) {
  const b = h('button', {
    class: 'link marca',
    'aria-pressed': String(isMarked(it)),
    onclick: () => { toggleMark(it); b.setAttribute('aria-pressed', String(isMarked(it))); b.textContent = isMarked(it) ? 'Marcada' : 'Marcar'; },
  }, isMarked(it) ? 'Marcada' : 'Marcar');
  return b;
}

// Quiz images and slides are encrypted with the bundle key; decrypted once into blob URLs.
const images = new Map();
function picture(meta, alt, cls) {
  const img = h('img', { alt, class: cls, decoding: 'async' });
  if (!images.has(meta.src)) {
    images.set(meta.src, fetch(meta.src)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((buf) => open(key, new Uint8Array(buf)))
      .then((bytes) => URL.createObjectURL(new Blob([bytes], { type: meta.type }))));
  }
  images.get(meta.src)
    .then((url) => { img.src = url; })
    .catch(() => { images.delete(meta.src); img.replaceWith(h('p', { class: 'error' }, 'Não foi possível carregar a imagem.')); });
  return img;
}
const figure = (p) => p.imagem && picture(p.imagem, p.imagemAlt, 'figura');

function slideButton(p) {
  if (!p.slide) return null;
  const box = h('div');
  const btn = h('button', {
    class: 'link',
    onclick: () => { btn.remove(); box.replaceChildren(picture(p.slide, `Slide de origem: ${p.fonte}`, 'figura slide')); },
  }, 'Ver slide');
  return h('div', { class: 'slide-box' }, btn, box);
}

const explanation = (p) => [h('p', {}, p.explicacao), h('p', { class: 'fonte' }, 'Fonte: ', p.fonte), slideButton(p)];

// --- unlock ---------------------------------------------------------------
async function unlock(password, remember) {
  if (!globalThis.crypto?.subtle) throw new Error('WEB_CRYPTO_UNAVAILABLE');
  const res = await fetch('data/bundle.enc', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  ({ value: data, key } = await decrypt(await res.json(), password));
  if (remember) store.set('qt-pass', password);
  home();
}

function lockScreen(message = '') {
  const input = h('input', { type: 'password', id: 'pw', name: 'password', autocomplete: 'current-password', required: true });
  const remember = h('input', { type: 'checkbox', id: 'rem', checked: true });
  const error = h('p', { class: 'error', role: 'alert' }, message);
  const submit = h('button', { type: 'submit', class: 'primary' }, 'Entrar');
  const form = h('form', {
    class: 'unlock',
    onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      submit.textContent = 'A abrir…';
      error.textContent = '';
      try {
        await unlock(input.value, remember.checked);
      } catch (x) {
        error.textContent = x.name === 'OperationError'
          ? 'Password errada. Confirma-a com quem te passou o link.'
          : x.message === 'WEB_CRYPTO_UNAVAILABLE'
            ? 'Este endereço não permite cifra segura. Abre em localhost ou HTTPS.'
            : x.message?.startsWith('HTTP ')
              ? `Não foi possível carregar o bundle (${x.message}). Confirma a pasta do servidor.`
              : 'Não foi possível carregar as perguntas. Verifica a ligação e tenta outra vez.';
        submit.disabled = false;
        submit.textContent = 'Entrar';
        input.select();
      }
    },
  },
  h('label', { for: 'pw' }, 'Password da turma'),
  input,
  h('label', { class: 'check', for: 'rem' }, remember, 'Lembrar neste dispositivo'),
  submit,
  error);

  show(
    h('h1', { tabindex: -1 }, 'Quiz Teórica'),
    h('p', { class: 'lede' }, 'Perguntas da teórica por cadeira e tema, com explicação e a fonte de cada resposta.'),
    form,
  );
  input.focus();
}

// --- home -----------------------------------------------------------------
function home() {
  const forget = () => {
    store.set('qt-pass', null);
    data = null;
    lockScreen();
  };
  show(
    h('header', { class: 'bar' },
      h('span', { class: 'crumb' }, 'Quiz Teórica'),
      h('button', { class: 'link', onclick: stats }, 'Estatísticas'),
      h('button', { class: 'link', onclick: forget }, 'Sair')),
    h('h1', { tabindex: -1 }, 'Escolhe um tema'),
    data.cadeiras.map(cadeiraSection),
  );
}

// Which test (0 = everything) each subject is filtered to, remembered per browser.
const testFilter = store.get('qt-teste', {});
const testLabel = (n) => (n ? `${n}º teste` : 'Tudo');

function cadeiraSection(c) {
  const tests = [...new Set(c.temas.flatMap((t) => t.testes ?? []))].sort();
  let chosen = tests.includes(testFilter[c.nome]) ? testFilter[c.nome] : 0;
  const temas = () => (chosen ? c.temas.filter((t) => t.testes?.includes(chosen)) : c.temas);
  const label = () => (chosen ? `${c.nome} · ${testLabel(chosen)}` : c.nome);

  const list = h('ul', { class: 'temas' });
  const acoes = h('div', { class: 'acoes' });
  const render = () => {
    const all = itemsOf(c, temas());
    const sets = [
      ['Revisão do dia', all.filter(isDue), 'revisão'],
      ['Erradas', all.filter(isWrong), 'erradas'],
      ['Marcadas', all.filter(isMarked), 'marcadas'],
    ];
    acoes.replaceChildren(
      ...sets.map(([name, items, tag]) => h('button', { disabled: items.length === 0, onclick: () => study(`${label()} · ${tag}`, items) }, `${name} (${items.length})`)),
      h('button', { onclick: () => examSetup(c, temas(), label()) }, 'Modo exame'));
    list.replaceChildren(...temas().map((t) => {
      const items = itemsOf(c, [t]);
      const right = items.filter(isRight).length;
      return h('li', { class: 'tema-linha' },
        h('button', { class: 'tema', onclick: () => study(`${c.nome} · ${t.nome}`, items) },
          h('span', {}, t.nome),
          h('span', { class: 'score', 'aria-label': `${right} de ${items.length} certas` }, `${right}/${items.length}`)),
        h('button', { class: 'link', 'aria-label': `Flashcards de ${t.nome}`, onclick: () => flash(`${c.nome} · ${t.nome}`, items) }, 'Flashcards'));
    }));
  };

  const filters = [0, ...tests].map((n) => h('button', {
    class: 'filtro',
    'aria-pressed': String(n === chosen),
    onclick: () => {
      chosen = n;
      testFilter[c.nome] = n;
      store.set('qt-teste', testFilter);
      filters.forEach((b, k) => b.setAttribute('aria-pressed', String(k === [0, ...tests].indexOf(n))));
      render();
    },
  }, testLabel(n)));

  render();
  return h('section', { class: 'cadeira' },
    h('div', { class: 'cadeira-head' }, h('h2', {}, c.nome)),
    tests.length > 0 && h('div', { class: 'filtros', role: 'group', 'aria-label': `Matéria de ${c.nome}` }, filters),
    acoes,
    list);
}

// --- study: a set of questions, immediate feedback -------------------------
function study(label, source) {
  const items = shuffle(source);
  let i = 0;
  let right = 0;

  const ask = () => {
    if (i === items.length) return done(label, right, items.length, () => study(label, source));
    const it = items[i];
    const opts = optionsOf(it.p);
    const multi = isMulti(opts);
    const sel = new Set();
    let answered = false;
    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });

    const grade = () => {
      if (answered || sel.size === 0) return;
      answered = true;
      const ok = gradeOf(opts, [...sel]);
      if (ok) right++;
      record(it, ok);
      buttons.forEach((b, k) => {
        b.disabled = true;
        if (opts[k].ok) b.classList.add(sel.has(k) || !multi ? 'certa' : 'falta');
        else if (sel.has(k)) b.classList.add('errada');
      });
      confirmBtn && confirmBtn.remove();
      const next = h('button', { class: 'primary', onclick: () => { i++; ask(); } }, i + 1 === items.length ? 'Ver resultado' : 'Seguinte');
      feedback.replaceChildren(
        h('p', { class: ok ? 'verdict ok' : 'verdict bad' }, ok ? 'Certo.' : 'Errado.'),
        ...explanation(it.p),
        next);
      next.focus();
    };
    const pick = (n) => {
      if (answered) return;
      if (!multi) { sel.add(n); return grade(); }
      sel.has(n) ? sel.delete(n) : sel.add(n);
      buttons[n].setAttribute('aria-pressed', String(sel.has(n)));
    };
    const buttons = opts.map((o, n) => option(o, n, () => pick(n)));
    const confirmBtn = multi && h('button', { class: 'primary', onclick: grade }, 'Confirmar');

    show(
      topBar(label, h('span', { class: 'count' }, `${i + 1}/${items.length}`)),
      h('p', { class: 'meta' }, it.t, ' ', markButton(it)),
      h('h1', { tabindex: -1, class: 'pergunta' }, it.p.q),
      multi && h('p', { class: 'meta' }, 'Há mais do que uma resposta certa. Escolhe todas e confirma.'),
      figure(it.p),
      h('div', { class: 'opcoes' }, buttons),
      confirmBtn,
      feedback,
    );
    onKey = (e) => {
      const n = Number(e.key) - 1;
      if (n >= 0 && n < opts.length) pick(n);
    };
  };
  ask();
}

function done(label, right, total, again) {
  show(
    topBar(label),
    h('h1', { tabindex: -1 }, `${right} de ${total} certas`),
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: again }, 'Repetir'),
      h('button', { onclick: () => home() }, 'Voltar aos temas')),
  );
}

// --- flashcards: see the question, reveal the answer, say if you knew it ----
function flash(label, source) {
  const items = shuffle(source);
  let i = 0;
  let knew = 0;

  const card = () => {
    if (i === items.length) return done(`${label} · flashcards`, knew, items.length, () => flash(label, source));
    const it = items[i];
    let revealed = false;
    const back = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const grade = (ok) => {
      if (!revealed) return;
      if (ok) knew++;
      record(it, ok);
      i++;
      card();
    };
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      show_.remove();
      back.replaceChildren(
        h('p', {}, h('strong', {}, answerText(it.p))),
        ...explanation(it.p),
        h('div', { class: 'actions' },
          h('button', { class: 'primary', onclick: () => grade(true) }, 'Soube'),
          h('button', { onclick: () => grade(false) }, 'Não soube')));
    };
    const show_ = h('button', { class: 'primary', onclick: reveal }, 'Mostrar resposta');

    show(
      topBar(`${label} · flashcards`, h('span', { class: 'count' }, `${i + 1}/${items.length}`)),
      h('p', { class: 'meta' }, it.t, ' ', markButton(it)),
      h('h1', { tabindex: -1, class: 'pergunta' }, it.p.q),
      figure(it.p),
      show_,
      back,
    );
    show_.focus();
    onKey = (e) => {
      if (e.key === '1') grade(true);
      else if (e.key === '2') grade(false);
    };
  };
  card();
}

// --- exam: random questions across chosen topics, timed, graded at the end --
function examSetup(c, temas = c.temas, label = c.nome) {
  const boxes = c.temas.map((t, k) => h('input', { type: 'checkbox', id: `t${k}`, checked: temas.includes(t) }));
  const chosen = () => c.temas.filter((_, k) => boxes[k].checked);
  const total = () => itemsOf(c, chosen()).length;
  const count = h('input', { type: 'number', id: 'n', min: 1, required: true });
  const minutes = h('input', { type: 'number', id: 'min', min: 1, max: 300, required: true });
  const hint = h('p', { class: 'meta' });
  const error = h('p', { class: 'error', role: 'alert' });
  const sync = () => {
    const max = total();
    count.max = String(max);
    if (!count.value || Number(count.value) > max) count.value = String(Math.min(20, max));
    minutes.value ||= String(Math.max(1, Math.min(20, max)));
    hint.textContent = `Máximo ${max} perguntas.`;
  };
  boxes.forEach((b) => b.addEventListener('change', sync));
  sync();
  show(
    topBar(label),
    h('h1', { tabindex: -1 }, 'Modo exame'),
    h('p', { class: 'lede' }, `Perguntas aleatórias dos temas escolhidos de ${c.nome}. A correção só aparece no fim.`),
    h('form', {
      class: 'exam-setup',
      onsubmit: (e) => {
        e.preventDefault();
        const picked = chosen();
        if (picked.length === 0) { error.textContent = 'Escolhe pelo menos um tema.'; return; }
        exam(label, shuffle(itemsOf(c, picked)).slice(0, Number(count.value)), Number(minutes.value) * 60, () => examSetup(c, picked, label));
      },
    },
    h('fieldset', { class: 'temas-exame' },
      h('legend', {}, 'Temas'),
      c.temas.map((t, k) => h('label', { class: 'check', for: `t${k}` }, boxes[k], t.nome))),
    h('label', { for: 'n' }, 'Perguntas'), count, hint,
    h('label', { for: 'min' }, 'Minutos'), minutes,
    error,
    h('button', { type: 'submit', class: 'primary' }, 'Começar')),
  );
}

function exam(label, items, seconds, again) {
  const opts = items.map((it) => optionsOf(it.p));
  const answers = items.map(() => []);
  const end = Date.now() + seconds * 1000;
  let i = 0;

  const clock = h('span', { class: 'clock', role: 'timer', 'aria-label': 'Tempo restante' });
  const body = h('div', { class: 'exam' });
  const finish = () => examResults(label, items, opts, answers, again);
  const leave = () => {
    if (confirm('Sair do exame? As respostas perdem-se.')) home();
  };

  const tick = () => {
    const s = Math.max(0, Math.round((end - Date.now()) / 1000));
    clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    clock.classList.toggle('low', s <= 60);
    if (s === 0) finish();
  };

  const render = () => {
    const it = items[i];
    const multi = isMulti(opts[i]);
    const paint = () => buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(answers[i].includes(k))));
    const select = (n) => {
      const a = answers[i];
      answers[i] = !multi ? [n] : a.includes(n) ? a.filter((k) => k !== n) : [...a, n];
      paint();
    };
    const buttons = opts[i].map((o, n) => option(o, n, () => select(n)));
    paint();
    const last = i === items.length - 1;
    body.replaceChildren(
      h('p', { class: 'meta' }, `${i + 1}/${items.length} · ${it.t} `, markButton(it)),
      h('h1', { tabindex: -1, class: 'pergunta' }, it.p.q),
      multi && h('p', { class: 'meta' }, 'Há mais do que uma resposta certa.'),
      figure(it.p),
      h('div', { class: 'opcoes' }, buttons),
      h('div', { class: 'actions' },
        i > 0 && h('button', { onclick: () => { i--; render(); } }, 'Anterior'),
        last
          ? h('button', { class: 'primary', onclick: finish }, 'Entregar')
          : h('button', { class: 'primary', onclick: () => { i++; render(); } }, 'Seguinte')),
    );
    body.querySelector('h1').focus();
    onKey = (e) => {
      const n = Number(e.key) - 1;
      if (n >= 0 && n < opts[i].length) select(n);
    };
  };

  show(
    h('header', { class: 'bar' },
      h('button', { class: 'link', onclick: leave }, 'Sair'),
      h('span', { class: 'crumb' }, `${label} · exame`),
      clock,
      h('button', { class: 'link', onclick: finish }, 'Entregar')),
    body,
  );
  tick();
  const timer = setInterval(tick, 1000);
  cleanup = () => clearInterval(timer);
  render();
}

function examResults(label, items, opts, answers, again) {
  const ok = items.map((_, k) => gradeOf(opts[k], answers[k]));
  items.forEach((it, k) => { if (answers[k].length) record(it, ok[k]); });
  const right = ok.filter(Boolean).length;
  const byTema = new Map();
  items.forEach((it, k) => {
    const r = byTema.get(it.t) ?? [0, 0];
    r[1]++;
    if (ok[k]) r[0]++;
    byTema.set(it.t, r);
  });

  show(
    topBar(`${label} · exame`),
    h('h1', { tabindex: -1 }, `${right} de ${items.length} certas`),
    h('table', { class: 'por-tema' },
      h('caption', {}, 'Resultado por tema'),
      h('tbody', {}, [...byTema].map(([t, [r, n]]) => h('tr', {},
        h('th', { scope: 'row' }, t),
        h('td', { class: 'num' }, `${r}/${n}`),
        h('td', {}, bar(r / n)))))),
    h('ol', { class: 'review' }, items.map((it, k) => h('li', { class: ok[k] ? 'ok' : 'bad' },
      h('p', { class: 'q' }, it.p.q),
      figure(it.p),
      h('p', {}, h('span', { class: 'verdict' }, ok[k] ? 'Certo' : 'Errado'), ' · A tua resposta: ',
        answers[k].length ? answers[k].map((n) => opts[k][n].text).join(' · ') : 'sem resposta'),
      !ok[k] && h('p', {}, 'Resposta certa: ', h('strong', {}, answerText(it.p))),
      h('p', {}, it.p.explicacao),
      h('p', { class: 'fonte' }, `${it.t} · Fonte: ${it.p.fonte}`),
      slideButton(it.p)))),
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: again }, 'Novo exame'),
      h('button', { onclick: () => home() }, 'Voltar aos temas')),
  );
}

// --- stats ----------------------------------------------------------------
const bar = (frac) => h('div', { class: 'barra', role: 'presentation' }, h('span', { style: `width:${Math.round(frac * 100)}%` }));

function stats() {
  const days = Object.keys(log).sort();
  const dayKey = (offset) => new Date(Date.now() - offset * DAY).toLocaleDateString('sv');
  let streak = 0;
  // today without answers yet does not break the streak
  for (let d = log[dayKey(0)] ? 0 : 1; log[dayKey(d)]; d++) streak++;
  const recent = Array.from({ length: 14 }, (_, k) => dayKey(13 - k));
  const peak = Math.max(1, ...recent.map((d) => log[d]?.[0] ?? 0));
  const total = days.reduce((s, d) => s + log[d][0], 0);

  show(
    topBar('Estatísticas'),
    h('h1', { tabindex: -1 }, 'Estatísticas'),
    h('p', { class: 'lede' }, `${streak} dia(s) seguido(s) a estudar · ${total} respostas no total.`),
    h('h2', {}, 'Últimos 14 dias'),
    h('table', { class: 'por-tema' },
      h('caption', { class: 'sr' }, 'Respostas por dia'),
      h('tbody', {}, recent.map((d) => {
        const [n, r] = log[d] ?? [0, 0];
        return h('tr', {},
          h('th', { scope: 'row' }, d.slice(5).split('-').reverse().join('/')),
          h('td', { class: 'num' }, n ? `${r}/${n}` : '–'),
          h('td', {}, bar(n / peak)));
      }))),
    data.cadeiras.map((c) => h('section', { class: 'cadeira' },
      h('h2', {}, c.nome),
      h('table', { class: 'por-tema' },
        h('caption', { class: 'sr' }, `Progresso por tema em ${c.nome}`),
        h('tbody', {}, c.temas.map((t) => {
          const items = itemsOf(c, [t]);
          const tried = items.filter(seen).length;
          const right = items.filter(isRight).length;
          return h('tr', {},
            h('th', { scope: 'row' }, t.nome),
            h('td', { class: 'num', title: `${right} certas, ${tried} vistas, ${items.length} no total` }, `${right}/${items.length}`),
            h('td', {}, bar(right / items.length)));
        }))))),
    h('div', { class: 'actions' }, h('button', { onclick: () => home() }, 'Voltar aos temas')),
  );
}

// --- start ----------------------------------------------------------------
const saved = store.get('qt-pass');
if (saved) {
  unlock(saved).catch((x) => {
    store.set('qt-pass', null);
    lockScreen(x.name === 'OperationError' ? 'A password mudou. Pede a nova a quem te passou o link.' : '');
  });
} else {
  lockScreen();
}
