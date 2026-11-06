// ================================================================
//  Апп-ын үндсэн логик: дэлгэц солих, хариу шалгах, Sheet рүү илгээх
// ================================================================
(function () {
  const CFG = window.APP_CONFIG;
  const CUR = window.CURRICULUM;
  const { N, gcd } = window.MathUtil;
  const TOTAL = CFG.PROBLEMS_PER_SESSION || 5;
  const LEVELS = window.LEVELS;
  const PASS = CFG.PASS_SCORE || 4; // дараагийн түвшин нээгдэх доод оноо
  const PASS_PCT = Math.round((PASS / TOTAL) * 100);
  const QUEUE_KEY = 'math7_pending_results';
  const STUDENT_KEY = 'math7_student';

  const $ = (id) => document.getElementById(id);
  const state = { student: null, chapter: null, topic: null, level: 1, problems: [], idx: 0, results: [], sessionStart: 0, qStart: 0, checked: false, progress: {} };

  // ---------------- Ахиц (түвшин бүрийн хамгийн өндөр хувь) ----------------
  // progress = { [topicId]: { [level]: bestPercent } }
  const progressKey = () => `math7_progress_${state.student.cls}|${state.student.name.toLowerCase()}`;
  function loadProgress() { state.progress = JSON.parse(localStorage.getItem(progressKey()) || '{}'); }
  function saveProgress() { localStorage.setItem(progressKey(), JSON.stringify(state.progress)); }
  function best(topicId, L) { return (state.progress[topicId] || {})[L]; }
  function recordBest(topicId, L, pct) {
    const t = (state.progress[topicId] = state.progress[topicId] || {});
    if (t[L] === undefined || pct > t[L]) t[L] = pct;
  }
  const passed = (topicId, L) => (best(topicId, L) || 0) >= PASS_PCT;
  const unlocked = (topicId, L) => CFG.LOCK_LEVELS === false || L === 1 || passed(topicId, L - 1);
  const passedCount = (topic) => LEVELS.filter((lv) => passed(topic.id, lv.n)).length;
  // Сурагчийн одоо бодох ёстой түвшин (давсан түвшний дараагийнх)
  const currentLevel = (topic) => Math.min(passedCount(topic) + 1, LEVELS.length);

  // Өөр компьютер дээр бодсон ахицыг Sheet-ээс татах
  async function syncProgress() {
    if (!CFG.SCRIPT_URL) return;
    try {
      const resp = await fetch(CFG.SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'progress', student: state.student.name, cls: state.student.cls }) });
      const data = await resp.json();
      if (!data.ok || !data.progress) return;
      Object.entries(data.progress).forEach(([tid, lv]) => Object.entries(lv).forEach(([L, pct]) => recordBest(tid, Number(L), Number(pct))));
      saveProgress();
      if ($('screen-chapter').classList.contains('active')) renderChapters();
      if ($('screen-topic').classList.contains('active')) renderTopics();
    } catch (e) { /* интернэтгүй үед орон нутгийн ахицаар үргэлжилнэ */ }
  }

  // ---------------- Дэлгэц солих ----------------
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }

  // HTML-ээс энгийн текст гаргах (Sheet-д бичихэд)
  function plain(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('.frac').forEach((f) => f.replaceWith(f.dataset.t));
    return div.textContent.replace(/\s+/g, ' ').trim();
  }

  // ---------------- 1. Нэвтрэх ----------------
  function initLogin() {
    $('school-name').textContent = CFG.SCHOOL_NAME;
    const sel = $('student-class');
    CFG.CLASSES.forEach((c) => sel.add(new Option(c, c)));
    const saved = JSON.parse(localStorage.getItem(STUDENT_KEY) || 'null');
    if (saved) { $('student-name').value = saved.name; sel.value = saved.cls; }

    $('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('student-name').value.trim();
      if (name.length < 2) { $('student-name').focus(); return; }
      state.student = { name, cls: sel.value };
      localStorage.setItem(STUDENT_KEY, JSON.stringify(state.student));
      loadProgress();
      renderChapters();
      syncProgress();
    });
  }

  // ---------------- 2. Бүлэг сонгох ----------------
  function renderChapters() {
    $('hello').textContent = `Сайн уу, ${state.student.name} (${state.student.cls})! Бүлгээ сонгоорой.`;
    const box = $('chapter-list');
    box.innerHTML = '';
    let allDone = 0, allTotal = 0;
    CUR.forEach((ch) => {
      const done = ch.topics.reduce((s, t) => s + passedCount(t), 0), total = ch.topics.length * LEVELS.length;
      allDone += done; allTotal += total;
      const b = document.createElement('button');
      b.className = 'card-btn';
      b.innerHTML = `<span class="icon">${ch.icon}</span><span class="grow"><b></b><small>${ch.topics.length} сэдэв · ${done}/${total} түвшин</small><span class="mini-bar"><span style="width:${(done / total) * 100}%"></span></span></span>`;
      b.querySelector('b').textContent = ch.title;
      b.onclick = () => { state.chapter = ch; renderTopics(); };
      box.appendChild(b);
    });
    $('overall').innerHTML = `Нийт ахиц: <b>${allDone} / ${allTotal}</b> түвшин <span class="mini-bar wide"><span style="width:${(allDone / allTotal) * 100}%"></span></span>`;
    show('screen-chapter');
  }

  // ---------------- 3. Сэдэв ба түвшин сонгох ----------------
  function renderTopics() {
    $('chapter-title').textContent = `${state.chapter.icon} ${state.chapter.title}`;
    const box = $('topic-list');
    box.innerHTML = '';
    state.chapter.topics.forEach((t, i) => {
      const card = document.createElement('div');
      card.className = 'topic-card';
      const done = passedCount(t);
      card.innerHTML = `<div class="topic-head"><span class="num">${i + 1}</span><b></b><span class="stars">${done === LEVELS.length ? '🏅 Бүрэн эзэмшсэн' : `${done}/${LEVELS.length}`}</span></div><div class="levels"></div>`;
      card.querySelector('b').textContent = t.title;
      const lvBox = card.querySelector('.levels');
      const cur = currentLevel(t);
      LEVELS.forEach((lv) => {
        const btn = document.createElement('button');
        const open = unlocked(t.id, lv.n), ok = passed(t.id, lv.n), b = best(t.id, lv.n);
        btn.className = `level-btn${ok ? ' done' : ''}${!open ? ' locked' : ''}${open && !ok && lv.n === cur ? ' current' : ''}`;
        btn.disabled = !open;
        btn.title = (t.levels && t.levels[lv.n - 1]) || '';
        btn.innerHTML = `<span class="lv-icon">${!open ? '🔒' : ok ? '✅' : lv.icon}</span><span class="lv-name">${lv.n}. ${lv.name}</span><small></small>`;
        btn.querySelector('small').textContent = b !== undefined ? `Шилдэг: ${b}%` : (t.levels ? t.levels[lv.n - 1] : '');
        btn.onclick = () => startQuiz(t, lv.n);
        lvBox.appendChild(btn);
      });
      box.appendChild(card);
    });
    show('screen-topic');
  }

  // ---------------- 4. Бодлого ----------------
  function startQuiz(topic, level) {
    state.topic = topic;
    state.level = level || currentLevel(topic);
    state.problems = [];
    const seen = new Set();
    for (let tries = 0; state.problems.length < TOTAL && tries < 200; tries++) {
      const p = topic.gen(state.level);
      if (seen.has(p.text)) continue;
      seen.add(p.text);
      state.problems.push(p);
    }
    state.idx = 0;
    state.results = [];
    state.sessionStart = Date.now();
    const lv = LEVELS[state.level - 1];
    $('quiz-topic').textContent = topic.title;
    $('quiz-level').textContent = `${lv.icon} Түвшин ${lv.n}: ${lv.name}`;
    $('quiz-level').className = `badge level-${lv.n}`;
    $('quiz-level-desc').textContent = (topic.levels && topic.levels[state.level - 1]) || '';
    renderProblem();
    show('screen-quiz');
  }

  function renderProblem() {
    const p = state.problems[state.idx];
    state.checked = false;
    state.qStart = Date.now();
    $('progress-text').textContent = `Бодлого ${state.idx + 1} / ${TOTAL}`;
    $('progress-bar').style.width = `${(state.idx / TOTAL) * 100}%`;
    $('problem-text').innerHTML = p.text;
    $('feedback').hidden = true;
    $('feedback').className = 'feedback';
    $('btn-next').hidden = true;
    $('ai-box').hidden = true;
    $('ai-box').textContent = '';

    const area = $('answer-area');
    area.innerHTML = '';
    if (p.type === 'choice') {
      p.choices.forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.textContent = c;
        b.onclick = () => check(c);
        area.appendChild(b);
      });
      $('btn-check').hidden = true;
    } else {
      const inp = document.createElement('input');
      inp.id = 'answer-input';
      inp.type = 'text';
      inp.autocomplete = 'off';
      inp.inputMode = 'text'; // утсан дээр "-" ба "/" бичигдэх боломжтой байлгана
      inp.placeholder = p.hint || 'Хариугаа бичнэ үү';
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onCheckClick(); } });
      area.appendChild(inp);
      $('btn-check').hidden = false;
      setTimeout(() => inp.focus(), 50);
    }
  }

  function onCheckClick() {
    if (state.checked) return;
    const inp = $('answer-input');
    if (!inp || !inp.value.trim()) { if (inp) inp.focus(); return; }
    check(inp.value.trim());
  }

  // ---------------- Хариу задлах / шалгах ----------------
  function normalize(s) {
    return String(s)
      .replace(/[−–—]/g, '-')
      .replace(/[хХX]/g, 'x') // кирилл "х" үсгийг латин x болгоно
      .replace(/,/g, '.')
      .replace(/\s+/g, '');
  }

  function parseNumber(raw) {
    // Холимог тоо: "2 1/3" эсвэл "-2 1/3"
    const mx = String(raw).trim().replace(/[−–—]/g, '-').match(/^(-?)\s*(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mx) {
      const w = Number(mx[2]), n = Number(mx[3]), d = Number(mx[4]);
      if (d === 0) return null;
      return { val: (mx[1] ? -1 : 1) * (w + n / d), reducible: gcd(n, d) > 1 };
    }
    let s = normalize(raw);
    s = s.replace(/^x=/, '').replace(/[^0-9.\-\/]/g, '');
    let m = s.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const n = Number(m[1]), d = Number(m[2]);
      if (d === 0) return null;
      const reducible = Number.isInteger(n) && Number.isInteger(d) && gcd(n, d) > 1;
      return { val: n / d, reducible };
    }
    if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return { val: Number(s), reducible: false };
    return null;
  }

  function parseLinear(raw) {
    let s = normalize(raw).replace(/\*/g, '').replace(/·/g, '');
    if (!s || !/^[+\-]?[0-9.x]+([+\-][0-9.x]+)*$/.test(s)) return null;
    let a = 0, b = 0;
    for (const t of s.match(/[+\-]?[^+\-]+/g)) {
      if (t.endsWith('x')) {
        const c = t.slice(0, -1);
        if (c.includes('x')) return null;
        const v = c === '' || c === '+' ? 1 : c === '-' ? -1 : Number(c);
        if (Number.isNaN(v)) return null;
        a += v;
      } else {
        if (t.includes('x')) return null;
        const v = Number(t);
        if (Number.isNaN(v)) return null;
        b += v;
      }
    }
    return { a, b };
  }

  const near = (x, y, tol = 1e-6) => Math.abs(x - y) <= tol;

  function evaluate(p, raw) {
    if (p.type === 'choice') return { ok: raw === p.answer, parsed: raw };
    if (p.type === 'expr') {
      const v = parseLinear(raw);
      if (!v) return { ok: false, invalid: true };
      const ok = near(v.a, p.answer.a) && near(v.b, p.answer.b);
      let mistake = null;
      if (!ok) mistake = (p.mistakes || []).find((m) => near(v.a, m.v.a) && near(v.b, m.v.b)) || null;
      return { ok, mistake };
    }
    const v = parseNumber(raw);
    if (!v) return { ok: false, invalid: true };
    const tol = p.tol || 1e-6;
    const ok = near(v.val, p.answer, tol);
    let mistake = null, note = null;
    if (ok && v.reducible) note = 'Хариу зөв! Гэхдээ бутархайгаа хураахаа бүү мартаарай.';
    if (!ok) {
      mistake = (p.mistakes || []).find((m) => near(v.val, m.v, tol)) || null;
      if (!mistake && p.answer !== 0 && near(v.val, -p.answer, tol)) {
        mistake = { tag: 'Тэмдгийн алдаа', msg: 'Хариуны тоо зөв, гэхдээ ТЭМДЭГ нь буруу байна. Тэмдгийн дүрмээ дахин шалгаарай.' };
      }
    }
    return { ok, mistake, note };
  }

  function answerHtml(p) {
    if (p.type === 'choice') return p.answer;
    if (p.type === 'expr') return p.answerText;
    return p.answerHtml || N(p.answer);
  }
  function answerPlain(p) {
    if (p.type === 'choice') return p.answer;
    if (p.type === 'expr') return p.answerText;
    return p.answerText || N(p.answer);
  }

  function check(raw) {
    if (state.checked) return;
    const p = state.problems[state.idx];
    const r = evaluate(p, raw);
    if (r.invalid) {
      const fb = $('feedback');
      fb.hidden = false;
      fb.className = 'feedback warn';
      fb.innerHTML = `<p>⚠️ Хариуг ойлгосонгүй. ${p.type === 'expr' ? 'Жишээ нь: <b>3x + 5</b> эсвэл <b>-2x - 4</b>' : 'Жишээ нь: <b>12</b>, <b>-3,5</b> эсвэл <b>3/4</b>'} хэлбэрээр бичээрэй.</p>`;
      return;
    }
    state.checked = true;
    const seconds = Math.round((Date.now() - state.qStart) / 1000);
    state.results.push({
      no: state.idx + 1,
      question: plain(p.text),
      studentAnswer: raw,
      correctAnswer: answerPlain(p),
      correct: r.ok,
      seconds,
      mistakeTag: r.mistake ? r.mistake.tag : (r.ok ? '' : 'Бусад'),
      aiUsed: false,
    });

    // Сонголтын товчлуурыг будах
    document.querySelectorAll('.choice').forEach((b) => {
      b.disabled = true;
      if (b.textContent === p.answer) b.classList.add('right');
      else if (b.textContent === raw) b.classList.add('wrong');
    });
    const inp = $('answer-input');
    if (inp) { inp.disabled = true; inp.classList.add(r.ok ? 'right' : 'wrong'); }
    $('btn-check').hidden = true;

    // Зөвлөгөө
    const fb = $('feedback');
    fb.hidden = false;
    fb.className = `feedback ${r.ok ? 'ok' : 'bad'}`;
    let html = r.ok
      ? `<h3>✅ Зөв! Сайн байна.</h3>`
      : `<h3>❌ Буруу байна.</h3><p>Таны хариу: <b class="mine"></b> &nbsp;|&nbsp; Зөв хариу: <b>${answerHtml(p)}</b></p>`;
    if (r.note) html += `<p class="note">💡 ${r.note}</p>`;
    if (r.mistake) html += `<p class="mistake">🔍 <b>Алдаагаа олъё:</b> ${r.mistake.msg}</p>`;
    html += `<div class="steps"><h4>📝 Хэрхэн бодох вэ?</h4><ol>${p.steps.map((s) => `<li>${s}</li>`).join('')}</ol></div>`;
    html += `<p class="tip">🎯 <b>Зөвлөгөө:</b> ${p.tip}</p>`;
    fb.innerHTML = html;
    const mine = fb.querySelector('.mine');
    if (mine) mine.textContent = raw;

    if (CFG.SCRIPT_URL && CFG.AI_ENABLED) {
      const ai = document.createElement('button');
      ai.type = 'button';
      ai.className = 'btn ghost';
      ai.textContent = r.ok ? '🤖 AI багшаас өөр аргыг асуух' : '🤖 AI багшаас миний алдааг тайлбарлуулах';
      ai.onclick = () => askAI(p, raw, r.ok, ai);
      fb.appendChild(ai);
    }

    $('btn-next').textContent = state.idx + 1 < TOTAL ? 'Дараагийн бодлого →' : 'Үр дүнгээ харах 🏁';
    $('btn-next').hidden = false;
    $('progress-bar').style.width = `${((state.idx + 1) / TOTAL) * 100}%`;
  }

  // ---------------- Claude AI тайлбар (Apps Script-ээр дамжина) ----------------
  async function askAI(p, raw, ok, btn) {
    btn.disabled = true;
    const box = $('ai-box');
    box.hidden = false;
    box.className = 'ai-box loading';
    box.textContent = '🤖 AI багш бодож байна…';
    const res = state.results[state.results.length - 1];
    try {
      const resp = await fetch(CFG.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'feedback',
          topic: `${state.topic.title} (түвшин ${state.level}/4: ${LEVELS[state.level - 1].name})`,
          question: plain(p.text),
          studentAnswer: raw,
          correctAnswer: answerPlain(p),
          isCorrect: ok,
          steps: p.steps.map(plain),
        }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Алдаа');
      box.className = 'ai-box';
      box.textContent = String(data.text).replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
      if (res) res.aiUsed = true;
    } catch (err) {
      box.className = 'ai-box err';
      box.textContent = `AI тайлбар авч чадсангүй: ${err.message}. Дээрх алхмуудыг анхааралтай уншаарай.`;
      btn.disabled = false;
    }
  }

  function next() {
    if (state.idx + 1 < TOTAL) { state.idx++; renderProblem(); }
    else renderResult();
  }

  // ---------------- 5. Үр дүн ----------------
  function renderResult() {
    const correct = state.results.filter((r) => r.correct).length;
    const pct = Math.round((correct / TOTAL) * 100);
    const totalSec = Math.round((Date.now() - state.sessionStart) / 1000);
    const L = state.level, lv = LEVELS[L - 1], isPass = correct >= PASS, wasPassed = passed(state.topic.id, L);
    recordBest(state.topic.id, L, pct);
    saveProgress();

    let emoji, msg;
    if (isPass && L < LEVELS.length) {
      const nx = LEVELS[L];
      emoji = pct === 100 ? '🏆' : '🌟';
      msg = wasPassed
        ? `Сайн байна! Та ${lv.name} түвшинг дахин амжилттай давлаа. ${nx.icon} ${nx.name} түвшин рүү ороорой.`
        : `Баяр хүргэе! Та ${lv.name} түвшинг давлаа. ${nx.icon} Түвшин ${nx.n}: ${nx.name} нээгдлээ!`;
    } else if (isPass) {
      emoji = '🏅';
      msg = 'Гайхалтай! Та энэ сэдвийн бүх 4 түвшинг давж, сэдвийг бүрэн эзэмшлээ. Дараагийн сэдэв рүү шилжээрэй.';
    } else if (pct >= 40) {
      emoji = '👍';
      msg = `Ойрхон байна! Дараагийн түвшин нээгдэхийн тулд ${TOTAL}-аас дор хаяж ${PASS}-ийг зөв бодох хэрэгтэй. Алдаагаа тайлбартай нь харьцуулаад дахин оролдоорой.`;
    } else {
      emoji = '💪';
      msg = `Бүү бууж өг! Алхмуудыг анхааралтай уншаад энэ түвшинг дахин бодоорой.${L > 1 ? ' Хэрэв хэцүү байвал өмнөх түвшингээ давтаж болно.' : ''} Багшаасаа тусламж аваарай.`;
    }

    $('result-emoji').textContent = emoji;
    $('result-score').textContent = `${correct} / ${TOTAL}`;
    $('result-pct').textContent = `${pct}%  ·  ${Math.floor(totalSec / 60)} мин ${totalSec % 60} сек`;
    $('result-msg').textContent = msg;
    $('result-topic').textContent = `${state.chapter.title} → ${state.topic.title} · ${lv.icon} Түвшин ${L}: ${lv.name}`;
    $('result-badge').textContent = isPass ? '✅ ТЭНЦСЭН' : '⏳ ДАХИН ОРОЛДОХ';
    $('result-badge').className = `pass-badge ${isPass ? 'ok' : 'bad'}`;

    // Түвшний ахицын зураглал
    $('result-levels').innerHTML = LEVELS.map((x) => {
      const cls = passed(state.topic.id, x.n) ? 'done' : unlocked(state.topic.id, x.n) ? 'open' : 'locked';
      return `<span class="lv-step ${cls}${x.n === L ? ' here' : ''}">${cls === 'done' ? '✅' : cls === 'locked' ? '🔒' : x.icon} ${x.n}. ${x.name}</span>`;
    }).join('<span class="lv-arrow">→</span>');

    // Товчлуурууд
    const canNext = isPass && L < LEVELS.length;
    $('btn-nextlevel').hidden = !canNext;
    if (canNext) $('btn-nextlevel').textContent = `${LEVELS[L].icon} Түвшин ${L + 1}: ${LEVELS[L].name} →`;
    $('btn-retry').textContent = isPass ? '🔁 Энэ түвшинг дахин' : '🔁 Дахин оролдох';
    $('btn-retry').className = canNext ? 'btn' : 'btn primary';
    $('btn-prevlevel').hidden = isPass || L === 1;

    const tbody = $('result-table');
    tbody.innerHTML = '';
    state.results.forEach((r) => {
      const tr = document.createElement('tr');
      tr.className = r.correct ? 'ok' : 'bad';
      [r.no, r.question, r.studentAnswer, r.correctAnswer, r.correct ? '✅' : '❌'].forEach((v) => {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    const tags = {};
    state.results.forEach((r) => { if (r.mistakeTag && r.mistakeTag !== 'Бусад') tags[r.mistakeTag] = (tags[r.mistakeTag] || 0) + 1; });
    const tagList = Object.keys(tags);
    $('result-mistakes').hidden = tagList.length === 0;
    $('result-mistakes').textContent = tagList.length ? `Анхаарах зүйл: ${tagList.join(', ')}` : '';

    show('screen-result');
    submit({
      action: 'submit',
      sessionId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      clientTime: new Date().toISOString(),
      student: state.student.name,
      cls: state.student.cls,
      chapter: state.chapter.title,
      topic: state.topic.title,
      topicId: state.topic.id,
      level: L,
      levelName: lv.name,
      passed: isPass,
      correct,
      total: TOTAL,
      percent: pct,
      seconds: totalSec,
      items: state.results,
    });
  }

  // ---------------- Google Sheet рүү илгээх ----------------
  async function post(payload) {
    const resp = await fetch(CFG.SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Sheet алдаа');
  }

  function queue() { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

  async function submit(payload) {
    const st = $('send-status');
    if (!CFG.SCRIPT_URL) {
      st.className = 'send-status warn';
      st.textContent = 'ℹ️ Google Sheet холбогдоогүй байна (js/config.js → SCRIPT_URL). Үр дүн багшид илгээгдсэнгүй.';
      return;
    }
    st.className = 'send-status';
    st.textContent = '📤 Үр дүнг багшид илгээж байна…';
    try {
      await post(payload);
      st.className = 'send-status ok';
      st.textContent = '✅ Үр дүн багшид амжилттай илгээгдлээ.';
    } catch (err) {
      const q = queue(); q.push(payload); saveQueue(q);
      st.className = 'send-status warn';
      st.textContent = '⚠️ Интернэт холболт тасарсан тул илгээж чадсангүй. Үр дүн хадгалагдсан бөгөөд дараа автоматаар илгээгдэнэ.';
    }
    flushQueue();
  }

  async function flushQueue() {
    if (!CFG.SCRIPT_URL) return;
    const q = queue();
    if (!q.length) return;
    const left = [];
    for (const item of q) {
      try { await post(item); } catch (e) { left.push(item); }
    }
    saveQueue(left);
  }

  // ---------------- Товчлуурууд ----------------
  function bind() {
    $('btn-check').onclick = onCheckClick;
    $('btn-next').onclick = next;
    $('back-to-chapters').onclick = renderChapters;
    $('quit-quiz').onclick = () => { if (confirm('Бодлогоо дуусгалгүй гарах уу? Үр дүн хадгалагдахгүй.')) renderTopics(); };
    $('btn-retry').onclick = () => startQuiz(state.topic, state.level);
    $('btn-nextlevel').onclick = () => startQuiz(state.topic, state.level + 1);
    $('btn-prevlevel').onclick = () => startQuiz(state.topic, state.level - 1);
    $('btn-other').onclick = renderTopics;
    $('btn-chapters').onclick = renderChapters;
    $('logout').onclick = () => show('screen-login');
  }

  initLogin();
  bind();
  flushQueue();
  window.addEventListener('online', flushQueue);
})();
