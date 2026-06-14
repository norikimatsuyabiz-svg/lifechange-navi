(function() {
// ===== 状態管理 =====
let currentEvent = null;
let answers = {};
let projectTasks = [];
let doneSet = new Set();
let activeFilter = 'all';

const STORAGE_KEY = 'lifechange_v1';

function loadStorage() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (d.event) currentEvent = d.event;
    if (d.answers) answers = d.answers;
    if (d.done) doneSet = new Set(d.done);
    if (d.tasks) projectTasks = d.tasks;
  } catch(e) {}
}

function saveStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    event: currentEvent,
    answers,
    done: [...doneSet],
    tasks: projectTasks
  }));
}

// ===== 画面切替 =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  window.scrollTo(0, 0);
}

function goWelcome() {
  currentEvent = null; answers = {}; projectTasks = []; doneSet = new Set();
  activeFilter = 'all';
  localStorage.removeItem(STORAGE_KEY);
  showScreen('welcome');
}

// ===== ヒアリング =====
const MARRIAGE_QUESTIONS = [
  {
    id: 'kasei',
    text: '奥様は苗字（氏名）を変更しますか？',
    type: 'single',
    options: ['はい、変更します', 'いいえ、変更しません'],
    keys: ['yes', 'no']
  },
  {
    id: 'hikkoshi',
    text: '引っ越し（転居）はしますか、または済みましたか？',
    type: 'single',
    options: ['はい、します／しました', 'いいえ、転居なし'],
    keys: ['yes', 'no']
  },
  {
    id: 'kuruma',
    text: 'お車（自動車）はお持ちですか？',
    type: 'single',
    options: ['はい、持っています', 'いいえ、持っていません'],
    keys: ['yes', 'no']
  },
  {
    id: 'passport',
    text: '奥様はパスポートをお持ちですか？',
    type: 'single',
    options: ['はい、持っています', 'いいえ'],
    keys: ['yes', 'no'],
    cond: a => a.kasei === 'yes'
  },
  {
    id: 'shikaku',
    text: '奥様が名義変更の必要な資格をお持ちであれば選んでください。（複数選択可）',
    type: 'multi',
    options: ['医師免許', '看護師免許', '薬剤師免許', '弁護士', '税理士・公認会計士', '保育士', '教員免許', '社会保険労務士', '宅地建物取引士', 'その他'],
    keys: ['ishi', 'kango', 'yakuzai', 'bengoshi', 'zeirishi', 'hoikushi', 'kyoin', 'sharoshi', 'takken', 'sonota'],
    cond: a => a.kasei === 'yes'
  },
  {
    id: 'fuyou',
    text: '奥様を社会保険の扶養に入れる予定はありますか？',
    type: 'single',
    options: ['はい、扶養に入れます', 'いいえ（妻も会社員等）'],
    keys: ['yes', 'no']
  },
  {
    id: 'banks',
    text: '奥様名義の金融口座・カードはどれくらいありますか？',
    type: 'single',
    options: ['1〜2つ', '3〜5つ', '6つ以上'],
    keys: ['few', 'some', 'many']
  }
];

let chatStep = 0;
let activeQuestions = [];

function startEvent(event) {
  currentEvent = event;
  answers = {};
  projectTasks = [];
  doneSet = new Set();
  chatStep = 0;
  localStorage.removeItem(STORAGE_KEY);
  if (event === 'marriage') {
    activeQuestions = MARRIAGE_QUESTIONS;
  }
  showScreen('chat');
  renderChat();
}

