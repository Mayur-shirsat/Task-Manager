// Task Manager - PWA (dark neon theme)
// features: create/edit/delete/complete, filters, daily in-app reminder, persistence via localStorage
// No browser notifications (per request) — in-app reminder banner shown once per day for tasks with dailyReminder=true

/* ======= Utilities ======= */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ======= Elements ======= */
const newTaskBtn = $('#newTaskBtn');
const modal = $('#modal');
const closeModal = $('#closeModal');
const cancelBtn = $('#cancelBtn');
const saveBtn = $('#saveBtn');
const taskListEl = $('#taskList');
const totalCountEl = $('#totalCount');
const completedCountEl = $('#completedCount');
const pendingCountEl = $('#pendingCount');
const progressFill = $('#progressFill');
const completionPct = $('#completionPct');

const searchInput = $('#searchInput');
const categoryFilter = $('#categoryFilter');
const priorityFilter = $('#priorityFilter');
const sortFilter = $('#sortFilter');

const modalTitleEl = $('#modalTitle');
const taskTitleEl = $('#taskTitle');
const taskDescEl = $('#taskDesc');
const taskCategoryEl = $('#taskCategory');
const taskPriorityEl = $('#taskPriority');
const taskDueEl = $('#taskDue');
const dailyReminderEl = $('#dailyReminder');
const subtasksEl = $('#taskSubtasks');

const reminderBanner = $('#reminderBanner');
const reminderText = $('#reminderText');
const dismissReminder = $('#dismissReminder');

/* ======= State ======= */
const STORAGE_KEY = 'taskmgr_v2_tasks';
const REMINDER_KEY = 'taskmgr_v2_lastReminderDate';
let tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let editingIndex = null;

/* ======= Helper functions ======= */
function saveAll(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}
function uid(){ return Math.random().toString(36).slice(2,9); }
function fmtDate(dtStr){
  if(!dtStr) return 'N/A';
  const d = new Date(dtStr);
  if (isNaN(d)) return 'N/A';
  return d.toLocaleString();
}
function daysEqualISO(a,b){
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/* ======= Rendering ======= */
function refreshStats(){
  const total = tasks.length;
  const completed = tasks.filter(t=>t.completed).length;
  const pending = total - completed;
  totalCountEl.textContent = total;
  completedCountEl.textContent = completed;
  pendingCountEl.textContent = pending;
  const pct = total ? Math.round((completed/total)*100) : 0;
  progressFill.style.width = pct + '%';
  completionPct && (completionPct.textContent = pct + '%');
}

function applyFilters(list){
  const q = searchInput.value.trim().toLowerCase();
  const cat = categoryFilter.value;
  const pr = priorityFilter.value;
  let out = list.filter(t=>{
    if (q){
      if (!(t.title.toLowerCase().includes(q) || (t.desc||'').toLowerCase().includes(q) || (t.subtasks||[]).join(' ').toLowerCase().includes(q))) return false;
    }
    if (cat !== 'all' && t.category !== cat) return false;
    if (pr !== 'all' && t.priority !== pr) return false;
    return true;
  });
  const sortBy = sortFilter.value;
  if (sortBy === 'newest') out.sort((a,b)=> b.createdAt - a.createdAt);
  if (sortBy === 'oldest') out.sort((a,b)=> a.createdAt - b.createdAt);
  if (sortBy === 'due_soon') out.sort((a,b)=>{
    const da = a.due ? new Date(a.due).getTime() : 9e15;
    const db = b.due ? new Date(b.due).getTime() : 9e15;
    return da - db;
  });
  if (sortBy === 'priority') {
    const order = {'High':0,'Medium':1,'Low':2};
    out.sort((a,b)=> (order[a.priority]||9) - (order[b.priority]||9));
  }
  return out;
}

function renderList(){
  taskListEl.innerHTML = '';
  const filtered = applyFilters([...tasks]);
  if (filtered.length === 0){
    taskListEl.innerHTML = '<div class="empty">No tasks found with current filters.</div>';
    refreshStats();
    return;
  }

  filtered.forEach((t, idx)=>{
    const card = document.createElement('article');
    card.className = 'task';
    card.dataset.id = t.id;

    // subtasks string
    const subt = (t.subtasks && t.subtasks.length) ? `<div class="small">Subtasks: ${t.subtasks.join(', ')}</div>` : '';

    card.innerHTML = `
      <div class="task-row">
        <div>
          <div class="task-title">${escapeHtml(t.title)}</div>
          <div class="task-desc">${escapeHtml(t.desc || '')}</div>
        </div>
        <div class="actions">
          <button class="action-link complete" data-action="toggle" title="Toggle complete">${t.completed ? 'Undo' : 'Done'}</button>
          <button class="action-link edit" data-action="edit" title="Edit">Edit</button>
          <button class="action-link delete" data-action="delete" title="Delete">Delete</button>
        </div>
      </div>

      <div class="task-meta">
        <div class="tag">${escapeHtml(t.category)}</div>
        <div class="small">Priority: ${escapeHtml(t.priority)}</div>
        <div class="small">Due: ${escapeHtml(fmtDate(t.due))}</div>
        ${t.dailyReminder ? '<div class="small">Daily reminder</div>' : ''}
      </div>
      ${subt}
    `;

    if (t.completed) card.style.opacity = '0.6';
    // attach events
    card.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const act = btn.dataset.action;
        const id = t.id;
        const realIndex = tasks.findIndex(x=>x.id===id);
        if (act === 'toggle') toggleComplete(realIndex);
        if (act === 'edit') openEdit(realIndex);
        if (act === 'delete') removeTask(realIndex);
      });
    });

    taskListEl.appendChild(card);
  });

  refreshStats();
}

