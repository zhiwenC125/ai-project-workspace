const $ = id => document.getElementById(id);
const incoming = new URLSearchParams(location.hash.slice(1)).get('token');
if (incoming) { sessionStorage.setItem('workbench-token', incoming); history.replaceState(null, '', location.pathname); }
let token = sessionStorage.getItem('workbench-token') ?? '';
let selectedNode, selectedItem, selectedRun, timer, busy = false, generation = 0, pendingKey;
const states = { todo: '待开始', in_progress: '进行中', in_review: '待评审', done: '已完成', queued: '排队中', running: '执行中', waiting_for_human: '待人工评审', succeeded: '已通过', failed: '未通过 / 失败', cancelled: '已取消' };
const labels = { 'run.queued': '运行已创建', 'step.started': '步骤开始', 'step.succeeded': '步骤完成', 'run.waiting_for_human': '等待人工评审', 'decision.submitted': '已提交决定', 'run.succeeded': '运行通过', 'run.failed': '运行失败', 'step.failed': '步骤失败', 'run.cancelled': '已取消' };
const steps = { start: '开始', 'harness-review': 'Harness 只读分析', 'human-review': '人工评审', completed: '完成', rejected: '退回' };
function error(message) { $('error').textContent = message; $('error').hidden = !message; }
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !$('auth').open) $('auth').showModal();
    throw Error(value.error ?? `请求失败 (${response.status})`);
  }
  return value;
}
async function action(fn) { try { error(''); await fn(); } catch (err) { error(err.message); } }
function setBusy(value) { busy = value; $('start').disabled = value || !selectedItem || selectedNode !== 'development'; $('approve').disabled = value; $('reject').disabled = value; }
function paintRun(run) {
  selectedRun = run;
  if (run) {
    const option = Array.from($('history').options).find(value => value.value === run.id);
    if (option) option.textContent = `${option.index === 0 ? '最新 · ' : ''}${new Date(run.createdAt).toLocaleString()} · ${states[run.status]}`;
  }
  $('run-status').textContent = states[run?.status] ?? '未启动';
  $('run-output').textContent = run?.context?.harnessSummary || (run?.status === 'failed' ? run.events.findLast(e => e.reason)?.reason || '运行失败，请查看步骤记录。' : run && ['queued', 'running'].includes(run.status) ? 'Harness 正在分析，结果会在完成后显示。首次连接模型可能需要稍等。' : '尚无执行记录。点击“启动只读分析”，由 Harness 检查执行目录并生成摘要。');
  $('decision').hidden = run?.status !== 'waiting_for_human';
  $('events').replaceChildren(...(run?.events ?? []).map(event => {
    const li = document.createElement('li');
    li.textContent = `${new Date(event.occurredAt).toLocaleTimeString()} · ${labels[event.type] ?? event.type}${event.stepId ? ` · ${steps[event.stepId] ?? event.stepId}` : ''}${event.decision ? ` · ${event.decision === 'approve' ? '通过' : '退回'}` : ''}${event.reason ? ` · ${event.reason}` : ''}`;
    return li;
  }));
}
function poll(runId, epoch) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (epoch !== generation || selectedRun?.id !== runId) return;
    try {
      const { run } = await api(`/api/runs/${runId}`);
      if (epoch !== generation || selectedRun?.id !== runId) return;
      paintRun(run);
      if (['queued', 'running'].includes(run.status)) poll(runId, epoch);
    } catch (err) { error(`读取运行状态失败：${err.message}。可点击“刷新状态”重试。`); }
  }, 1200);
}
async function loadRun(runId) {
  clearTimeout(timer);
  const epoch = ++generation;
  if (!runId) return paintRun(null);
  const { run } = await api(`/api/runs/${runId}`);
  if (epoch !== generation) return;
  paintRun(run);
  if (['queued', 'running'].includes(run.status)) poll(run.id, epoch);
}
async function selectItem(item, preserveRun) {
  clearTimeout(timer); generation++;
  selectedItem = item; pendingKey = undefined;
  document.querySelectorAll('.item').forEach(button => button.classList.toggle('selected', button.dataset.id === item.id));
  $('task-title').textContent = item.title;
  $('task-meta').textContent = `${item.id} · ${selectedNode === 'development' ? '工作流：只读分析 → 人工评审 → 完成' : '这个阶段暂未绑定可执行工作流。请选择“开发实现”体验。'}`;
  setBusy(false); paintRun(null);
  const epoch = generation;
  const { runs } = await api(`/api/work-items/${item.id}/runs`);
  if (epoch !== generation) return;
  $('history').replaceChildren(...(runs.length ? runs.map((run, index) => { const option = document.createElement('option'); option.value = run.id; option.textContent = `${index === 0 ? '最新 · ' : ''}${new Date(run.createdAt).toLocaleString()} · ${states[run.status]}`; return option; }) : [new Option('暂无运行', '')]));
  const id = runs.some(run => run.id === preserveRun) ? preserveRun : runs[0]?.id;
  $('history').value = id ?? '';
  await loadRun(id);
}
async function selectNode(id) {
  clearTimeout(timer); generation++; selectedNode = id; selectedItem = null;
  setBusy(false); paintRun(null);
  document.querySelectorAll('.flow-node').forEach(button => button.classList.toggle('selected', button.dataset.id === id));
  const epoch = generation;
  const { node, workItems } = await api(`/api/projects/workspace-mvp/nodes/${id}`);
  if (epoch !== generation) return;
  $('node-title').textContent = node.title; $('item-count').textContent = `${workItems.length} 个工作项`;
  $('criteria').textContent = `验收条件：${node.acceptanceCriteria.join('；')}`;
  $('items').replaceChildren(...workItems.map(item => {
    const button = document.createElement('button'); button.className = 'item'; button.dataset.id = item.id;
    const span = document.createElement('span'); const small = document.createElement('small'); small.textContent = item.id; span.append(small, document.createTextNode(item.title));
    const status = document.createElement('span'); status.className = 'state'; status.textContent = states[item.status]; button.append(span, status);
    button.onclick = () => { if (!busy) action(() => selectItem(item)); }; return button;
  }));
  if (workItems.length) await selectItem(workItems.find(item => item.id === 'WS-128') ?? workItems[0]);
}
async function initialize() {
  const runtime = await api('/api/runtime');
  $('mode').textContent = runtime.mode === 'demo' ? '演示模式 · 不调用模型' : '真实 Harness · 只读';
  $('notice').textContent = runtime.mode === 'demo' ? '当前为模拟执行。项目和工作项为演示数据，不会调用 Harness。' : '项目和工作项为演示数据；启动分析会调用本机 Harness，使用你的模型订阅。';
  $('directory').textContent = `执行目录：${runtime.workingDirectory}`;
  const { nodes } = await api('/api/projects/workspace-mvp/flow');
  const children = [];
  nodes.forEach((node, index) => {
    if (index) { const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '→'; arrow.setAttribute('aria-hidden', 'true'); children.push(arrow); }
    const button = document.createElement('button'); button.className = 'flow-node'; button.dataset.id = node.id;
    const number = document.createElement('span'); number.className = 'number'; number.textContent = `PHASE 0${index + 1}`;
    const small = document.createElement('small'); small.textContent = `${node.workItemIds.length} 个工作项${node.id === 'development' ? ' · 可执行' : ''}`;
    button.append(number, document.createTextNode(node.title), small); button.onclick = () => { if (!busy) action(() => selectNode(node.id)); }; children.push(button);
  });
  $('flow').replaceChildren(...children);
  await selectNode(selectedNode ?? 'development');
}
$('start').onclick = () => action(async () => {
  if (busy || !selectedItem) return;
  setBusy(true);
  pendingKey ??= crypto.randomUUID();
  try {
    const { run } = await api(`/api/work-items/${selectedItem.id}/runs`, { method: 'POST', body: JSON.stringify({ actorId: 'local-user', idempotencyKey: pendingKey }) });
    pendingKey = undefined;
    await selectItem(selectedItem, run.id);
  } finally { setBusy(false); }
});
for (const decision of ['approve', 'reject']) $(decision).onclick = () => action(async () => {
  if (busy || !selectedRun) return;
  setBusy(true);
  try { const { run } = await api(`/api/runs/${selectedRun.id}/decisions`, { method: 'POST', body: JSON.stringify({ actorId: 'local-user', decision, expectedRevision: selectedRun.revision }) }); paintRun(run); }
  finally { setBusy(false); }
});
$('history').onchange = () => { if (!busy) action(() => loadRun($('history').value)); };
$('refresh').onclick = () => { if (!busy) action(() => selectedItem ? selectItem(selectedItem, selectedRun?.id) : initialize()); };
$('auth-form').onsubmit = async event => {
  event.preventDefault(); token = $('token').value.trim(); sessionStorage.setItem('workbench-token', token);
  try { await initialize(); $('auth').close(); $('auth-error').textContent = ''; error(''); }
  catch (err) { $('auth-error').textContent = err.message; }
};
if (token) action(initialize); else $('auth').showModal();