function renderChat() {
  const body = document.getElementById('chat-body');
  const opts = document.getElementById('chat-options');

  const remaining = activeQuestions.filter(q => {
    if (answers[q.id] !== undefined) return false;
    if (q.cond && !q.cond(answers)) return false;
    return true;
  });

  const done = Object.keys(answers).length;
  const total = activeQuestions.filter(q => !q.cond || q.cond(answers)).length;
  document.getElementById('chat-progress').textContent = `${done} / ${total}`;

  if (remaining.length === 0) {
    generateProject();
    return;
  }

  const q = remaining[0];
  body.innerHTML = '';

  activeQuestions.forEach(prev => {
    if (answers[prev.id] === undefined) return;
    if (prev.cond && !prev.cond(answers)) return;
    addMsg(body, 'bot', prev.text);
    if (prev.type === 'multi') {
      // 複数選択の回答は選んだ選択肢名を並べて表示
      const selected = answers[prev.id];
      const labels = selected.length > 0
        ? selected.map(k => prev.options[prev.keys.indexOf(k)]).join('、')
        : 'なし（スキップ）';
      addMsg(body, 'user', labels);
    } else {
      const idx = prev.options.findIndex((_, i) => prev.keys[i] === answers[prev.id]);
      addMsg(body, 'user', prev.options[idx]);
    }
  });

  addMsg(body, 'bot', q.text);
  body.scrollTop = body.scrollHeight;

  opts.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'chat-options';

  if (q.type === 'multi') {
    // 複数選択UIを構築
    const selected = new Set();
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'chat-opt-btn';
      btn.dataset.key = q.keys[i];
      btn.innerHTML = `<span class="opt-check"></span>${opt}`;
      btn.onclick = () => {
        const key = q.keys[i];
        if (selected.has(key)) {
          selected.delete(key);
          btn.classList.remove('selected');
        } else {
          selected.add(key);
          btn.classList.add('selected');
        }
      };
      div.appendChild(btn);
    });
    // 確定ボタン（選択なしでもスキップとして進める）
    const confirm = document.createElement('button');
    confirm.className = 'multi-confirm';
    confirm.textContent = '決定する →';
    confirm.onclick = () => {
      answers[q.id] = [...selected];
      saveStorage();
      renderChat();
    };
    div.appendChild(confirm);
  } else {
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'chat-opt-btn';
      btn.innerHTML = `<span class="opt-check"></span>${opt}`;
      btn.onclick = () => {
        answers[q.id] = q.keys[i];
        saveStorage();
        renderChat();
      };
      div.appendChild(btn);
    });
  }

  opts.appendChild(div);
}

function addMsg(container, type, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + type;
  if (type === 'bot') {
    div.innerHTML = `<div class="msg-avatar">🗂️</div><div class="msg-bubble">${text}</div>`;
  } else {
    div.innerHTML = `<div class="msg-bubble">${text}</div>`;
  }
  container.appendChild(div);
}