/* simple HTML escape */
function escapeHtml(s=''){ return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

/* ======= CRUD ======= */
function openCreate(){
  editingIndex = null;
  modalTitleEl.textContent = 'Create New Task';
  taskTitleEl.value = '';
  taskDescEl.value = '';
  taskCategoryEl.value = 'Personal';
  taskPriorityEl.value = 'Medium';
  taskDueEl.value = '';
  dailyReminderEl.checked = false;
  subtasksEl.value = '';
  showModal();
}
function openEdit(index){
  editingIndex = index;
  const t = tasks[index];
  modalTitleEl.textContent = 'Edit Task';
  taskTitleEl.value = t.title;
  taskDescEl.value = t.desc || '';
  taskCategoryEl.value = t.category || 'Personal';
  taskPriorityEl.value = t.priority || 'Medium';
  taskDueEl.value = t.due ? (new Date(t.due)).toISOString().slice(0,16) : '';
  dailyReminderEl.checked = !!t.dailyReminder;
  subtasksEl.value = (t.subtasks||[]).join(', ');
  showModal();
}
function showModal(){ modal.classList.remove('hidden'); document.body.style.overflow='hidden'; }
function closeModalFunc(){ modal.classList.add('hidden'); document.body.style.overflow='auto'; editingIndex=null; }

function saveTask(){
  const title = taskTitleEl.value.trim();
  if (!title) { alert('Please enter a task title'); return; }
  const payload = {
    id: editingIndex !== null ? tasks[editingIndex].id : uid(),
    title,
    desc: taskDescEl.value.trim(),
    category: taskCategoryEl.value,
    priority: taskPriorityEl.value,
    due: taskDueEl.value ? new Date(taskDueEl.value).toISOString() : null,
    dailyReminder: dailyReminderEl.checked,
    subtasks: subtasksEl.value ? subtasksEl.value.split(',').map(s=>s.trim()).filter(Boolean) : [],
    completed: editingIndex !== null ? tasks[editingIndex].completed : false,
    createdAt: editingIndex !== null ? tasks[editingIndex].createdAt : Date.now()
  };
  if (editingIndex !== null){
    tasks[editingIndex] = payload;
  } else {
    tasks.push(payload);
  }
  saveAll();
  closeModalFunc();
  renderList();
}

function removeTask(index){
  if (!confirm('Delete this task?')) return;
  tasks.splice(index,1);
  saveAll();
  renderList();
}

function toggleComplete(index){
  tasks[index].completed = !tasks[index].completed;
  saveAll();
  renderList();
}

/* ======= Filters & events ======= */
newTaskBtn.addEventListener('click', openCreate);
$('#closeModal').addEventListener('click', closeModalFunc);
cancelBtn.addEventListener('click', closeModalFunc);
saveBtn.addEventListener('click', saveTask);

[searchInput, categoryFilter, priorityFilter, sortFilter].forEach(el=>{
  el.addEventListener('input', renderList);
});

function openEdit(index){ openEditIndex(index) } // keep compatibility
function openEditIndex(i){ openEdit(i) }

/* ======= Daily in-app reminder (runs on load) ======= */
/* Show once per day a banner listing tasks with dailyReminder=true and not completed and due today or without due date */
function checkDailyReminders(){
  try {
    const last = localStorage.getItem(REMINDER_KEY);
    const todayISO = new Date().toDateString();
    if (last === todayISO) return; // already shown today

    const toRemind = tasks.filter(t=> t.dailyReminder && !t.completed && (
      !t.due || daysEqualISO(t.due,new Date())
    ));
    if (toRemind.length === 0) return;

    // build text
    const titles = toRemind.map(x => x.title).slice(0,6);
    const text = `Daily reminder: ${titles.join(', ')}${toRemind.length>6? '...' : ''}`;
    reminderText.textContent = text;
    reminderBanner.classList.remove('hidden');

    // mark shown today
    localStorage.setItem(REMINDER_KEY, todayISO);
  } catch(e){
    console.warn('reminder error',e);
  }
}
$('#dismissReminder')?.addEventListener('click', ()=>{
  reminderBanner.classList.add('hidden');
});

/* ======= Init ======= */
function init(){
  // ensure categories are curated (user requested fixed list)
  // categories are enforced via select options only

  // default sort
  sortFilter.value = 'newest';

  // initial render
  renderList();
  checkDailyReminders();

  // register service worker
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js').catch(()=>{/* no-op */});
  }
}

// expose for HTML onclick handlers used earlier via attribute (none now), keep for console
window.app = {
  openCreate, openEdit, saveTask, removeTask
};

init();
