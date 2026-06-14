import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

(function() {
// ===== 状態管理 =====
let currentEvent = null;
let answers = {};
let projectTasks = [];
let doneSet = new Set();
let activeFilter = 'all';
let currentProjectId = null;  // Supabaseのprojects.id

// ===== Supabase操作 =====
async function initUser() {
  // 匿名ユーザーとしてサインイン（既存セッションがあればそのまま）
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    await supabase.auth.signInAnonymously();
  }
}

async function loadProject() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) { console.error('ユーザー取得エラー', userError); return; }
  if (!user) return;

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!project) return;

  currentProjectId = project.id;
  currentEvent = project.event;
  answers = project.answers;

  const { data: tasks } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('project_id', project.id);

  const { data: done } = await supabase
    .from('project_done')
    .select('task_id')
    .eq('project_id', project.id);

  if (tasks) {
    projectTasks = tasks.map(t => ({
      id: t.task_id, name: t.name, cat: t.cat, who: t.who,
      deps: t.deps, priority: t.priority, note: t.note,
      deadline: t.deadline, memo: t.memo, url: t.url
    }));
  }
  if (done) doneSet = new Set(done.map(d => d.task_id));
}

async function saveProject() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  if (!currentProjectId) {
    // 新規プロジェクト作成
    const { data: project, error: insertError } = await supabase
      .from('projects')
      .insert({ user_id: user.id, event: currentEvent, answers })
      .select()
      .single();
    if (insertError || !project) { console.error('プロジェクト作成失敗', insertError); return; }
    currentProjectId = project.id;
  } else {
    await supabase
      .from('projects')
      .update({ answers })
      .eq('id', currentProjectId);
  }
}

async function saveAllTasks() {
  if (!currentProjectId) return;
  // 既存タスクを全削除して再挿入（削除失敗時は中断してデータ消失を防ぐ）
  const { error: deleteError } = await supabase.from('project_tasks').delete().eq('project_id', currentProjectId);
  if (deleteError) { console.error('タスク削除失敗', deleteError); return; }
  const rows = projectTasks.map(t => ({
    project_id: currentProjectId,
    task_id: t.id, name: t.name, cat: t.cat, who: t.who,
    deps: t.deps, priority: t.priority, note: t.note || null,
    deadline: t.deadline || null, memo: t.memo || null, url: t.url || null
  }));
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('project_tasks').insert(rows);
    if (insertError) { console.error('タスク保存失敗', insertError); }
  }
}

async function markDone(taskId) {
  if (!currentProjectId) return;
  await supabase.from('project_done').upsert({
    project_id: currentProjectId, task_id: taskId
  });
}

async function unmarkDone(taskIds) {
  if (!currentProjectId) return;
  await supabase.from('project_done')
    .delete()
    .eq('project_id', currentProjectId)
    .in('task_id', taskIds);
}

async function updateTask(taskId, fields) {
  if (!currentProjectId) return;
  await supabase.from('project_tasks')
    .update(fields)
    .eq('project_id', currentProjectId)
    .eq('task_id', taskId);
}

async function deleteTask(taskId) {
  if (!confirm('このタスクを削除しますか？')) return;
  if (!currentProjectId) return;
  await supabase.from('project_tasks').delete()
    .eq('project_id', currentProjectId)
    .eq('task_id', taskId);
  await supabase.from('project_done').delete()
    .eq('project_id', currentProjectId)
    .eq('task_id', taskId);
  projectTasks = projectTasks.filter(t => t.id !== taskId);
  doneSet.delete(taskId);
  closeCalDateModal();
  renderView();
}

async function resetProject() {
  if (!currentProjectId) return;
  // projectsを削除するとcascadeで子も消える
  await supabase.from('projects').delete().eq('id', currentProjectId);
  currentProjectId = null;
}

// ===== 画面切替 =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  window.scrollTo(0, 0);
}

