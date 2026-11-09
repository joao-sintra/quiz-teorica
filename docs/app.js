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

// Keyed by question text so reordering or adding questions keeps progress.
const progress = store.get('qt-progress', {});
const pkey = (it) => `${it.c}|${it.t}|${it.p.q}`;
function record(it, ok) {
  progress[pkey(it)] = ok;
  store.set('qt-progress', progress);
}

const itemsOf = (c, temas = c.temas) => temas.flatMap((t) => t.perguntas.map((p) => ({ c: c.nome, t: t.nome, p })));
const optionsOf = (p) => shuffle(p.opcoes.map((text, i) => ({ text, ok: i === p.certa })));

function topBar(label, ...extra) {
  return h('header', { class: 'bar' },
    h('button', { class: 'link', onclick: () => home() }, 'Temas'),
    h('span', { class: 'crumb' }, label),
    ...extra);
}

function option(o, n, onclick) {
  return h('button', { class: 'opcao', onclick }, h('kbd', {}, String(n + 1)), h('span', {}, o.text));
}

// Quiz images are encrypted with the bundle key; decrypted once into blob URLs.
const images = new Map();
function figure(p) {
  if (!p.imagem) return null;
  const img = h('img', { alt: p.imagemAlt, class: 'figura', decoding: 'async' });
  if (!images.has(p.imagem.src)) {
    images.set(p.imagem.src, fetch(p.imagem.src)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((buf) => open(key, new Uint8Array(buf)))
      .then((bytes) => URL.createObjectURL(new Blob([bytes], { type: p.imagem.type }))));
  }
  images.get(p.imagem.src)
    .then((url) => { img.src = url; })
    .catch(() => { images.delete(p.imagem.src); img.replaceWith(h('p', { class: 'error' }, 'Não foi possível carregar a imagem.')); });
  return img;
}

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
    h('header', { class: 'bar' }, h('span', { class: 'crumb' }, 'Quiz Teórica'), h('button', { class: 'link', onclick: forget }, 'Sair')),
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
  const renderList = () => list.replaceChildren(...temas().map((t) => {
    const items = itemsOf(c, [t]);
    const right = items.filter((it) => progress[pkey(it)]).length;
    return h('li', {},
      h('button', { class: 'tema', onclick: () => practice(c, t) },
        h('span', {}, t.nome),
        h('span', { class: 'score', 'aria-label': `${right} de ${items.length} certas` }, `${right}/${items.length}`)));
  }));

  const filters = [0, ...tests].map((n) => h('button', {
    class: 'filtro',
    'aria-pressed': String(n === chosen),
    onclick: () => {
      chosen = n;
      testFilter[c.nome] = n;
      store.set('qt-teste', testFilter);
      filters.forEach((b, k) => b.setAttribute('aria-pressed', String(k === [0, ...tests].indexOf(n))));
      renderList();
    },
  }, testLabel(n)));

  renderList();
  return h('section', { class: 'cadeira' },
    h('div', { class: 'cadeira-head' },
      h('h2', {}, c.nome),
      h('button', { onclick: () => examSetup(c, temas(), label()) }, 'Modo exame')),
    tests.length > 0 && h('div', { class: 'filtros', role: 'group', 'aria-label': `Matéria de ${c.nome}` }, filters),
    list);
}

// --- practice: one topic, immediate feedback ------------------------------
function practice(c, t) {
  const items = shuffle(itemsOf(c, [t]));
  let i = 0;
  let right = 0;

  const ask = () => {
    if (i === items.length) return practiceDone(c, t, right, items.length);
    const it = items[i];
    const opts = optionsOf(it.p);
    let answered = false;
    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });

    const answer = (n) => {
      if (answered) return;
      answered = true;
      const ok = opts[n].ok;
      if (ok) right++;
      record(it, ok);
      buttons.forEach((b, k) => {
        b.disabled = true;
        if (opts[k].ok) b.classList.add('certa');
        else if (k === n) b.classList.add('errada');
      });
      const next = h('button', { class: 'primary', onclick: () => { i++; ask(); } },
        i + 1 === items.length ? 'Ver resultado' : 'Seguinte');
      feedback.replaceChildren(
        h('p', { class: ok ? 'verdict ok' : 'verdict bad' }, ok ? 'Certo.' : 'Errado.'),
        h('p', {}, it.p.explicacao),
        h('p', { class: 'fonte' }, 'Fonte: ', it.p.fonte),
        next);
      next.focus();
    };
    const buttons = opts.map((o, n) => option(o, n, () => answer(n)));

    show(
      topBar(`${c.nome} · ${t.nome}`, h('span', { class: 'count' }, `${i + 1}/${items.length}`)),
      h('h1', { tabindex: -1, class: 'pergunta' }, it.p.q),
      figure(it.p),
      h('div', { class: 'opcoes' }, buttons),
      feedback,
    );
    onKey = (e) => {
      const n = Number(e.key) - 1;
      if (!answered && n >= 0 && n < opts.length) answer(n);
    };
  };
  ask();
}

