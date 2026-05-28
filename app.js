// ===== Firebase Config =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCatbAnyFusmg1CKoQQvQcT98EUGsVHEkw",
  authDomain: "daniel-tasks-app.firebaseapp.com",
  projectId: "daniel-tasks-app",
  storageBucket: "daniel-tasks-app.firebasestorage.app",
  messagingSenderId: "102327006072",
  appId: "1:102327006072:web:8aa24756138096d8ca0e8d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===== מזהה קבוע לכל המשימות =====
const OWNER_ID = "daniel-fattal";

// ===== State =====
let tasks = [];
let currentFilter = 'all';
let currentSort = 'priority';
let editingTaskId = null;
let scheduledReminders = {};

// ===== Priority =====
const priorityOrder = { high: 0, medium: 1, low: 2 };
const priorityLabel = { high: '🔴 גבוהה', medium: '🟡 בינונית', low: '🟢 נמוכה' };
const categoryEmoji = { 'לימודים': '📚', 'אישי': '👤', 'עבודה': '💼' };

// ===== התחלה =====
listenTasks();
requestNotificationPermission();

// ===== Firestore =====
function listenTasks() {
  const q = query(collection(db, 'tasks'), where('uid', '==', OWNER_ID));
  onSnapshot(q, snapshot => {
    tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTasks();
    updateStats();
    scheduleAllReminders();
  });
}

async function addTask(taskData) {
  await addDoc(collection(db, 'tasks'), {
    ...taskData,
    uid: OWNER_ID,
    createdAt: serverTimestamp(),
    completed: false
  });
}

async function updateTask(id, data) {
  await updateDoc(doc(db, 'tasks', id), data);
}

async function deleteTask(id) {
  await deleteDoc(doc(db, 'tasks', id));
}

// ===== Filters & Sort =====
window.setFilter = function(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderTasks();
};

window.setSort = function(val) {
  currentSort = val;
  renderTasks();
};

