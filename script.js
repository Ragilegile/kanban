'use strict';

/* =====================================================================
   ALUR — Kanban Board · script.js
   Vanilla JavaScript, tanpa framework & tanpa library.

   Daftar isi:
   1.  Konstanta & state global
   2.  Ikon SVG & utilitas kecil
   3.  Penyimpanan LocalStorage
   4.  Rendering papan
   5.  Modal buat/edit task (CRUD)
   6.  Drag & drop (mouse + sentuh, berbasis Pointer Events)
   7.  Toast notification (+ fitur "Urungkan")
   8.  Pencarian realtime
   9.  Dark mode
   10. Inisialisasi aplikasi
===================================================================== */

/* ---------- 1. KONSTANTA & STATE GLOBAL ---------- */
const COLUMNS = [
  { id: 'backlog',  name: 'Backlog' },
  { id: 'todo',     name: 'To Do' },
  { id: 'progress', name: 'In Progress' },
  { id: 'done',     name: 'Done' },
];

const PRIORITIES = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' };

const STORAGE_KEY = 'alur.tasks';   // kunci LocalStorage untuk data task
const THEME_KEY   = 'alur.theme';   // kunci LocalStorage untuk tema

let tasks = [];           // seluruh task; urutan dalam array = urutan kartu di kolomnya
let searchQuery = '';     // kata kunci pencarian aktif ('' = tidak sedang mencari)
let editingId = null;     // id task yang diedit di modal (null = sedang membuat baru)
let lastDeleted = null;   // { task, index } — untuk tombol "Urungkan" setelah hapus
let prevCounts = {};      // jumlah task per kolom pada render sebelumnya (animasi counter)
let drag = null;          // data drag & drop yang sedang berjalan
let justDragged = false;  // mencegah modal terbuka karena "click" sisa setelah drag

/* referensi elemen DOM yang dipakai berulang */
const boardEl        = document.getElementById('board');
const searchInput    = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const themeToggle    = document.getElementById('themeToggle');
const newTaskBtn     = document.getElementById('newTaskBtn');
const modalOverlay   = document.getElementById('modalOverlay');
const modalTitle     = document.getElementById('modalTitle');
const modalCloseBtn  = document.getElementById('modalClose');
const taskForm       = document.getElementById('taskForm');
const inputTitle     = document.getElementById('taskTitle');
const inputDesc      = document.getElementById('taskDesc');
const priorityGroup  = document.getElementById('priorityGroup');
const columnGroup    = document.getElementById('columnGroup');
const deleteInModal  = document.getElementById('deleteInModal');
const cancelBtn      = document.getElementById('cancelBtn');
const toastWrap      = document.getElementById('toastWrap');

/* ---------- 2. IKON SVG & UTILITAS ---------- */
/* path SVG bergaya garis (stroke), dijahit menjadi elemen <svg> utuh */
const ICONS = {
  kanban: '<path d="M6 4v16"/><path d="M12 4v9"/><path d="M18 4v13"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>',
  x:      '<path d="M18 6 6 18M6 6l12 12"/>',
  plus:   '<path d="M12 5v14M5 12h14"/>',
  sun:    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:   '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  pencil: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"/>',
  trash:  '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>',
  clock:  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:  '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.3 2.3 4.7-5.6"/>',
  move:   '<path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/>',
  inbox:  '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/>',
  grip:   '<circle cx="9" cy="5" r="1.7" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1.7" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1.7" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1.7" fill="currentColor" stroke="none"/>',
};