async function goWelcome() {
  await resetProject();
  currentEvent = null; answers = {}; projectTasks = []; doneSet = new Set();
  activeFilter = 'all';
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
    text: '奥様が名義変更の必要な資格をお持ちであれば選んでください。（複数選択可、なければ「なし」を選択）',
    type: 'multi',
    options: ['なし（資格の変更は不要）', '医師免許', '看護師免許', '薬剤師免許', '弁護士', '税理士・公認会計士', '保育士', '教員免許', '社会保険労務士', '宅地建物取引士', 'その他'],
    keys: ['none', 'ishi', 'kango', 'yakuzai', 'bengoshi', 'zeirishi', 'hoikushi', 'kyoin', 'sharoshi', 'takken', 'sonota'],
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

async function startEvent(event) {
  await resetProject();
  currentEvent = event;
  answers = {};
  projectTasks = [];
  doneSet = new Set();
  chatStep = 0;
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
          // 「なし」を選んだら他をすべて解除、他を選んだら「なし」を解除
          if (key === 'none') {
            selected.clear();
            div.querySelectorAll('.chat-opt-btn').forEach(b => b.classList.remove('selected'));
          } else {
            selected.delete('none');
            div.querySelector('[data-key="none"]')?.classList.remove('selected');
          }
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
    confirm.onclick = async () => {
      answers[q.id] = [...selected];
      await saveProject();
      renderChat();
    };
    div.appendChild(confirm);
  } else {
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'chat-opt-btn';
      btn.innerHTML = `<span class="opt-check"></span>${opt}`;
      btn.onclick = async () => {
        answers[q.id] = q.keys[i];
        await saveProject();
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
async function generateProject() {
  const a = answers;
  const tasks = [];

  tasks.push({ id:'kon', name:'婚姻届を提出する', cat:'役所', who:'二人', deps:[], priority:1 });

  // 本籍地変更は常時任意で提示
  tasks.push({ id:'honeki', name:'本籍地の変更（転籍届）を提出する', cat:'役所', who:'二人', deps:['kon'], priority:3 });

  // 生命保険の受取人変更は常時推奨
  tasks.push({ id:'hoken_uketsunin', name:'生命保険の受取人を配偶者に変更する', cat:'保険', who:'二人', deps:['kon'], priority:2, note:'結婚直後に見直し推奨' });

  if (a.hikkoshi === 'yes') {
    tasks.push({ id:'tenshutsu', name:'旧住所の転出届を出す', cat:'役所', who:'二人', deps:[], priority:1 });
    tasks.push({ id:'tennyu', name:'新住所の転入届を出す', cat:'役所', who:'二人', deps:['tenshutsu'], priority:1 });
    tasks.push({ id:'juminhyo', name:'住民票の写しを取得する', cat:'役所', who:'二人', deps:['tennyu'], priority:2 });
    tasks.push({ id:'utility_gas', name:'ガス・電気・水道の住所変更／契約', cat:'住居', who:'二人', deps:['tennyu'], priority:2 });
    tasks.push({ id:'utility_net', name:'インターネット回線の移転手続き', cat:'住居', who:'二人', deps:[], priority:2 });
    tasks.push({ id:'rent_refund', name:'旧居の家賃日割り返還先口座を通知', cat:'住居', who:'二人', deps:['bank_main'], priority:2 });
    // 引っ越し時の追加タスク
    tasks.push({ id:'yubin_tensou', name:'郵便局に転居届（転送サービス）を提出する', cat:'役所', who:'二人', deps:['tenshutsu'], priority:1, note:'旧住所宛の郵便物を新住所に1年間転送' });
    tasks.push({ id:'nhk', name:'NHK受信料の住所変更・契約統合をする', cat:'生活', who:'二人', deps:['tennyu'], priority:3 });
    tasks.push({ id:'shinbun', name:'新聞の住所変更または解約をする', cat:'生活', who:'二人', deps:['tennyu'], priority:3 });
    tasks.push({ id:'furusato', name:'ふるさと納税のワンストップ特例申請書を再提出する', cat:'生活', who:'二人', deps:['tennyu'], priority:3, note:'今年度ふるさと納税をしている場合のみ' });
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
    // 改姓時の追加タスク
    tasks.push({ id:'koseki', name:'戸籍謄本（全部事項証明書）を取得する', cat:'役所', who:'二人', deps:['kon'], priority:2, note:'銀行・保険など各種名義変更で繰り返し必要' });
    tasks.push({ id:'inkan', name:'印鑑登録を廃止・新規登録する', cat:'役所', who:'妻', deps:['kon','juminhyo'], priority:2, note:'氏名変更で旧印鑑登録証が自動失効する' });
    tasks.push({ id:'hoken_seimei_kasei', name:'生命保険の契約者氏名を変更する', cat:'保険', who:'妻', deps:['kon','juminhyo'], priority:2 });
    tasks.push({ id:'shoken', name:'証券口座・NISA口座の氏名変更をする', cat:'銀行・金融', who:'妻', deps:['bank_main'], priority:2, note:'NISA口座は金融機関によって手続きが異なる' });
    tasks.push({ id:'kaisha_kasei', name:'会社に婚姻・氏名変更を届け出る（社員証・社内システム更新）', cat:'会社', who:'妻', deps:['kon'], priority:1, note:'早めに申請しないと社員証・メール等がズレる' });
    tasks.push({ id:'koyo_hoken', name:'雇用保険被保険者証の氏名変更をする（会社経由）', cat:'会社', who:'妻', deps:['kon'], priority:2 });
    tasks.push({ id:'gensen', name:'源泉徴収関係書類の氏名・住所変更を会社に提出する', cat:'会社', who:'妻', deps:['kon'], priority:2 });
    tasks.push({ id:'myna_portal', name:'マイナポータルの住所・氏名情報を確認・更新する', cat:'デジタル', who:'妻', deps:['mynumber'], priority:2 });
    tasks.push({ id:'subsuku', name:'各種サブスクリプション・SNSの氏名を変更する', cat:'デジタル', who:'妻', deps:['kon'], priority:3 });
    tasks.push({ id:'apple_google', name:'Apple ID・Googleアカウントの氏名を変更する', cat:'デジタル', who:'妻', deps:['kon'], priority:3 });
    tasks.push({ id:'sumaho_pay', name:'PayPay等スマホ決済の名義を確認・変更する', cat:'デジタル', who:'妻', deps:['bank_main'], priority:3 });
    tasks.push({ id:'tsuhan', name:'宅配・通販サービス（Amazon等）の住所・氏名を変更する', cat:'生活', who:'妻', deps:['kon'], priority:3 });
    // 定期券（改姓 or 引越しのどちらにも対応、改姓時はここで生成）
    tasks.push({ id:'teiki', name:'通勤定期券の氏名・区間変更をする', cat:'会社', who:'二人', deps:['kon'], priority:2 });
    // 損害保険（改姓あり）
    tasks.push({ id:'hoken_songai', name:'損害保険（火災・地震）の名義・住所変更をする', cat:'保険', who:'二人', deps:['kon'], priority:3 });

    if (a.passport === 'yes') {
      tasks.push({ id:'passport_change', name:'パスポートの氏名変更申請', cat:'免許', who:'妻', deps:['kon','license'], priority:3 });
    }
    // 資格の名義変更タスクを生成
    if (a.shikaku && a.shikaku.filter(k => k !== 'none').length > 0) {
      const shikakuNames = {
        ishi: '医師免許', kango: '看護師免許', yakuzai: '薬剤師免許',
        bengoshi: '弁護士資格', zeirishi: '税理士・公認会計士資格',
        hoikushi: '保育士資格', kyoin: '教員免許', sharoshi: '社会保険労務士資格',
        takken: '宅地建物取引士資格', sonota: '資格（その他）'
      };
      a.shikaku.filter(k => k !== 'none').forEach(key => {
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
      // 自動車保険（kuruma=yes かつ kasei=yes）
      tasks.push({ id:'hoken_car', name:'自動車保険の名義・住所変更をする', cat:'保険', who:'妻', deps:['jidosha'], priority:2, note:'等級・契約内容も確認' });
    }
  } else {
    if (a.hikkoshi === 'yes') {
      tasks.push({ id:'bank_main', name:'メイン銀行口座の住所変更', cat:'銀行・金融', who:'妻', deps:['juminhyo'], priority:2 });
      // 引越しのみの場合の追加タスク（改姓なし）
      tasks.push({ id:'hoken_songai', name:'損害保険（火災・地震）の名義・住所変更をする', cat:'保険', who:'二人', deps:['tennyu'], priority:3 });
      tasks.push({ id:'teiki_hikkoshi', name:'通勤定期券の区間変更をする', cat:'会社', who:'二人', deps:['tennyu'], priority:2 });
      tasks.push({ id:'tsuhan_hikkoshi', name:'宅配・通販サービスの住所を変更する', cat:'生活', who:'二人', deps:['tennyu'], priority:3 });
      tasks.push({ id:'myna_portal', name:'マイナポータルの住所・氏名情報を確認・更新する', cat:'デジタル', who:'妻', deps:['juminhyo'], priority:2 });
    }
    if (a.kuruma === 'yes') {
      tasks.push({ id:'jidosha', name:'自動車の住所変更（陸運局）', cat:'免許', who:'二人', deps: a.hikkoshi === 'yes' ? ['tennyu'] : [], priority:3 });
      // 自動車保険（kuruma=yes かつ hikkoshi=yes かつ kasei=no）
      if (a.hikkoshi === 'yes') {
        tasks.push({ id:'hoken_car', name:'自動車保険の名義・住所変更をする', cat:'保険', who:'妻', deps:['jidosha'], priority:2, note:'等級・契約内容も確認' });
      }
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
  await saveProject();
  await saveAllTasks();
  showProjectScreen();
}

// ===== プロジェクト画面 =====
let viewMode = 'list';
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

// 現在のビューモードに合わせて再描画
function renderView() {
  if (viewMode === 'calendar') {
    renderCalendar();
  } else {
    renderProject();
  }
}

function setViewMode(mode) {
  viewMode = mode;
  document.getElementById('view-btn-list').classList.toggle('active', mode === 'list');
  document.getElementById('view-btn-calendar').classList.toggle('active', mode === 'calendar');
  document.getElementById('list-view').style.display = mode === 'list' ? 'block' : 'none';
  document.getElementById('calendar-view').style.display = mode === 'calendar' ? 'block' : 'none';
  if (mode === 'calendar') renderCalendar();
}

function calMove(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

function renderCalendar() {
  const today = new Date();
  document.getElementById('cal-nav-title').textContent =
    `${calYear}年${calMonth + 1}月`;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();

  const dow = ['日','月','火','水','木','金','土'];
  let html = dow.map(d => `<div class="cal-dow">${d}</div>`).join('');

  // 前月の空白セル
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-cell other-month"><span class="cal-date">${daysInPrev - firstDay + 1 + i}</span></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
    const tasksOnDay = projectTasks.filter(t => t.deadline === dateStr).sort((a,b) => (a.priority||3)-(b.priority||3));

    let chips = '';
    const MAX_CHIPS = 3;
    tasksOnDay.slice(0, MAX_CHIPS).forEach(t => {
      const isDone = doneSet.has(t.id);
      chips += `<button class="cal-chip ${isDone?'done':''} priority-${t.priority||3}"
        draggable="true"
        ondragstart="calDragStart(event,'${t.id}')"
        ondragend="calDragEnd(event)"
        onclick="event.stopPropagation();openEditModal('${t.id}')"
        title="${t.name}">${t.name}</button>`;
    });
    if (tasksOnDay.length > MAX_CHIPS) {
      chips += `<div class="cal-more">+${tasksOnDay.length - MAX_CHIPS} 件</div>`;
    }

    html += `<div class="cal-cell ${isToday?'today':''}"
      ondragover="calDragOver(event)"
      ondragleave="calDragLeave(event)"
      ondrop="calDrop(event,'${dateStr}')"
      onclick="openCalDateModal('${dateStr}')">
      <span class="cal-date">${d}</span>${chips}
    </div>`;
  }

  // 翌月の空白セル
  const total = firstDay + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= remaining; i++) {
    html += `<div class="cal-cell other-month"><span class="cal-date">${i}</span></div>`;
  }

  document.getElementById('cal-grid').innerHTML = html;

  // 期限未設定タスク
  const unscheduled = projectTasks.filter(t => !t.deadline && !doneSet.has(t.id));
  const unschEl = document.getElementById('cal-unscheduled');
  if (unscheduled.length) {
    unschEl.innerHTML = `<div class="cal-unscheduled-label">期限未設定 (${unscheduled.length}件)</div>
      <div class="task-list">${unscheduled.map(taskHTML).join('')}</div>`;
  } else {
    unschEl.innerHTML = '';
  }
}

// ===== カレンダー ドラッグ&ドロップ =====
let draggingTaskId = null;

function calDragStart(event, taskId) {
  draggingTaskId = taskId;
  event.dataTransfer.effectAllowed = 'move';
  event.target.classList.add('dragging');
}

function calDragEnd(event) {
  event.target.classList.remove('dragging');
  draggingTaskId = null;
  document.querySelectorAll('.cal-cell.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function calDragOver(event) {
  if (!draggingTaskId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('drag-over');
}

function calDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

async function calDrop(event, dateStr) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  if (!draggingTaskId) return;
  const task = projectTasks.find(t => t.id === draggingTaskId);
  if (!task || task.deadline === dateStr) return;
  task.deadline = dateStr;
  await updateTask(draggingTaskId, { deadline: dateStr });
  renderCalendar();
}

// ===== 日付クリックモーダル =====
let calSelectedDate = '';

function openCalDateModal(dateStr) {
  calSelectedDate = dateStr;
  const [y, m, d] = dateStr.split('-');
  document.getElementById('cal-date-title').textContent = `${parseInt(m)}月${parseInt(d)}日`;

  const tasksOnDay = projectTasks.filter(t => t.deadline === dateStr).sort((a,b) => (a.priority||3)-(b.priority||3));
  const unscheduled = projectTasks.filter(t => !t.deadline && !doneSet.has(t.id));

  const priorityLabel = ['','高','中','低'];
  let html = '';

  if (tasksOnDay.length) {
    html += `<div class="modal-label" style="margin-bottom:6px;">この日のタスク</div>`;
    tasksOnDay.forEach(t => {
      const isDone = doneSet.has(t.id);
      const p = t.priority || 3;
      html += `<div class="cal-date-task-row">
        <span class="cal-date-priority-badge priority-badge-${p}">${priorityLabel[p]}</span>
        <span class="cal-date-task-name ${isDone?'done':''}">${t.name}</span>
        <button class="modal-btn-cancel cal-date-task-btn-sm" onclick="removeDeadline('${t.id}')">期限解除</button>
        <button class="edit-btn" onclick="closeCalDateModal();openEditModal('${t.id}')" title="編集">
          <svg viewBox="0 0 14 14"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/><path d="M8 4l2 2"/></svg>
        </button>
        <button class="delete-btn" onclick="deleteTask('${t.id}')" title="削除">
          <svg viewBox="0 0 14 14"><path d="M2 3h10M5 3V2h4v1M6 6v4M8 6v4M3 3l1 9h6l1-9"/></svg>
        </button>
      </div>`;
    });
  }

  if (unscheduled.length) {
    html += `<div class="modal-label" style="margin:${tasksOnDay.length?'14px':0} 0 6px;">この日に期限を設定するタスクを選ぶ</div>`;
    unscheduled.forEach(t => {
      html += `<button class="chat-opt-btn" style="margin-bottom:4px;" onclick="assignDeadline('${t.id}','${dateStr}')">
        <span class="opt-check"></span>${t.name} <span style="margin-left:auto;font-size:11px;color:var(--text3);">${t.cat}</span>
      </button>`;
    });
  }

  if (!tasksOnDay.length && !unscheduled.length) {
    html = `<div style="color:var(--text3);font-size:13px;text-align:center;padding:16px 0;">期限未設定のタスクはありません</div>`;
  }

  document.getElementById('cal-date-body').innerHTML = html;
  document.getElementById('cal-date-overlay').classList.add('open');
}

function closeCalDateModal() {
  document.getElementById('cal-date-overlay').classList.remove('open');
}

async function assignDeadline(taskId, dateStr) {
  const task = projectTasks.find(t => t.id === taskId);
  if (!task) return;
  task.deadline = dateStr;
  await updateTask(taskId, { deadline: dateStr });
  closeCalDateModal();
  renderCalendar();
}

async function removeDeadline(taskId) {
  const task = projectTasks.find(t => t.id === taskId);
  if (!task) return;
  task.deadline = '';
  await updateTask(taskId, { deadline: null });
  // モーダルを更新
  openCalDateModal(calSelectedDate);
  renderCalendar();
}

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
    const p1 = available.filter(t => t.priority === 1);
    const p2 = available.filter(t => t.priority === 2);
    const p3 = available.filter(t => t.priority === 3 || !t.priority);
    let html = `<div class="section-label">今すぐ着手できる (${available.length})</div>`;
    if (p1.length) html += `<div class="priority-group-label priority-label-1">優先度：高</div><div class="task-list">${p1.map(taskHTML).join('')}</div>`;
    if (p2.length) html += `<div class="priority-group-label priority-label-2">優先度：中</div><div class="task-list">${p2.map(taskHTML).join('')}</div>`;
    if (p3.length) html += `<div class="priority-group-label priority-label-3">優先度：低</div><div class="task-list">${p3.map(taskHTML).join('')}</div>`;
    sections.innerHTML += html;
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
  const priorityClass = `priority-${t.priority || 3}`;
  return `<div class="task-card ${bl?'blocked':''} ${checked?'done':''} ${priorityClass}">
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
      <button class="tag tag-priority priority-${t.priority || 3}" onclick="cyclePriority('${t.id}')" title="クリックで優先度変更">${['','高','中','低'][t.priority || 3]}</button>
      <span class="tag ${whoClass}">${t.who}</span>
      <span class="tag tag-cat">${t.cat}</span>
      <button class="edit-btn" onclick="openEditModal('${t.id}')" aria-label="編集">
        <svg viewBox="0 0 14 14"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/><path d="M8 4l2 2"/></svg>
      </button>
      <button class="ai-btn" onclick="openAIChat('${t.id}')" aria-label="AIに質問する" title="AIに質問する">✨</button>
    </div>
  </div>`;
}

async function toggleTask(id) {
  const task = projectTasks.find(t => t.id === id);
  if (!task) return;
  if (isBlocked(task) && !doneSet.has(id)) return;
  if (doneSet.has(id)) {
    // 依存グラフを幅優先で辿り、完了済みの子孫タスクをすべて収集する
    const toUnmark = [];
    const queue = [id];
    while (queue.length > 0) {
      const cur = queue.shift();
      const children = projectTasks.filter(t => t.deps.includes(cur) && doneSet.has(t.id));
      children.forEach(t => { toUnmark.push(t.id); queue.push(t.id); });
    }
    if (toUnmark.length > 0) {
      const names = toUnmark.map(tid => projectTasks.find(t => t.id === tid)?.name).filter(Boolean).join('、');
      if (!confirm(`「${names}」も未完了に戻ります。よろしいですか？`)) return;
      toUnmark.forEach(tid => doneSet.delete(tid));
      await unmarkDone(toUnmark);
    }
    doneSet.delete(id);
    await unmarkDone([id]);
  } else {
    doneSet.add(id);
    await markDone(id);
  }
  renderView();
}

function setFilter(f) {
  activeFilter = f;
  renderProject();
}

async function cyclePriority(id) {
  const task = projectTasks.find(t => t.id === id);
  if (!task) return;
  task.priority = task.priority === 1 ? 2 : task.priority === 2 ? 3 : 1;
  await updateTask(id, { priority: task.priority });
  renderView();
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
  document.querySelectorAll('#modal-priority-selector .priority-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.value) === (task.priority || 3));
  });
  document.getElementById('modal-overlay').classList.add('open');
}

function closeEditModal() {
  editingTaskId = null;
  document.getElementById('modal-overlay').classList.remove('open');
}

async function deleteTaskFromModal() {
  if (!editingTaskId) return;
  const id = editingTaskId;  // closeEditModal でnullになる前に退避
  closeEditModal();
  await deleteTask(id);
}

async function saveTaskEdit() {
  const task = projectTasks.find(t => t.id === editingTaskId);
  if (!task) return;
  task.deadline = document.getElementById('modal-deadline').value || '';
  task.memo = document.getElementById('modal-memo').value.trim();
  task.url = document.getElementById('modal-url').value.trim();
  const activeBtn = document.querySelector('#modal-priority-selector .priority-btn.active');
  if (activeBtn) task.priority = Number(activeBtn.dataset.value);
  await updateTask(editingTaskId, {
    deadline: task.deadline || null,
    memo: task.memo || null,
    url: task.url || null,
    priority: task.priority
  });
  closeEditModal();
  renderView();
}

// ===== チュートリアル =====
function showTutorialIfFirst() {
  if (!localStorage.getItem('tutorial_seen')) {
    document.getElementById('tutorial-overlay').classList.add('open');
  }
}

function openTutorial() {
  document.getElementById('tutorial-overlay').classList.add('open');
}

function closeTutorial() {
  localStorage.setItem('tutorial_seen', '1');
  document.getElementById('tutorial-overlay').classList.remove('open');
}

// ===== AIアドバイザー =====
async function openAdvisor() {
  document.getElementById('advisor-overlay').classList.add('open');
  const body = document.getElementById('advisor-body');
  body.innerHTML = '<div class="ai-msg ai"><div class="ai-msg-avatar">✨</div><div class="ai-typing">分析中...</div></div>';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'advisor',
        tasks: projectTasks,
        doneIds: [...doneSet],
        today: new Date().toISOString().slice(0, 10),
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    body.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'ai-msg ai';
    div.innerHTML = `<div class="ai-msg-avatar">✨</div><div class="ai-msg-bubble">${data.content || 'エラーが発生しました。'}</div>`;
    body.appendChild(div);
  } catch {
    body.innerHTML = '<div class="ai-msg ai"><div class="ai-msg-avatar">✨</div><div class="ai-msg-bubble">エラーが発生しました。</div></div>';
  }
}

function closeAdvisor() {
  document.getElementById('advisor-overlay').classList.remove('open');
}

// ===== AIチャット =====
let aiChatTaskId = null;
let aiChatMessages = [];
let aiChatSending = false;

function openAIChat(id) {
  const task = projectTasks.find(t => t.id === id);
  if (!task) return;
  aiChatTaskId = id;
  aiChatMessages = [];
  document.getElementById('ai-chat-task-name').textContent = task.name;
  document.getElementById('ai-chat-messages').innerHTML = '';
  document.getElementById('ai-chat-input').value = '';
  appendAIMessage('ai', `「${task.name}」について何でも聞いてください。必要書類・窓口・手順などをお答えします。`);
  document.getElementById('ai-chat-overlay').classList.add('open');
  document.getElementById('ai-chat-input').focus();
}

function closeAIChat() {
  aiChatTaskId = null;
  aiChatMessages = [];
  document.getElementById('ai-chat-overlay').classList.remove('open');
}

function appendUserMessage(text) {
  const el = document.getElementById('ai-chat-messages');
  const div = document.createElement('div');
  div.className = 'ai-msg user';
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble';
  bubble.textContent = text;
  div.appendChild(bubble);
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function appendAIMessage(role, text) {
  if (role === 'user') { appendUserMessage(text); return; }

  const el = document.getElementById('ai-chat-messages');
  const div = document.createElement('div');
  div.className = 'ai-msg ai';

  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-avatar';
  avatar.textContent = '✨';

  const wrapper = document.createElement('div');
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble';
  bubble.textContent = text;

  const btnRow = document.createElement('div');
  btnRow.className = 'save-memo-row';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-memo-btn';
  saveBtn.textContent = '📋 メモに保存';
  saveBtn.addEventListener('click', () => saveMemoFromChat(saveBtn, text, btnRow));

  const summarizeBtn = document.createElement('button');
  summarizeBtn.className = 'save-memo-btn';
  summarizeBtn.textContent = '✂️ 要約して保存';
  summarizeBtn.addEventListener('click', () => saveSummaryFromChat(summarizeBtn, text, btnRow));

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(summarizeBtn);
  wrapper.appendChild(bubble);
  wrapper.appendChild(btnRow);
  div.appendChild(avatar);
  div.appendChild(wrapper);

  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

async function saveMemoFromChat(btn, text, btnRow) {
  const task = projectTasks.find(t => t.id === aiChatTaskId);
  if (!task) return;
  const current = task.memo ? task.memo + '\n\n' : '';
  task.memo = current + text;
  await updateTask(task.id, { memo: task.memo });
  btnRow.innerHTML = '<span style="font-size:11px;color:var(--accent);">✓ メモに保存しました</span>';
}

async function saveSummaryFromChat(btn, text, btnRow) {
  const task = projectTasks.find(t => t.id === aiChatTaskId);
  if (!task) return;
  btn.textContent = '要約中...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'summarize', text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const summary = data.content || text;
    const current = task.memo ? task.memo + '\n\n' : '';
    task.memo = current + summary;
    await updateTask(task.id, { memo: task.memo });
    btnRow.innerHTML = '<span style="font-size:11px;color:var(--accent);">✓ 要約してメモに保存しました</span>';
  } catch {
    btn.textContent = '✂️ 要約して保存';
    btn.disabled = false;
  }
}

async function sendAIMessage() {
  if (aiChatSending) return;
  const input = document.getElementById('ai-chat-input');
  const text = input.value.trim();
  if (!text || !aiChatTaskId) return;

  const task = projectTasks.find(t => t.id === aiChatTaskId);
  if (!task) return;

  aiChatMessages.push({ role: 'user', content: text });
  appendAIMessage('user', text);
  input.value = '';

  const sendBtn = document.getElementById('ai-chat-send-btn');
  sendBtn.disabled = true;
  aiChatSending = true;

  const typingEl = document.createElement('div');
  typingEl.className = 'ai-msg ai';
  typingEl.innerHTML = '<div class="ai-msg-avatar">✨</div><div class="ai-typing">考え中...</div>';
  document.getElementById('ai-chat-messages').appendChild(typingEl);
  document.getElementById('ai-chat-messages').scrollTop = document.getElementById('ai-chat-messages').scrollHeight;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskName: task.name, taskCat: task.cat, messages: aiChatMessages }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    typingEl.remove();
    if (data.content) {
      aiChatMessages.push({ role: 'assistant', content: data.content });
      appendAIMessage('ai', data.content);
    } else {
      appendAIMessage('ai', 'エラーが発生しました。もう一度お試しください。');
    }
  } catch {
    typingEl.remove();
    appendAIMessage('ai', 'エラーが発生しました。もう一度お試しください。');
  } finally {
    sendBtn.disabled = false;
    aiChatSending = false;
    input.focus();
  }
}

// ===== 初期化 =====
(async () => {
  await initUser();
  await loadProject();
  if (projectTasks.length > 0) {
    showProjectScreen();
  }
  showTutorialIfFirst();
})();

// 外から呼ぶ必要がある関数だけ公開
window.startEvent = startEvent;
window.goWelcome = goWelcome;
window.toggleTask = toggleTask;
window.setFilter = setFilter;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveTaskEdit = saveTaskEdit;
window.openTutorial = openTutorial;
window.closeTutorial = closeTutorial;
window.openAdvisor = openAdvisor;
window.closeAdvisor = closeAdvisor;
window.saveMemoFromChat = saveMemoFromChat;
window.saveSummaryFromChat = saveSummaryFromChat;
window.openAIChat = openAIChat;
window.closeAIChat = closeAIChat;
window.sendAIMessage = sendAIMessage;
window.setViewMode = setViewMode;
window.calMove = calMove;
window.openCalDateModal = openCalDateModal;
window.closeCalDateModal = closeCalDateModal;
window.assignDeadline = assignDeadline;
window.removeDeadline = removeDeadline;
window.deleteTask = deleteTask;
window.calDragStart = calDragStart;
window.calDragEnd = calDragEnd;
window.calDragOver = calDragOver;
window.calDragLeave = calDragLeave;
window.calDrop = calDrop;
window.cyclePriority = cyclePriority;
window.deleteTaskFromModal = deleteTaskFromModal;

// 優先度セレクタのボタン切り替え
document.querySelectorAll('#modal-priority-selector .priority-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#modal-priority-selector .priority-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Enterキーで送信
document.getElementById('ai-chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
});

})();