// ===== タスク生成 =====
function generateProject() {
  const a = answers;
  const tasks = [];

  tasks.push({ id:'kon', name:'婚姻届を提出する', cat:'役所', who:'二人', deps:[], priority:1 });

  if (a.hikkoshi === 'yes') {
    tasks.push({ id:'tenshutssu', name:'旧住所の転出届を出す', cat:'役所', who:'二人', deps:[], priority:1 });
    tasks.push({ id:'tennyu', name:'新住所の転入届を出す', cat:'役所', who:'二人', deps:['tenshutssu'], priority:1 });
    tasks.push({ id:'juminhyo', name:'住民票の写しを取得する', cat:'役所', who:'二人', deps:['tennyu'], priority:2 });
    tasks.push({ id:'utility_gas', name:'ガス・電気・水道の住所変更／契約', cat:'住居', who:'二人', deps:['tennyu'], priority:2 });
    tasks.push({ id:'utility_net', name:'インターネット回線の移転手続き', cat:'住居', who:'二人', deps:[], priority:2 });
    tasks.push({ id:'rent_refund', name:'旧居の家賃日割り返還先口座を通知', cat:'住居', who:'二人', deps:['bank_main'], priority:2 });
  } else {
    tasks.push({ id:'juminhyo', name:'住民票の写しを取得する', cat:'役所', who:'二人', deps:[], priority:2 });
  }

  if (a.kasei === 'yes') {
    const kaseiBankDeps = ['kon', 'juminhyo'];
    tasks.push({ id:'license', name:'運転免許証の氏名・住所変更', cat:'免許', who:'妻', deps: a.hikkoshi === 'yes' ? ['kon','tennyu'] : ['kon'], priority:2 });
    tasks.push({ id:'mynumber', name:'マイナンバーカードの氏名変更', cat:'役所', who:'妻', deps: a.hikkoshi === 'yes' ? ['kon','tennyu'] : ['kon'], priority:2 });
    tasks.push({ id:'bank_main', name:'メイン銀行口座の氏名変更', cat:'銀行・金融', who:'妻', deps:kaseiBankDeps, priority:1, note:'給与受取・家賃日割りに影響' });
    tasks.push({ id:'salary', name:'給与振込口座を会社に届け出る', cat:'会社', who:'二人', deps:['bank_main'], priority:1, note:'口座変更後すぐに申請' });
    tasks.push({ id:'bank_sub', name:'サブ口座・証券口座の氏名変更', cat:'銀行・金融', who:'妻', deps:['bank_main'], priority:3 });
    tasks.push({ id:'card_credit', name:'クレジットカードの氏名変更', cat:'カード・通信', who:'妻', deps:['bank_main'], priority:2 });
    tasks.push({ id:'smartphone', name:'携帯電話の契約名義変更', cat:'カード・通信', who:'妻', deps:['kon','license'], priority:3 });
    tasks.push({ id:'hoken_kokumin', name:'健康保険証の氏名変更', cat:'保険', who:'妻', deps:['kon'], priority:2 });
    tasks.push({ id:'nenkin', name:'年金手帳・基礎年金番号の氏名変更', cat:'保険', who:'妻', deps:['kon'], priority:3 });

    if (a.passport === 'yes') {
      tasks.push({ id:'passport_change', name:'パスポートの氏名変更申請', cat:'免許', who:'妻', deps:['kon','license'], priority:3 });
    }
    // 資格の名義変更タスクを生成
    if (a.shikaku && a.shikaku.length > 0) {
      const shikakuNames = {
        ishi: '医師免許', kango: '看護師免許', yakuzai: '薬剤師免許',
        bengoshi: '弁護士資格', zeirishi: '税理士・公認会計士資格',
        hoikushi: '保育士資格', kyoin: '教員免許', sharoshi: '社会保険労務士資格',
        takken: '宅地建物取引士資格', sonota: '資格（その他）'
      };
      a.shikaku.forEach(key => {
        tasks.push({
          id: 'shikaku_' + key,
          name: `${shikakuNames[key]}の氏名変更を申請する`,
          cat: '資格',
          who: '妻',
          deps: ['kon'],
          priority: 2,
          note: '管轄機関に申請。戸籍謄本が必要な場合あり'
        });
      });
    }
    if (a.kuruma === 'yes') {
      tasks.push({ id:'jidosha', name:'自動車の氏名・住所変更（陸運局）', cat:'免許', who:'妻', deps:['license'], priority:3, note:'車検証・ナンバー変更が必要な場合あり' });
    }
  } else {
    if (a.hikkoshi === 'yes') {
      tasks.push({ id:'bank_main', name:'メイン銀行口座の住所変更', cat:'銀行・金融', who:'妻', deps:['juminhyo'], priority:2 });
    }
    if (a.kuruma === 'yes') {
      tasks.push({ id:'jidosha', name:'自動車の住所変更（陸運局）', cat:'免許', who:'二人', deps: a.hikkoshi === 'yes' ? ['tennyu'] : [], priority:3 });
    }
  }

  if (a.fuyou === 'yes') {
    tasks.push({ id:'fuyou_shakai', name:'社会保険（扶養）の変更届を会社に提出', cat:'会社', who:'本人', deps:['kon'], priority:2 });
    tasks.push({ id:'fuyou_hoken', name:'扶養家族の健康保険証を受け取る', cat:'保険', who:'本人', deps:['fuyou_shakai'], priority:2 });
  }

  tasks.push({ id:'nenmatsu', name:'年末調整で配偶者控除を申告する', cat:'会社', who:'本人', deps:['kon'], priority:3, note:'年末調整シーズンに実施' });

  if (a.hikkoshi === 'yes') {
    tasks.push({ id:'suica', name:'Suica等ICカードの住所変更', cat:'カード・通信', who:'二人', deps: a.kasei === 'yes' ? ['bank_main'] : ['juminhyo'], priority:3 });
  }

  const seen = new Set();
  projectTasks = tasks.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  doneSet = new Set();
  saveStorage();
  showProjectScreen();
}