function icon(name, extraClass = '') {
  return `<svg class="ic ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

/* id unik sederhana untuk task baru */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* amankan teks user sebelum dimasukkan ke innerHTML */
function escapeHTML(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, (c) => map[c]);
}

/* sorot kata kunci pencarian pada teks (teks di-escape dulu, lalu dibungkus <mark>) */
function highlight(text) {
  const safe = escapeHTML(text);
  if (!searchQuery) return safe;
  const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // query aman untuk regex
  const re = new RegExp(escaped, 'gi');
  return safe.replace(re, (m) => `<mark>${m}</mark>`);
}

/* waktu relatif singkat: "baru saja", "5 mnt lalu", "3 jam lalu", … */
function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'baru saja';
  const mnt = Math.floor(diff / 60);
  if (mnt < 60) return mnt + ' mnt lalu';
  const jam = Math.floor(mnt / 60);
  if (jam < 24) return jam + ' jam lalu';
  const hr = Math.floor(jam / 24);
  if (hr < 7) return hr + ' hr lalu';
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function matchesSearch(task) {
  if (!searchQuery) return true;
  const hay = (task.title + ' ' + task.desc).toLowerCase();
  return hay.includes(searchQuery.toLowerCase());
}

function shortTitle(t) {
  return t.length > 24 ? t.slice(0, 24) + '…' : t;
}

function columnName(id) {
  const col = COLUMNS.find((c) => c.id === id);
  return col ? col.name : id;
}

/* ---------- 3. PENYIMPANAN (LocalStorage) ---------- */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    /* data korup / localStorage diblokir → pakai data contoh */
  }
  return seedTasks();
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) { /* abaikan bila storage penuh */ }
}

/* data contoh saat pertama kali dibuka, supaya papan tidak kosong melompong */
function seedTasks() {
  const now = Date.now();
  return [
    { id: uid(), title: 'Riset kompetitor & benchmark', desc: 'Kumpulkan referensi fitur dari 3 produk sejenis, lalu rangkum kelebihan dan kekurangannya.', priority: 'medium', column: 'backlog', createdAt: now - 2 * 864e5 },
    { id: uid(), title: 'Desain ulang halaman landing', desc: 'Eksplorasi hero section baru; prioritas ke kecepatan muat halaman.', priority: 'high', column: 'backlog', createdAt: now - 1 * 864e5 },
    { id: uid(), title: 'Setup repo & struktur folder', desc: 'Siapkan README, .editorconfig, dan konvensi penamaan berkas.', priority: 'low', column: 'todo', createdAt: now - 3 * 864e5 },
    { id: uid(), title: 'Integrasi API pembayaran', desc: 'Sandbox sudah aktif, tinggal menghubungkan endpoint invoice dan webhook.', priority: 'high', column: 'todo', createdAt: now - 30 * 36e5 },
    { id: uid(), title: 'Membangun komponen modal', desc: 'Modal dipakai untuk membuat & mengedit task; harus bisa ditutup dengan tombol Esc.', priority: 'medium', column: 'progress', createdAt: now - 5 * 36e5 },
    { id: uid(), title: 'Wireframe dashboard', desc: 'Sketsa low-fi untuk 2 alternatif layout.', priority: 'low', column: 'done', createdAt: now - 6 * 864e5 },
  ];
}

/* ---------- 4. RENDERING PAPAN ---------- */
function render() {
  const counts = {};
  boardEl.innerHTML = '';
  COLUMNS.forEach((col) => {
    boardEl.appendChild(renderColumn(col));
    counts[col.id] = tasks.filter((t) => t.column === col.id).length;
  });
  prevCounts = counts;
}

function renderColumn(col) {
  const all     = tasks.filter((t) => t.column === col.id);
  const visible = all.filter(matchesSearch);
  /* counter "membump" hanya jika jumlahnya berubah dari render sebelumnya */
  const bump = prevCounts[col.id] !== undefined && prevCounts[col.id] !== all.length;
  const countText = searchQuery ? `${visible.length}/${all.length}` : all.length;

  const section = document.createElement('section');
  section.className = 'column';
  section.dataset.column = col.id;
  section.innerHTML = `
    <header class="column-head">
      <span class="dot dot-${col.id}"></span>
      <h2>${col.name}</h2>
      <span class="count${bump ? ' bump' : ''}">${countText}</span>
      <button class="icon-btn icon-sm" data-action="new" data-column="${col.id}"
              title="Tambah task" aria-label="Tambah task di ${col.name}">${icon('plus', 'ic-sm')}</button>
    </header>
    <div class="card-list" data-column="${col.id}"></div>
    <button class="add-task-btn" data-action="new" data-column="${col.id}">${icon('plus', 'ic-sm')} Tambah task</button>
  `;

  const list = section.querySelector('.card-list');
  if (visible.length === 0) list.appendChild(renderEmptyState());
  else visible.forEach((task) => list.appendChild(renderCard(task)));

  return section;
}

function renderCard(task) {
  const el = document.createElement('article');
  el.className = 'task-card';
  el.dataset.id = task.id;
  el.tabIndex = 0; // supaya bisa difokus & dibuka dengan Enter dari keyboard
  el.innerHTML = `
    <span class="card-handle" title="Seret untuk memindahkan">${icon('grip')}</span>
    <div class="card-body">
      <h3 class="card-title">${highlight(task.title)}</h3>
      ${task.desc ? `<p class="card-desc">${highlight(task.desc)}</p>` : ''}
      <div class="card-meta">
        <span class="badge badge-${task.priority}"><span class="b-dot"></span>${PRIORITIES[task.priority]}</span>
        <span class="card-date">${icon('clock', 'ic-xs')} ${timeAgo(task.createdAt)}</span>
      </div>
    </div>
    <div class="card-actions">
      <button class="icon-btn icon-sm" data-action="edit" title="Edit task" aria-label="Edit task">${icon('pencil', 'ic-sm')}</button>
      <button class="icon-btn icon-sm" data-action="delete" title="Hapus task" aria-label="Hapus task">${icon('trash', 'ic-sm')}</button>
    </div>
  `;
  return el;
}

function renderEmptyState() {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = searchQuery
    ? `${icon('search')}<p class="e-title">Tidak ada hasil</p><span class="e-sub">Coba kata kunci lain.</span>`
    : `${icon('inbox')}<p class="e-title">Belum ada task</p><span class="e-sub">Klik “Tambah task” untuk memulai.</span>`;
  return el;
}

/* Render ulang dengan teknik FLIP: posisi kartu SEBELUM render dicatat,
   lalu setelah render kartu dianimasikan "meluncur" dari posisi lama ke baru.
   Ini yang membuat drag & drop dan pemindahan kolom terasa halus. */
function renderWithFlip(startOverride = {}) {
  const before = new Map();
  boardEl.querySelectorAll('.task-card').forEach((el) =>
    before.set(el.dataset.id, el.getBoundingClientRect()));

  /* override: kartu yang baru dijatuhkan dianimasikan dari posisi dilepas */
  for (const key in startOverride) before.set(key, startOverride[key]);

  render();

  boardEl.querySelectorAll('.task-card').forEach((el) => {
    const oldRect = before.get(el.dataset.id);
    if (!oldRect) return;
    const rect = el.getBoundingClientRect();
    const dx = oldRect.left - rect.left;
    const dy = oldRect.top - rect.top;
    if (!dx && !dy) return;

    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    void el.offsetWidth; // paksa reflow agar posisi awal "terkunci"
    el.style.transition = 'transform .3s cubic-bezier(.22,.9,.32,1)';
    el.style.transform = '';
    el.addEventListener('transitionend', () => {
      el.style.transition = '';
      el.style.transform = '';
    }, { once: true });
  });
}

/* ---------- 5. MODAL & CRUD TASK ---------- */
function openModal({ mode, task = null, column = 'backlog' }) {
  editingId = mode === 'edit' && task ? task.id : null;

  modalTitle.textContent = editingId ? 'Edit Task' : 'Task Baru';
  deleteInModal.hidden = !editingId;

  inputTitle.value = task ? task.title : '';
  inputDesc.value  = task ? task.desc : '';
  setSegmented(priorityGroup, task ? task.priority : 'medium');
  setSegmented(columnGroup,   task ? task.column   : column);
  inputTitle.closest('.field').classList.remove('error');

  modalOverlay.classList.add('open');
  document.body.classList.add('no-scroll');
  inputTitle.focus();
}

function closeModal() {
  modalOverlay.classList.remove('open');
  document.body.classList.remove('no-scroll');
  editingId = null;
}

function setSegmented(group, value) {
  group.querySelectorAll('button').forEach((b) =>
    b.classList.toggle('active', b.dataset.value === value));
}
function getSegmented(group) {
  const active = group.querySelector('button.active');
  return active ? active.dataset.value : null;
}

/* simpan task (buat baru ATAU perbarui yang sudah ada) */
taskForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const title = inputTitle.value.trim();
  if (!title) {
    inputTitle.closest('.field').classList.add('error');
    inputTitle.focus();
    return; // judul wajib diisi
  }

  const data = {
    title,
    desc: inputDesc.value.trim(),
    priority: getSegmented(priorityGroup),
    column: getSegmented(columnGroup),
  };

  if (editingId) {
    /* ---- mode edit ---- */
    const task = tasks.find((t) => t.id === editingId);
    Object.assign(task, data);
    saveTasks();
    renderWithFlip(); // kartu "meluncur" bila kolomnya diganti lewat modal
    toast('Task berhasil diperbarui', 'success');
  } else {
    /* ---- mode buat baru ---- */
    const newTask = { id: uid(), createdAt: Date.now(), ...data };
    tasks.push(newTask);
    saveTasks();
    render();
    toast(`Task “${escapeHTML(shortTitle(title))}” ditambahkan`, 'success');
    /* animasi pop kecil pada kartu yang baru dibuat */
    const newCard = boardEl.querySelector(`.task-card[data-id="${newTask.id}"]`);
    if (newCard) {
      newCard.animate(
        [{ transform: 'scale(.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' }
      );
    }
  }
  closeModal();
});

/* error hilang begitu user mulai mengetik */
inputTitle.addEventListener('input', () =>
  inputTitle.closest('.field').classList.remove('error'));

/* hapus task + toast dengan tombol "Urungkan" */
function deleteTask(id) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return;

  lastDeleted = { task: tasks[index], index };
  tasks.splice(index, 1);
  saveTasks();
  closeModal();
  renderWithFlip();

  toast(`Task “${escapeHTML(shortTitle(lastDeleted.task.title))}” dihapus`, 'danger', {
    label: 'Urungkan',
    onClick: undoDelete,
  });
}

function undoDelete() {
  if (!lastDeleted) return;
  const { task, index } = lastDeleted;
  tasks.splice(Math.min(index, tasks.length), 0, task);
  lastDeleted = null;
  saveTasks();
  renderWithFlip();
  toast('Task dipulihkan', 'info');
}

deleteInModal.addEventListener('click', () => { if (editingId) deleteTask(editingId); });
modalCloseBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
newTaskBtn.addEventListener('click', () => openModal({ mode: 'create', column: 'backlog' }));

/* klik pada backdrop (area gelap di luar modal) menutup modal */
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

/* pilihan segmen (prioritas & kolom) */
[priorityGroup, columnGroup].forEach((group) => {
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) setSegmented(group, btn.dataset.value);
  });
});

/* satu listener "click" untuk seluruh papan (event delegation):
   tombol tambah/edit/hapus, dan klik area kartu untuk membuka edit */
boardEl.addEventListener('click', (e) => {
  if (justDragged) { justDragged = false; return; } // abaikan click sisa setelah drag

  const btn = e.target.closest('[data-action]');
  if (btn) {
    if (btn.dataset.action === 'new')    openModal({ mode: 'create', column: btn.dataset.column });
    if (btn.dataset.action === 'edit')   openModal({ mode: 'edit', task: tasks.find((t) => t.id === btn.closest('.task-card').dataset.id) });
    if (btn.dataset.action === 'delete') deleteTask(btn.closest('.task-card').dataset.id);
    return;
  }

  /* klik pada badan kartu (bukan tombol / grip) → buka mode edit */
  const card = e.target.closest('.task-card');
  if (card && !e.target.closest('.card-handle')) {
    const task = tasks.find((t) => t.id === card.dataset.id);
    if (task) openModal({ mode: 'edit', task });
  }
});

/* tekan Enter saat kartu difokus → buka edit (aksesibilitas keyboard) */
boardEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('task-card')) {
    const task = tasks.find((t) => t.id === e.target.dataset.id);
    if (task) openModal({ mode: 'edit', task });
  }
});

/* Esc menutup modal, "/" memfokuskan pencarian */
document.addEventListener('keydown', (e) => {
  const modalOpen = modalOverlay.classList.contains('open');
  if (e.key === 'Escape' && modalOpen) { closeModal(); return; }

  if (e.key === '/' && !modalOpen) {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      searchInput.focus();
    }
  }
});

/* ---------- 6. DRAG & DROP (Pointer Events: mouse + sentuh) ----------
   Cara kerjanya:
   a. pointerdown pada kartu → tunggu geser 6px agar klik biasa tetap bisa membuka edit.
   b. Kartu "diangkat" menjadi elemen fixed yang mengikuti pointer,
      sementara PLACEHOLDER (kotak putus-putus) menandai posisi jatuh.
   c. Setiap gerakan, document.elementFromPoint() mencari kolom di bawah pointer;
      placeholder dipindah ke situ secara langsung (jadi pratinjau live).
   d. Saat dilepas: data dipindah di array `tasks`, lalu render dengan animasi FLIP. */

boardEl.addEventListener('pointerdown', (e) => {
  if (drag) return;                                   // satu drag pada satu waktu
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  const fromHandle = e.target.closest('.card-handle') !== null;
  /* di layar sentuh, seret hanya lewat grip — agar jari di badan kartu
     tetap bisa menggulir halaman seperti biasa */
  if (e.pointerType !== 'mouse' && !fromHandle) return;
  /* jangan mulai drag dari tombol edit/hapus */
  if (e.target.closest('.card-actions')) return;

  const card = e.target.closest('.task-card');
  if (!card) return;

  const startX = e.clientX, startY = e.clientY;
  let active = false;
  justDragged = false;

  const onMove = (ev) => {
    if (!active) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      active = true;
      startDrag(ev, card);
    }
    moveDrag(ev);
  };
  const clean = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
  };
  const onUp = () => { clean(); if (active) endDrag(); };
  const onCancel = () => { clean(); if (active) cancelDrag(); };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
});

function startDrag(ev, card) {
  const rect = card.getBoundingClientRect();
  const list = card.closest('.card-list');

  const placeholder = document.createElement('div');
  placeholder.className = 'card-placeholder';
  placeholder.style.height = Math.round(rect.height) + 'px';

  drag = {
    card, placeholder,
    id: card.dataset.id,
    fromColumn: list.dataset.column,
    originX: ev.clientX,   // titik pointer saat kartu diangkat
    originY: ev.clientY,
    pointerX: ev.clientX,
    pointerY: ev.clientY,
    overList: null,        // kolom yang sedang dituju (null = di luar papan)
    scrollRaf: 0,
  };

  list.insertBefore(placeholder, card);
  list.classList.add('has-placeholder');

  /* angkat kartu: keluar dari alur halaman, jadi elemen melayang */
  card.classList.add('dragging');
  card.style.left  = rect.left + 'px';
  card.style.top   = rect.top + 'px';
  card.style.width = Math.round(rect.width) + 'px';
  document.body.classList.add('is-dragging');

  updateDropTarget(ev.clientX, ev.clientY);
  drag.scrollRaf = requestAnimationFrame(scrollLoop); // auto-scroll tepi layar/daftar
}

function moveDrag(ev) {
  if (!drag) return;
  ev.preventDefault(); // cegah seleksi teks saat menyeret
  drag.pointerX = ev.clientX;
  drag.pointerY = ev.clientY;
  const dx = ev.clientX - drag.originX;
  const dy = ev.clientY - drag.originY;
  drag.card.style.transform =
    `translate(${dx}px, ${dy}px) rotate(2.5deg) scale(1.03)`;
  updateDropTarget(ev.clientX, ev.clientY);
}

/* tentukan kolom & posisi sisipan berdasarkan titik pointer */
function updateDropTarget(x, y) {
  if (!drag) return;
  /* elementFromPoint melewati kartu yang sedang melayang (pointer-events: none) */
  const el = document.elementFromPoint(x, y);
  const columnEl = el ? el.closest('.column') : null;
  const list = columnEl ? columnEl.querySelector('.card-list') : null;

  boardEl.querySelectorAll('.column.drag-over').forEach((c) => c.classList.remove('drag-over'));
  if (columnEl) columnEl.classList.add('drag-over');

  if (list) {
    document.querySelectorAll('.card-list.has-placeholder')
      .forEach((l) => l.classList.remove('has-placeholder'));
    list.classList.add('has-placeholder');

    /* bandingkan posisi pointer dengan titik tengah tiap kartu
       untuk memutuskan placeholder disisip sebelum kartu mana */
    const cards = [...list.querySelectorAll('.task-card')].filter((c) => c !== drag.card);
    let next = null;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (y < r.top + r.height / 2) { next = c; break; }
    }
    if (next) list.insertBefore(drag.placeholder, next);
    else list.appendChild(drag.placeholder);

    drag.overList = list;
  } else {
    drag.overList = null;
  }
}

/* loop auto-scroll: menggulir jendela / daftar kartu saat pointer
   mendekati tepi, supaya drag tetap nyaman di area panjang */
function scrollLoop() {
  if (!drag) return;
  const y = drag.pointerY;
  const winEdge = 32;

  if (y < winEdge) window.scrollBy(0, -8);
  else if (y > window.innerHeight - winEdge) window.scrollBy(0, 8);

  const list = drag.overList;
  if (list) {
    const r = list.getBoundingClientRect();
    if (y >= r.top && y <= r.bottom) {
      if (y < r.top + 40) list.scrollTop -= 7;
      else if (y > r.bottom - 40) list.scrollTop += 7;
    }
  }
  updateDropTarget(drag.pointerX, drag.pointerY);
  drag.scrollRaf = requestAnimationFrame(scrollLoop);
}

function endDrag() {
  const { card, placeholder, id, overList, fromColumn } = drag;

  /* dilepas di luar papan → batalkan (kartu terbang kembali) */
  if (!overList) { cancelDrag(); return; }

  const flyRect = card.getBoundingClientRect(); // posisi kartu saat dilepas

  const toColumn = overList.dataset.column;
  let index = 0;
  for (const el of overList.children) {
    if (el === placeholder) break;
    if (el.classList.contains('task-card') && el !== card) index++;
  }

  const before = positionSignature(id);
  moveTask(id, toColumn, index);
  const changed = positionSignature(id) !== before;

  /* rapikan DOM drag */
  placeholder.remove();
  card.classList.remove('dragging');
  card.style.cssText = '';
  stopDragLoop();

  justDragged = true;
  setTimeout(() => { justDragged = false; }, 90);

  if (!changed) { render(); return; }

  saveTasks();
  renderWithFlip({ [id]: flyRect }); // kartu meluncur dari posisi jatuh ke slot final

  if (toColumn !== fromColumn) {
    toast(`Dipindahkan ke ${columnName(toColumn)}`, 'info');
    if (toColumn === 'done') {
      const cardEl = boardEl.querySelector(`.task-card[data-id="${id}"]`);
      if (cardEl) celebrate(cardEl); // perayaan kecil saat task selesai
    }
  } else {
    toast('Urutan task diperbarui', 'info');
  }
}

/* kartu dilepas di luar papan / drag dibatalkan → terbang kembali ke asal */
function cancelDrag() {
  if (!drag) return;
  const { card, placeholder } = drag;
  const flyRect = card.getBoundingClientRect();

  placeholder.remove();
  card.classList.remove('dragging');
  card.style.cssText = '';
  stopDragLoop();

  const finalRect = card.getBoundingClientRect();
  const dx = flyRect.left - finalRect.left;
  const dy = flyRect.top - finalRect.top;
  if (dx || dy) {
    card.style.transition = 'none';
    card.style.transform = `translate(${dx}px, ${dy}px)`;
    void card.offsetWidth; // reflow: kunci posisi awal animasi
    card.style.transition = 'transform .3s cubic-bezier(.22,.9,.32,1)';
    card.style.transform = '';
    card.addEventListener('transitionend', () => { card.style.cssText = ''; }, { once: true });
  }

  justDragged = true;
  setTimeout(() => { justDragged = false; }, 90);
}

function stopDragLoop() {
  if (drag && drag.scrollRaf) cancelAnimationFrame(drag.scrollRaf);
  document.body.classList.remove('is-dragging');
  boardEl.querySelectorAll('.column.drag-over')
    .forEach((c) => c.classList.remove('drag-over'));
  document.querySelectorAll('.card-list.has-placeholder')
    .forEach((l) => l.classList.remove('has-placeholder'));
  drag = null;
}

/* pindahkan task ke kolom & urutan baru di array `tasks`.
   Urutan kartu dalam satu kolom mengikuti urutan relatifnya di array. */
function moveTask(id, toColumn, toIndex) {
  const from = tasks.findIndex((t) => t.id === id);
  if (from === -1) return;
  const [task] = tasks.splice(from, 1);
  task.column = toColumn;

  const columnTasks = tasks.filter((t) => t.column === toColumn);
  const ref = columnTasks[toIndex]; // task yang akan berada SETELAH kartu ini
  if (ref) tasks.splice(tasks.indexOf(ref), 0, task);
  else tasks.push(task);
}

/* "tanda tangan" posisi (kolom + urutan) untuk mendeteksi ada/tidaknya perubahan */
function positionSignature(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return '';
  return task.column + ':' + tasks.filter((t) => t.column === task.column).indexOf(task);
}

/* jendela kehilangan fokus di tengah drag → batalkan agar tidak "nyangkut" */
window.addEventListener('blur', () => { if (drag) cancelDrag(); });
document.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });

/* percikan confetti kecil dari kartu yang baru masuk kolom Done */
function celebrate(cardEl) {
  const colors = ['#3f68c9', '#37a169', '#e0a13e', '#cc4657'];
  const rect = cardEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + 10;

  for (let i = 0; i < 16; i++) {
    const p = document.createElement('span');
    p.className = 'confetti';
    const size = 5 + Math.random() * 4;
    p.style.width = size + 'px';
    p.style.height = size * (Math.random() > .5 ? 1 : .45) + 'px';
    p.style.borderRadius = Math.random() > .5 ? '50%' : '1.5px';
    p.style.left = cx + (Math.random() - .5) * 40 + 'px';
    p.style.top = cy + 'px';
    p.style.background = colors[i % colors.length];
    document.body.appendChild(p);

    const x = (Math.random() - .5) * 180;
    const y = -(30 + Math.random() * 90);
    const rot = (Math.random() - .5) * 540;
    p.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`, opacity: 1, offset: .55 },
      { transform: `translate(${x * 1.25}px, ${y + 140}px) rotate(${rot * 1.6}deg)`, opacity: 0 },
    ], { duration: 650 + Math.random() * 300, easing: 'cubic-bezier(.2,.6,.4,1)' })
      .onfinish = () => p.remove();
  }
}