function practiceDone(c, t, right, total) {
  show(
    topBar(`${c.nome} · ${t.nome}`),
    h('h1', { tabindex: -1 }, `${right} de ${total} certas`),
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: () => practice(c, t) }, 'Repetir tema'),
      h('button', { onclick: () => home() }, 'Voltar aos temas')),
  );
}

// --- exam: random questions across a subject, timed, graded at the end ----
function examSetup(c, temas = c.temas, label = c.nome) {
  const all = itemsOf(c, temas);
  const again = () => examSetup(c, temas, label);
  const count = h('input', { type: 'number', id: 'n', min: 1, max: all.length, value: Math.min(20, all.length), required: true });
  const minutes = h('input', { type: 'number', id: 'min', min: 1, max: 300, value: Math.min(20, all.length), required: true });
  show(
    topBar(label),
    h('h1', { tabindex: -1 }, 'Modo exame'),
    h('p', { class: 'lede' }, `Perguntas aleatórias de ${temas.length} tema(s) de ${label}. A correção só aparece no fim.`),
    h('form', {
      class: 'exam-setup',
      onsubmit: (e) => {
        e.preventDefault();
        exam(label, shuffle(all).slice(0, Number(count.value)), Number(minutes.value) * 60, again);
      },
    },
    h('label', { for: 'n' }, `Perguntas (máximo ${all.length})`), count,
    h('label', { for: 'min' }, 'Minutos'), minutes,
    h('button', { type: 'submit', class: 'primary' }, 'Começar')),
  );
}

function exam(label, items, seconds, again) {
  const opts = items.map((it) => optionsOf(it.p));
  const answers = items.map(() => null);
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
    const buttons = opts[i].map((o, n) => {
      const b = option(o, n, () => select(n));
      b.setAttribute('aria-pressed', String(answers[i] === n));
      return b;
    });
    const select = (n) => {
      answers[i] = n;
      buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === n)));
    };
    const last = i === items.length - 1;
    body.replaceChildren(
      h('p', { class: 'meta' }, `${i + 1}/${items.length} · ${it.t}`),
      h('h1', { tabindex: -1, class: 'pergunta' }, it.p.q),
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
  const isRight = (k) => answers[k] != null && opts[k][answers[k]].ok;
  items.forEach((it, k) => { if (answers[k] != null) record(it, isRight(k)); });
  const right = items.filter((_, k) => isRight(k)).length;

  show(
    topBar(`${label} · exame`),
    h('h1', { tabindex: -1 }, `${right} de ${items.length} certas`),
    h('ol', { class: 'review' }, items.map((it, k) => {
      const ok = isRight(k);
      return h('li', { class: ok ? 'ok' : 'bad' },
        h('p', { class: 'q' }, it.p.q),
        figure(it.p),
        h('p', {}, h('span', { class: 'verdict' }, ok ? 'Certo' : 'Errado'), ' · A tua resposta: ',
          answers[k] == null ? 'sem resposta' : opts[k][answers[k]].text),
        !ok && h('p', {}, 'Resposta certa: ', h('strong', {}, it.p.opcoes[it.p.certa])),
        h('p', {}, it.p.explicacao),
        h('p', { class: 'fonte' }, `${it.t} · Fonte: ${it.p.fonte}`));
    })),
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: again }, 'Novo exame'),
      h('button', { onclick: () => home() }, 'Voltar aos temas')),
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