// ===== プロジェクト画面 =====
function showProjectScreen() {
  document.getElementById('proj-title').textContent = '結婚・入籍 手続きプロジェクト';
  document.getElementById('proj-sub').textContent = `全 ${projectTasks.length} 件`;
  showScreen('project');
  renderProject();
}

function isBlocked(task) {
  return task.deps.some(d => {
    const exists = projectTasks.find(t => t.id === d);
    if (!exists) return false;
    return !doneSet.has(d);
  });
}

function getBlockedByNames(task) {
  return task.deps
    .filter(d => projectTasks.find(t => t.id === d) && !doneSet.has(d))
    .map(d => projectTasks.find(t => t.id === d)?.name || d);
}

function renderProject() {
  const total = projectTasks.length;
  const doneCount = [...doneSet].filter(id => projectTasks.find(t => t.id === id)).length;
  const availCount = projectTasks.filter(t => !doneSet.has(t.id) && !isBlocked(t)).length;
  const blockedCount = projectTasks.filter(t => !doneSet.has(t.id) && isBlocked(t)).length;
  const pct = total ? Math.round(doneCount / total * 100) : 0;

  document.getElementById('proj-bar').style.width = pct + '%';
  document.getElementById('proj-sub').textContent = `全 ${total} 件 — ${pct}% 完了`;

  document.getElementById('metrics').innerHTML = `
    <div class="metric"><div class="metric-label">進捗</div><div class="metric-value">${pct}%</div></div>
    <div class="metric"><div class="metric-label">完了</div><div class="metric-value">${doneCount}/${total}</div></div>
    <div class="metric"><div class="metric-label">着手可能</div><div class="metric-value">${availCount}</div></div>
    <div class="metric"><div class="metric-label">ブロック中</div><div class="metric-value">${blockedCount}</div></div>
  `;

  const cats = [...new Set(projectTasks.map(t => t.cat))];
  const whos = [...new Set(projectTasks.map(t => t.who))];
  const filtersEl = document.getElementById('filters');
  filtersEl.innerHTML =
    `<button class="filter-btn ${activeFilter==='all'?'active':''}" onclick="setFilter('all')">すべて</button>` +
    cats.map(c => `<button class="filter-btn ${activeFilter===c?'active':''}" onclick="setFilter('${JSON.stringify(c).slice(1,-1)}')">${c}</button>`).join('') +
    whos.map(w => `<button class="filter-btn ${activeFilter===w?'active':''}" onclick="setFilter('${w}')">${w}</button>`).join('');

  const filtered = activeFilter === 'all' ? projectTasks
    : projectTasks.filter(t => t.cat === activeFilter || t.who === activeFilter);

  const available = filtered.filter(t => !doneSet.has(t.id) && !isBlocked(t));
  const blocked = filtered.filter(t => !doneSet.has(t.id) && isBlocked(t));
  const done = filtered.filter(t => doneSet.has(t.id));

  const sections = document.getElementById('task-sections');
  sections.innerHTML = '';

  if (available.length) {
    sections.innerHTML += `<div class="section-label">今すぐ着手できる (${available.length})</div><div class="task-list">${available.map(taskHTML).join('')}</div>`;
  }
  if (blocked.length) {
    sections.innerHTML += `<div class="section-label">ブロック中 (${blocked.length})</div><div class="task-list">${blocked.map(taskHTML).join('')}</div>`;
  }
  if (done.length) {
    sections.innerHTML += `<div class="section-label">完了 (${done.length})</div><div class="task-list">${done.map(taskHTML).join('')}</div>`;
  }
}