function getFilteredSorted() {
  let list = [...tasks];
  if (currentFilter !== 'all') {
    list = list.filter(t => t.category === currentFilter);
  }
  list.sort((a, b) => {
    if (currentSort === 'priority') return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
    if (currentSort === 'dueDate') {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (currentSort === 'category') return (a.category || '').localeCompare(b.category || '');
    const ta = a.createdAt?.seconds || 0;
    const tb = b.createdAt?.seconds || 0;
    return tb - ta;
  });
  list.sort((a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0));
  return list;
}

// ===== Render =====
function renderTasks() {
  const list = getFilteredSorted();
  const container = document.getElementById('task-list');
  const empty = document.getElementById('empty-state');

  if (list.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = list.map(task => {
    const isOverdue = task.dueDate && !task.completed && task.dueDate < todayStr();
    const emoji = categoryEmoji[task.category] || '🏷️';
    return `
      <div class="task-card priority-${task.priority} ${task.completed ? 'completed' : ''}">
        <div class="task-checkbox ${task.completed ? 'checked' : ''}" onclick="toggleTask('${task.id}')">
          ${task.completed ? '✓' : ''}
        </div>
        <div class="task-body">
          <div class="task-title-text">${escHtml(task.title)}</div>
          ${task.description ? `<div class="task-desc-text">${escHtml(task.description)}</div>` : ''}
          <div class="task-meta">
            <span class="tag tag-priority-${task.priority}">${priorityLabel[task.priority]}</span>
            <span class="tag tag-category">${emoji} ${escHtml(task.category || '')}</span>
            ${task.dueDate ? `<span class="tag tag-date ${isOverdue ? 'overdue' : ''}">📅 ${formatDate(task.dueDate)}${isOverdue ? ' (פג תוקף)' : ''}</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="btn-icon" onclick="openEditModal('${task.id}')" title="ערוך">✏️</button>
          <button class="btn-icon" onclick="confirmDelete('${task.id}')" title="מחק">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateStats() {
  const total = tasks.length;
  const done = tasks.filter(t => t.completed).length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-done').textContent = done;
  document.getElementById('stat-pending').textContent = total - done;
}

// ===== Modal =====
window.openAddModal = function() {
  editingTaskId = null;
  document.getElementById('modal-title').textContent = 'משימה חדשה';
  document.getElementById('task-title').value = '';
  document.getElementById('task-desc').value = '';
  document.getElementById('task-priority').value = 'medium';
  document.getElementById('task-category').value = 'לימודים';
  document.getElementById('task-due').value = '';
  document.getElementById('task-reminder').value = '';
  document.getElementById('custom-category-input').style.display = 'none';
  document.getElementById('task-custom-category').value = '';
  document.getElementById('task-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('task-title').focus(), 100);
};

window.openEditModal = function(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  document.getElementById('modal-title').textContent = 'עריכת משימה';
  document.getElementById('task-title').value = task.title || '';
  document.getElementById('task-desc').value = task.description || '';
  document.getElementById('task-priority').value = task.priority || 'medium';
  document.getElementById('task-due').value = task.dueDate || '';
  document.getElementById('task-reminder').value = task.reminder || '';

  const presets = ['לימודים', 'אישי', 'עבודה'];
  if (presets.includes(task.category)) {
    document.getElementById('task-category').value = task.category;
    document.getElementById('custom-category-input').style.display = 'none';
  } else {
    document.getElementById('task-category').value = 'custom';
    document.getElementById('custom-category-input').style.display = 'block';
    document.getElementById('task-custom-category').value = task.category || '';
  }
  document.getElementById('task-modal').style.display = 'flex';
};

window.closeModal = function() {
  document.getElementById('task-modal').style.display = 'none';
};

window.closeModalOutside = function(e) {
  if (e.target === document.getElementById('task-modal')) closeModal();
};

window.handleCategoryChange = function() {
  const val = document.getElementById('task-category').value;
  document.getElementById('custom-category-input').style.display = val === 'custom' ? 'block' : 'none';
};

window.saveTask = async function() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) { showToast('נא להזין שם משימה'); return; }

  const catSel = document.getElementById('task-category').value;
  const category = catSel === 'custom'
    ? (document.getElementById('task-custom-category').value.trim() || 'אחר')
    : catSel;

  const data = {
    title,
    description: document.getElementById('task-desc').value.trim(),
    priority: document.getElementById('task-priority').value,
    category,
    dueDate: document.getElementById('task-due').value || '',
    reminder: document.getElementById('task-reminder').value || '',
  };

  try {
    if (editingTaskId) {
      await updateTask(editingTaskId, data);
      showToast('המשימה עודכנה ✓');
    } else {
      await addTask(data);
      showToast('המשימה נוספה ✓');
    }
    updateCustomCategoryChip();
    closeModal();
  } catch (e) {
    showToast('שגיאה בשמירה, נסה שוב');
  }
};

window.toggleTask = async function(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  await updateTask(id, { completed: !task.completed });
  showToast(task.completed ? 'המשימה סומנה כפתוחה' : 'כל הכבוד! המשימה הושלמה 🎉');
};

window.confirmDelete = function(id) {
  if (confirm('למחוק את המשימה?')) {
    deleteTask(id);
    showToast('המשימה נמחקה');
  }
};

function updateCustomCategoryChip() {
  const customCats = tasks
    .map(t => t.category)
    .filter(c => !['לימודים', 'אישי', 'עבודה'].includes(c));
  const chip = document.getElementById('custom-category-chip');
  if (customCats.length > 0) {
    const first = customCats[0];
    chip.style.display = 'inline-flex';
    chip.textContent = `🏷️ ${first}`;
    chip.setAttribute('data-filter', first);
    chip.setAttribute('onclick', `setFilter('${first}', this)`);
  }
}

// ===== Notifications =====
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function scheduleAllReminders() {
  Object.values(scheduledReminders).forEach(clearTimeout);
  scheduledReminders = {};
  tasks.forEach(task => {
    if (task.reminder && !task.completed) {
      const reminderTime = new Date(task.reminder).getTime();
      const delay = reminderTime - Date.now();
      if (delay > 0 && delay < 7 * 24 * 60 * 60 * 1000) {
        scheduledReminders[task.id] = setTimeout(() => {
          if (Notification.permission === 'granted') {
            new Notification('תזכורת: ' + task.title, {
              body: task.dueDate ? `תאריך יעד: ${formatDate(task.dueDate)}` : '',
            });
          }
        }, delay);
      }
    }
  });
}

// ===== Toast =====
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
window.showToast = showToast;

// ===== Helpers =====
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