/* ---------- 7. TOAST NOTIFICATION ---------- */
function toast(message, type = 'success', action = null) {
  const iconName = { success: 'check', danger: 'trash', info: 'move' }[type] || 'check';

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="t-icon">${icon(iconName, 'ic-sm')}</span>
    <span class="t-msg">${message}</span>
    ${action ? `<button class="t-action">${action.label}</button>` : ''}
  `;
  toastWrap.appendChild(el);

  /* maksimal 3 toast agar tidak menumpuk */
  while (toastWrap.children.length > 3) toastWrap.firstChild.remove();

  let hiding = false;
  const dismiss = () => {
    if (hiding) return;
    hiding = true;
    clearTimeout(timer);
    el.classList.add('hide');
    setTimeout(() => el.remove(), 260);
  };
  /* toast dengan aksi (Urungkan) dibiarkan lebih lama */
  const timer = setTimeout(dismiss, action ? 5200 : 2800);

  if (action) {
    el.querySelector('.t-action').addEventListener('click', () => {
      action.onClick();
      dismiss();
    });
  }
}

/* ---------- 8. PENCARIAN REALTIME ---------- */
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim();
  clearSearchBtn.hidden = searchQuery === '';
  render(); // kartu difilter + kata kunci disorot dengan <mark>
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input'));
  searchInput.focus();
});

/* ---------- 9. DARK MODE ---------- */
function setTheme(mode, persist = true) {
  document.documentElement.dataset.theme = mode;
  if (persist) {
    try { localStorage.setItem(THEME_KEY, mode); } catch (err) {}
  }
}

themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(next);
});

/* ---------- 10. INISIALISASI ---------- */
(function init() {
  /* isi semua elemen bertanda data-icon di HTML dengan SVG */
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });

  /* tema seharusnya sudah diset oleh cuplikan kecil di <head>;
     baris ini hanya pengaman bila cuplikan itu gagal */
  if (!document.documentElement.dataset.theme) setTheme('light', false);

  tasks = loadTasks();
  if (!localStorage.getItem(STORAGE_KEY)) saveTasks(); // simpan data contoh pertama kali

  render();
  boardEl.classList.add('intro'); // animasi kolom masuk sekali di awal
  setTimeout(() => boardEl.classList.remove('intro'), 900);
})();