function taskHTML(t) {
  const checked = doneSet.has(t.id);
  const bl = isBlocked(t);
  const blockNames = bl ? getBlockedByNames(t) : [];
  const whoClass = 'tag-who-' + t.who;
  const hasMeta = t.deadline || t.memo || t.url;
  return `<div class="task-card ${bl?'blocked':''} ${checked?'done':''}">
    <button class="check-btn ${checked?'checked':''}" ${bl&&!checked?'disabled':''} onclick="toggleTask('${t.id}')" aria-label="${checked?'完了解除':'完了にする'}">
      <svg class="check-icon" viewBox="0 0 12 10"><path d="M1 5l3.5 3.5L11 1"/></svg>
    </button>
    <div class="task-info">
      <div class="task-name">${t.name}</div>
      ${bl ? `<div class="task-dep-note">先に完了: ${blockNames.join('、')}</div>` : ''}
      ${t.note && !bl ? `<div class="task-dep-note">${t.note}</div>` : ''}
      ${t.deadline ? `<div class="task-dep-note">期限: ${t.deadline}</div>` : ''}
    </div>
    <div class="task-tags">
      <span class="tag ${whoClass}">${t.who}</span>
      <span class="tag tag-cat">${t.cat}</span>
      <button class="edit-btn" onclick="openEditModal('${t.id}')" aria-label="編集">
        <svg viewBox="0 0 14 14"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/><path d="M8 4l2 2"/></svg>
      </button>
    </div>
  </div>`;
}

function toggleTask(id) {
  const task = projectTasks.find(t => t.id === id);
  if (!task) return;
  if (isBlocked(task) && !doneSet.has(id)) return;
  if (doneSet.has(id)) {
    const dependents = projectTasks.filter(t => t.deps.includes(id) && doneSet.has(t.id));
    if (dependents.length > 0) {
      const names = dependents.map(t => t.name).join('、');
      if (!confirm(`「${names}」も未完了に戻ります。よろしいですか？`)) return;
      dependents.forEach(t => doneSet.delete(t.id));
    }
    doneSet.delete(id);
  } else {
    doneSet.add(id);
  }
  saveStorage();
  renderProject();
}

function setFilter(f) {
  activeFilter = f;
  renderProject();
}

// ===== タスク編集モーダル =====
let editingTaskId = null;

function openEditModal(id) {
  const task = projectTasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  document.getElementById('modal-task-name').textContent = task.name;
  document.getElementById('modal-deadline').value = task.deadline || '';
  document.getElementById('modal-memo').value = task.memo || '';
  document.getElementById('modal-url').value = task.url || '';
  document.getElementById('modal-overlay').classList.add('open');
}

function closeEditModal() {
  editingTaskId = null;
  document.getElementById('modal-overlay').classList.remove('open');
}

function saveTaskEdit() {
  const task = projectTasks.find(t => t.id === editingTaskId);
  if (!task) return;
  task.deadline = document.getElementById('modal-deadline').value || '';
  task.memo = document.getElementById('modal-memo').value.trim();
  task.url = document.getElementById('modal-url').value.trim();
  saveStorage();
  closeEditModal();
  renderProject();
}

// ===== 初期化 =====
loadStorage();
if (projectTasks && projectTasks.length > 0) {
  showProjectScreen();
}

// 外から呼ぶ必要がある関数だけ公開
window.startEvent = startEvent;
window.goWelcome = goWelcome;
window.toggleTask = toggleTask;
window.setFilter = setFilter;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveTaskEdit = saveTaskEdit;

})();
