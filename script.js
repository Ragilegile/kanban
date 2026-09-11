'use strict';

/* =====================================================================
   ALUR — Kanban Board multi-board · script.js
   Vanilla JavaScript, tanpa framework & tanpa library.

   Daftar isi:
   1.  Konstanta & state global
   2.  Ikon SVG & utilitas kecil
   3.  Penyimpanan LocalStorage (v2 + migrasi dari versi lama)
   4.  Toast notification (+ "Urungkan")
   5.  Menu popover & dialog konfirmasi
   6.  Sidebar: daftar board (buat, ganti nama, duplikat, bintangi, hapus)
   7.  Header board: judul, meta, filter, kelola label
   8.  Render papan: kolom & kartu (+ animasi FLIP)
   9.  Kolom: tambah, ganti nama, hapus, drag reorder
   10. Modal task: CRUD + label + jatuh tempo + checklist
   11. Drag & drop kartu (Pointer Events)
   12. Pencarian & filter
   13. Dark mode & inisialisasi
===================================================================== */

/* ---------- 1. KONSTANTA & STATE ---------- */
const DEFAULT_COLUMN_NAMES = ['Backlog', 'To Do', 'In Progress', 'Done'];
const COLUMN_DOTS  = ['#97a3b7', '#e0a13e', '#3f68c9', '#37a169', '#c15cb8', '#3aa6c9', '#e2735d', '#8e6bd8'];
const LABEL_PALETTE = ['#37a169', '#e0a13e', '#e2735d', '#cc4657', '#8e6bd8', '#3f68c9', '#3aa6c9', '#c15cb8'];

const STORAGE_KEY   = 'alur.app.v2';  // { boards, activeBoardId }
const OLD_TASKS_KEY = 'alur.tasks';   // data versi 1 (untuk migrasi)
const THEME_KEY     = 'alur.theme';

let state = { boards: [], activeBoardId: null };
let searchQuery = '';
let filter = { priority: [], labels: [], due: [] };
let taskCtx = null;   // { taskId, columnId } modal task yang terbuka
let draft = null;     // draf data task di modal (disimpan saat "Simpan")
let lastDeleted = null; // untuk tombol "Urungkan"
let prevCounts = {};    // counter per kolom render sebelumnya
let cardDrag = null, colDrag = null;
let justDragged = false;
let currentMenu = null;
let confirmResolve = null;

const $ = (id) => document.getElementById(id);
const boardEl = $('board'), boardList = $('boardList'), appMain = $('appMain');
const sidebar = $('sidebar'), sidebarBackdrop = $('sidebarBackdrop');
const boardTitle = $('boardTitle'), boardMeta = $('boardMeta'), starBoard = $('starBoard');
const searchInput = $('searchInput'), clearSearchBtn = $('clearSearch');
const filterBtn = $('filterBtn'), filterPanel = $('filterPanel'), filterBadge = $('filterBadge'),
      filterWrap = document.querySelector('.filter-wrap'), fpLabels = $('fpLabels'),
      clearFiltersBtn = $('clearFilters'), filterResult = $('filterResult');
const taskModal = $('taskModal'), taskForm = $('taskForm'), inputTitle = $('taskTitle'), inputDesc = $('taskDesc');
const priorityGroup = $('priorityGroup'), columnGroup = $('columnGroup'), labelPicker = $('labelPicker');
const dueInput = $('dueInput'), dueClear = $('dueClear');
const checklistWrap = $('checklistWrap'), checklistInput = $('checklistInput'),
      checklistBar = $('checklistBar'), checklistProgress = $('checklistProgress'), checklistCount = $('checklistCount');
const confirmModal = $('confirmModal'), confirmMsg = $('confirmMsg'), confirmInputWrap = $('confirmInputWrap'),
      confirmInput = $('confirmInput'), confirmNameRef = $('confirmNameRef'), confirmOk = $('confirmOk');
const labelModal = $('labelModal'), labelList = $('labelList');
const toastWrap = $('toastWrap');

/* ---------- 2. IKON SVG & UTILITAS ---------- */
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
  check:  '<path d="M20 6 9 17l-5-5"/>',
  move:   '<path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/>',
  inbox:  '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/>',
  grip:   '<circle cx="9" cy="5" r="1.7" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1.7" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1.7" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1.7" fill="currentColor" stroke="none"/>',
  gripH:  '<circle cx="6" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="6" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="15" r="1.5" fill="currentColor" stroke="none"/>',
  star:   '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/>',
  more:   '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  copy:   '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  cal:    '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  funnel: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  tag:    '<path d="M12 2H2v10l9.3 9.3a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8L12 2z"/><circle cx="7" cy="7" r="1.5"/>',
  menu:   '<path d="M4 6h16M4 12h16M4 18h16"/>',
};

function icon(name, extraClass = '') {
  return `<svg class="ic ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function escapeHTML(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, (c) => map[c]);
}
function shortTitle(t) { return t.length > 24 ? t.slice(0, 24) + '…' : t; }

/* sorot kata kunci pencarian (teks di-escape dulu, lalu dibungkus <mark>) */
function highlight(text) {
  const safe = escapeHTML(text);
  if (!searchQuery) return safe;
  const re = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return safe.replace(re, (m) => `<mark>${m}</mark>`);
}
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

/* utilitas tanggal (format ISO lokal: YYYY-MM-DD) */
function dToISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function todayISO() { return dToISO(new Date()); }
function isoIn(days) { const d = new Date(); d.setDate(d.getDate() + days); return dToISO(d); }

/* info jatuh tempo untuk badge di kartu */
function dueInfo(iso) {
  if (!iso) return null;
  const due = new Date(iso + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 864e5);
  const text = diff === 0 ? 'Hari ini' : due.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  if (diff < 0) return { text, cls: 'over', title: 'Terlambat' };
  if (diff <= 3) return { text, cls: 'soon', title: 'Segera jatuh tempo' };
  return { text, cls: '', title: 'Jatuh tempo' };
}

function activeBoard() { return state.boards.find((b) => b.id === state.activeBoardId) || null; }
function colById(b, id) { return b ? b.columns.find((c) => c.id === id) : null; }
function taskById(b, id) { return b ? b.tasks.find((t) => t.id === id) : null; }

/* ---------- 3. PENYIMPANAN ---------- */
function createBoardObject(name) {
  return {
    id: uid(), name, starred: false, createdAt: Date.now(),
    columns: DEFAULT_COLUMN_NAMES.map((n, i) => ({ id: uid(), name: n, dot: COLUMN_DOTS[i % COLUMN_DOTS.length] })),
    labels: [
      { id: uid(), name: 'Desain',   color: '#c15cb8' },
      { id: uid(), name: 'Frontend', color: '#3f68c9' },
      { id: uid(), name: 'Backend',  color: '#37a169' },
      { id: uid(), name: 'Riset',    color: '#3aa6c9' },
      { id: uid(), name: 'Urgent',   color: '#cc4657' },
    ],
    tasks: [],
  };
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.boards)) return data;
    }
  } catch (e) { /* data korup → lanjut ke seed */ }

  /* migrasi data versi lama (single board, key alur.tasks) */
  try {
    const rawOld = localStorage.getItem(OLD_TASKS_KEY);
    if (rawOld) {
      const old = JSON.parse(rawOld);
      if (Array.isArray(old) && old.length) {
        const b = createBoardObject('Board Pertamaku');
        const map = { backlog: 0, todo: 1, progress: 2, done: 3 };
        b.tasks = old.map((t) => ({
          id: t.id || uid(),
          title: t.title || 'Tanpa judul',
          desc: t.desc || '',
          priority: t.priority || 'medium',
          column: b.columns[map[t.column] ?? 0].id,
          createdAt: t.createdAt || Date.now(),
          due: null, labels: [], checklist: [],
        }));
        return { boards: [b], activeBoardId: b.id };
      }
    }
  } catch (e) {}

  return seedState();
}

/* data contoh saat pertama kali dibuka (2 board) */
function seedState() {
  const now = Date.now();
  const produk = createBoardObject('Produk Utama');
  produk.starred = true;
  const [backlog, todo, progress, done] = produk.columns.map((c) => c.id);
  const L = Object.fromEntries(produk.labels.map((l) => [l.name, l.id]));
  produk.tasks = [
    { id: uid(), title: 'Riset kompetitor & benchmark', desc: 'Kumpulkan referensi fitur dari 3 produk sejenis, lalu rangkum kelebihan dan kekurangannya.', priority: 'medium', column: backlog, labels: [L.Riset], due: null, checklist: [], createdAt: now - 2 * 864e5 },
    { id: uid(), title: 'Desain ulang halaman landing', desc: 'Eksplorasi hero section baru; prioritas ke kecepatan muat halaman.', priority: 'high', column: backlog, labels: [L.Desain], due: null, checklist: [], createdAt: now - 1 * 864e5 },
    { id: uid(), title: 'Setup repo & struktur folder', desc: 'Siapkan README, .editorconfig, dan konvensi penamaan berkas.', priority: 'low', column: todo, labels: [], due: null, checklist: [], createdAt: now - 3 * 864e5 },
    { id: uid(), title: 'Integrasi API pembayaran', desc: 'Sandbox sudah aktif, tinggal menghubungkan endpoint invoice dan webhook.', priority: 'high', column: todo, labels: [L.Backend], due: isoIn(2), checklist: [], createdAt: now - 30 * 36e5 },
    { id: uid(), title: 'Membangun komponen modal', desc: 'Modal untuk buat & edit task, lengkap dengan label dan checklist.', priority: 'medium', column: progress, labels: [L.Frontend], due: null, checklist: [
      { id: uid(), text: 'Kerangka & animasi masuk', done: true },
      { id: uid(), text: 'Tutup lewat Esc & backdrop', done: true },
      { id: uid(), text: 'Validasi judul wajib', done: false },
    ], createdAt: now - 5 * 36e5 },
    { id: uid(), title: 'Tulis dokumentasi API', desc: 'Endpoint, contoh request, dan tabel error code.', priority: 'low', column: progress, labels: [L.Backend], due: isoIn(-1), checklist: [], createdAt: now - 26 * 36e5 },
    { id: uid(), title: 'Wireframe dashboard', desc: 'Sketsa low-fi untuk 2 alternatif layout.', priority: 'low', column: done, labels: [L.Desain], due: null, checklist: [], createdAt: now - 6 * 864e5 },
    { id: uid(), title: 'Setup environment development', desc: '', priority: 'low', column: done, labels: [], due: null, checklist: [], createdAt: now - 7 * 864e5 },
  ];

  const pribadi = createBoardObject('Rumah & Pribadi');
  const [pB, pT, , pD] = pribadi.columns.map((c) => c.id);
  pribadi.tasks = [
    { id: uid(), title: 'Rapikan lemari arsip', desc: 'Pisahkan dokumen yang sudah tidak dipakai.', priority: 'low', column: pB, labels: [], due: null, checklist: [], createdAt: now - 4 * 864e5 },
    { id: uid(), title: 'Booking tiket pulang', desc: 'Cek promo akhir pekan.', priority: 'high', column: pT, labels: [], due: isoIn(5), checklist: [], createdAt: now - 2 * 36e5 },
    { id: uid(), title: 'Beli kado ulang tahun Ayah', desc: '', priority: 'medium', column: pD, labels: [], due: null, checklist: [], createdAt: now - 9 * 864e5 },
  ];

  return { boards: [produk, pribadi], activeBoardId: produk.id };
}

/* pastikan field lama/hasil migrasi selalu lengkap */
function normalizeBoard(b) {
  if (!Array.isArray(b.labels)) b.labels = [];
  if (!Array.isArray(b.columns)) b.columns = [];
  b.columns.forEach((c, i) => { if (!c.dot) c.dot = COLUMN_DOTS[i % COLUMN_DOTS.length]; });
  b.tasks.forEach((t) => {
    if (!Array.isArray(t.labels)) t.labels = [];
    if (!Array.isArray(t.checklist)) t.checklist = [];
    if (t.due === undefined) t.due = null;
    if (!colById(b, t.column)) t.column = b.columns[0] ? b.columns[0].id : null;
  });
}

/* ---------- 4. TOAST ---------- */
function toast(message, type = 'success', action = null) {
  const iconName = { success: 'check', danger: 'trash', info: 'move' }[type] || 'check';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="t-icon">${icon(iconName, 'ic-sm')}</span>
    <span class="t-msg">${message}</span>
    ${action ? `<button class="t-action">${action.label}</button>` : ''}`;
  toastWrap.appendChild(el);
  while (toastWrap.children.length > 3) toastWrap.firstChild.remove();

  let hiding = false;
  const dismiss = () => {
    if (hiding) return;
    hiding = true;
    clearTimeout(timer);
    el.classList.add('hide');
    setTimeout(() => el.remove(), 260);
  };
  const timer = setTimeout(dismiss, action ? 5200 : 2800);
  if (action) el.querySelector('.t-action').addEventListener('click', () => { action.onClick(); dismiss(); });
}

/* ---------- 5. MENU POPOVER & DIALOG KONFIRMASI ---------- */
function openMenu(anchor, items) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'menu';
  items.forEach((it) => {
    if (it === '-') {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      menu.appendChild(sep);
      return;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-item' + (it.danger ? ' danger' : '');
    b.innerHTML = `${icon(it.icon, 'ic-sm')}<span>${escapeHTML(it.label)}</span>`;
    b.addEventListener('click', () => { closeMenu(); it.onClick(); });
    menu.appendChild(b);
  });
  document.body.appendChild(menu);

  const r = anchor.getBoundingClientRect();
  let top = r.bottom + 6;
  const left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 10);
  if (top + menu.offsetHeight > window.innerHeight - 10) top = Math.max(10, r.top - menu.offsetHeight - 6);
  menu.style.top = top + 'px';
  menu.style.left = left + 'px';

  currentMenu = menu;
  setTimeout(() => document.addEventListener('pointerdown', onMenuOutside, true), 0);
}
function onMenuOutside(e) {
  if (currentMenu && !currentMenu.contains(e.target)) closeMenu();
}
function closeMenu() {
  if (!currentMenu) return;
  currentMenu.remove();
  currentMenu = null;
  document.removeEventListener('pointerdown', onMenuOutside, true);
}

/* dialog konfirmasi; requireName = wajib mengetik nama (ala Notion) untuk aksi berbahaya */
function confirmDialog({ title, message, requireName = null, okLabel = 'Hapus' }) {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    $('confirmTitle').textContent = title;
    confirmMsg.innerHTML = message;
    confirmInputWrap.hidden = !requireName;
    if (requireName) {
      confirmNameRef.textContent = requireName;
      confirmInput.value = '';
      confirmInput.placeholder = requireName;
    }
    confirmOk.textContent = okLabel;
    confirmOk.disabled = !!requireName;
    confirmModal.classList.add('open');
    document.body.classList.add('no-scroll');
    setTimeout(() => (requireName ? confirmInput : confirmOk).focus(), 60);
  });
}
function settleConfirm(result) {
  confirmModal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}
 $('confirmOk').addEventListener('click', () => settleConfirm(true));
 $('confirmCancel').addEventListener('click', () => settleConfirm(false));
confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) settleConfirm(false); });
confirmInput.addEventListener('input', () => {
  confirmOk.disabled = confirmInput.value.trim().toLowerCase() !== confirmNameRef.textContent.toLowerCase();
});

/* input inline generik: ganti elemen menjadi input, Enter=OK, Esc=batal */
function beginEdit(el, value, onDone, placeholder = '') {
  const input = document.createElement('input');
  input.className = 'inline-edit';
  input.value = value;
  input.placeholder = placeholder;
  input.maxLength = 60;
  el.hidden = true;
  el.after(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = (ok) => {
    if (finished) return;
    finished = true;
    const val = input.value.trim();
    input.remove();
    el.hidden = false;
    onDone(ok && val ? val : null);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

/* ---------- 6. SIDEBAR: DAFTAR BOARD ---------- */
function renderSidebar() {
  const starred = state.boards.filter((b) => b.starred);
  const rest = state.boards.filter((b) => !b.starred);
  const item = (b) => `
    <div class="board-item ${b.id === state.activeBoardId ? 'active' : ''}" data-board="${b.id}">
      <span class="bi-ic">${icon('kanban', 'ic-xs')}</span>
      <span class="bi-name">${escapeHTML(b.name)}</span>
      <span class="bi-count">${b.tasks.length}</span>
      <button class="bi-btn bi-star ${b.starred ? 'on' : ''}" data-bact="star" title="Bintangi board" aria-label="Bintangi board">${icon('star', 'ic-xs')}</button>
      <button class="bi-btn bi-menu" data-bact="menu" title="Opsi board" aria-label="Opsi board">${icon('more', 'ic-xs')}</button>
    </div>`;

  let html = '';
  if (starred.length) html += `<div class="bl-label">Favorit</div>` + starred.map(item).join('');
  html += `<div class="bl-label">${starred.length ? 'Board lain' : 'Semua board'}</div>`;
  html += rest.length ? rest.map(item).join('') : `<p class="bl-empty">Belum ada board lain.</p>`;
  boardList.innerHTML = html;
}

boardList.addEventListener('click', (e) => {
  const itemEl = e.target.closest('.board-item');
  if (!itemEl) return;
  const b = state.boards.find((x) => x.id === itemEl.dataset.board);
  if (!b) return;

  const btn = e.target.closest('.bi-btn');
  if (btn) {
    if (btn.dataset.bact === 'star') toggleStar(b.id);
    if (btn.dataset.bact === 'menu') openBoardMenu(btn, b);
    return;
  }
  switchBoard(b.id);
});

function toggleStar(id) {
  const b = state.boards.find((x) => x.id === id);
  if (!b) return;
  b.starred = !b.starred;
  saveState();
  renderSidebar();
  renderBoardHeader();
}

function openBoardMenu(anchor, b) {
  openMenu(anchor, [
    { icon: 'star', label: b.starred ? 'Hapus dari favorit' : 'Tambahkan ke favorit', onClick: () => toggleStar(b.id) },
    { icon: 'pencil', label: 'Ganti nama board', onClick: () => {
        const nameEl = boardList.querySelector(`.board-item[data-board="${b.id}"] .bi-name`);
        if (nameEl) beginEdit(nameEl, b.name, (val) => {
          if (val) { b.name = val; saveState(); renderSidebar(); if (b.id === state.activeBoardId) renderBoardHeader(); }
        });
      } },
    { icon: 'copy', label: 'Duplikat board', onClick: () => duplicateBoard(b.id) },
    '-',
    { icon: 'trash', label: 'Hapus board', danger: true, onClick: () => deleteBoard(b.id) },
  ]);
}

function createBoard(name) {
  const b = createBoardObject(name);
  state.boards.push(b);
  state.activeBoardId = b.id;
  saveState();
  renderAll();
  toast(`Board “${escapeHTML(shortTitle(name))}” dibuat`, 'success');
}

function switchBoard(id) {
  state.activeBoardId = id;
  searchQuery = ''; searchInput.value = ''; clearSearchBtn.hidden = true;
  filter = { priority: [], labels: [], due: [] };
  saveState();
  renderAll();
  closeSidebar();
}

function duplicateBoard(id) {
  const src = state.boards.find((b) => b.id === id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = src.name + ' (salinan)';
  copy.starred = false;
  copy.createdAt = Date.now();
  state.boards.splice(state.boards.indexOf(src) + 1, 0, copy);
  state.activeBoardId = copy.id;
  saveState();
  renderAll();
  toast('Board diduplikat', 'success');
}

async function deleteBoard(id) {
  const b = state.boards.find((x) => x.id === id);
  if (!b) return;
  const ok = await confirmDialog({
    title: 'Hapus board?',
    message: `Board <b>“${escapeHTML(b.name)}”</b> beserta <b>${b.tasks.length}</b> task dan <b>${b.columns.length}</b> kolom akan dihapus permanen. Tindakan ini tidak bisa diurungkan.`,
    requireName: b.name,
  });
  if (!ok) return;
  state.boards = state.boards.filter((x) => x.id !== id);
  if (state.activeBoardId === id) state.activeBoardId = state.boards[0] ? state.boards[0].id : null;
  saveState();
  renderAll();
  toast('Board dihapus', 'danger');
}

/* form "Board Baru" di sidebar */
 $('createBoardBtn').addEventListener('click', () => {
  $('createBoardForm').hidden = false;
  $('newBoardInput').focus();
});
 $('newBoardInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = e.target.value.trim();
    if (!val) return;
    e.target.value = '';
    $('createBoardForm').hidden = true;
    createBoard(val);
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    e.target.value = '';
    $('createBoardForm').hidden = true;
  }
});

/* drawer sidebar (layar kecil) */
function openSidebar() { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show'); }
 $('sidebarToggle').addEventListener('click', openSidebar);
 $('sidebarClose').addEventListener('click', closeSidebar);
sidebarBackdrop.addEventListener('click', closeSidebar);

/* ---------- 7. HEADER BOARD ---------- */
function renderBoardHeader() {
  const b = activeBoard();
  appMain.classList.toggle('no-board', !b);
  if (!b) {
    boardTitle.textContent = 'Alur';
    boardMeta.textContent = '';
    updateFilterUI();
    return;
  }
  boardTitle.textContent = b.name;
  boardMeta.textContent = `${b.tasks.length} task · ${b.columns.length} kolom`;
  starBoard.classList.toggle('starred', b.starred);
  starBoard.title = b.starred ? 'Hapus dari favorit' : 'Tambahkan ke favorit';
  updateFilterUI();
}

/* klik judul board → edit inline (ala Notion) */
boardTitle.addEventListener('click', () => {
  const b = activeBoard();
  if (!b) return;
  beginEdit(boardTitle, b.name, (val) => {
    if (val) { b.name = val; saveState(); renderSidebar(); }
    renderBoardHeader();
  }, 'Nama board…');
});
starBoard.addEventListener('click', () => toggleStar(state.activeBoardId));

/* panel filter: tombol label dirender sesuai board aktif */
function renderFilterChips() {
  const b = activeBoard();
  fpLabels.innerHTML = b && b.labels.length
    ? b.labels.map((l) =>
        `<button type="button" data-fp="labels" data-val="${l.id}" style="--lc:${l.color}">
           <span class="lc-dot"></span>${escapeHTML(l.name)}
         </button>`).join('')
    : '<span class="fp-none">Belum ada label</span>';
}

function activeFilterCount() {
  return filter.priority.length + filter.labels.length + filter.due.length;
}
function updateFilterUI() {
  const count = activeFilterCount();
  filterBadge.textContent = count;
  filterBadge.hidden = !count;
  filterPanel.querySelectorAll('[data-fp]').forEach((chip) => {
    chip.classList.toggle('active', filter[chip.dataset.fp].includes(chip.dataset.val));
  });
  const b = activeBoard();
  const visible = b ? b.tasks.filter(taskVisible).length : 0;
  filterResult.textContent = b ? `${visible} dari ${b.tasks.length} task` : '';
}

filterBtn.addEventListener('click', () => { filterPanel.hidden = !filterPanel.hidden; });
document.addEventListener('pointerdown', (e) => {
  if (!filterPanel.hidden && !filterWrap.contains(e.target)) filterPanel.hidden = true;
});
filterPanel.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-fp]');
  if (chip) {
    const arr = filter[chip.dataset.fp];
    const i = arr.indexOf(chip.dataset.val);
    if (i === -1) arr.push(chip.dataset.val); else arr.splice(i, 1);
    renderBoard();
    return;
  }
  if (e.target.closest('#clearFilters')) {
    filter = { priority: [], labels: [], due: [] };
    renderBoard();
  }
});

/* modal kelola label */
 $('labelBtn').addEventListener('click', () => {
  if (!activeBoard()) return;
  renderLabelList();
  labelModal.classList.add('open');
  document.body.classList.add('no-scroll');
});
function closeLabelModal() {
  labelModal.classList.remove('open');
  document.body.classList.remove('no-scroll');
}
 $('labelModalClose').addEventListener('click', closeLabelModal);
 $('labelDone').addEventListener('click', closeLabelModal);
labelModal.addEventListener('click', (e) => { if (e.target === labelModal) closeLabelModal(); });

function renderLabelList() {
  const b = activeBoard();
  labelList.innerHTML = b.labels.length
    ? b.labels.map((l) => `
        <div class="label-row" data-label="${l.id}">
          <button class="lr-dot" style="background:${l.color}" title="Ganti warna" aria-label="Ganti warna"></button>
          <input class="lr-name" value="${escapeHTML(l.name)}" maxlength="24" />
          <button class="lr-del" title="Hapus label" aria-label="Hapus label">${icon('trash', 'ic-sm')}</button>
        </div>`).join('')
    : '<p class="label-empty">Belum ada label di board ini.</p>';
}
 $('addLabelBtn').addEventListener('click', () => {
  const b = activeBoard();
  b.labels.push({ id: uid(), name: 'Label baru', color: LABEL_PALETTE[b.labels.length % LABEL_PALETTE.length] });
  saveState(); renderLabelList(); renderFilterChips(); renderBoard();
});
labelList.addEventListener('click', (e) => {
  const row = e.target.closest('.label-row');
  if (!row) return;
  const b = activeBoard();
  const l = b.labels.find((x) => x.id === row.dataset.label);
  if (!l) return;

  if (e.target.closest('.lr-dot')) {
    /* klik bulatan → putar ke warna berikutnya di palet */
    l.color = LABEL_PALETTE[(LABEL_PALETTE.indexOf(l.color) + 1) % LABEL_PALETTE.length];
    saveState(); renderLabelList(); renderFilterChips(); renderBoard();
  } else if (e.target.closest('.lr-del')) {
    b.labels = b.labels.filter((x) => x.id !== l.id);
    b.tasks.forEach((t) => (t.labels = t.labels.filter((id) => id !== l.id)));
    filter.labels = filter.labels.filter((id) => id !== l.id);
    saveState(); renderLabelList(); renderFilterChips(); renderBoard();
    toast('Label dihapus', 'danger');
  }
});
labelList.addEventListener('change', (e) => {
  if (!e.target.classList.contains('lr-name')) return;
  const row = e.target.closest('.label-row');
  const b = activeBoard();
  const l = b.labels.find((x) => x.id === row.dataset.label);
  if (l) {
    l.name = e.target.value.trim() || 'Tanpa nama';
    saveState(); renderFilterChips(); renderBoard();
  }
});

/* ---------- 8. RENDER PAPAN ---------- */
function renderAll() {
  renderSidebar();
  renderFilterChips();
  renderBoardHeader();
  renderBoard();
}

function renderBoard() {
  const b = activeBoard();
  if (!b) {
    boardEl.innerHTML = `
      <div class="board-empty">
        <div class="be-ic">${icon('kanban')}</div>
        <h2>Belum ada board</h2>
        <p>Buat board pertamamu untuk mulai mengatur task, kolom, dan label.</p>
        <button class="btn-primary" data-action="create-first-board">${icon('plus')} Buat Board</button>
      </div>`;
    return;
  }

  boardEl.innerHTML = '';
  const counts = {};
  b.columns.forEach((col) => {
    boardEl.appendChild(renderColumn(b, col));
    counts[col.id] = b.tasks.filter((t) => t.column === col.id).length;
  });

  /* tombol "tambah kolom" di ujung papan */
  const addBtn = document.createElement('button');
  addBtn.className = 'add-column-btn';
  addBtn.dataset.action = 'add-col';
  addBtn.innerHTML = `${icon('plus', 'ic-sm')} Tambah kolom`;
  boardEl.appendChild(addBtn);

  prevCounts = counts;
  updateFilterUI();
}

function isFiltering() {
  return !!(searchQuery || filter.priority.length || filter.labels.length || filter.due.length);
}

function renderColumn(b, col) {
  const all = b.tasks.filter((t) => t.column === col.id);
  const visible = all.filter(taskVisible);
  const bump = prevCounts[col.id] !== undefined && prevCounts[col.id] !== all.length;
  const countText = isFiltering() ? `${visible.length}/${all.length}` : all.length;

  const section = document.createElement('section');
  section.className = 'column';
  section.dataset.col = col.id;
  section.innerHTML = `
    <header class="column-head">
      <span class="col-grip" title="Seret untuk mengatur urutan kolom">${icon('gripH', 'ic-xs')}</span>
      <span class="dot" style="background:${col.dot}"></span>
      <h2 class="col-name" title="Klik dua kali untuk ganti nama">${escapeHTML(col.name)}</h2>
      <span class="count${bump ? ' bump' : ''}">${countText}</span>
      <button class="icon-btn icon-xs" data-action="col-menu" title="Opsi kolom" aria-label="Opsi kolom">${icon('more', 'ic-xs')}</button>
      <button class="icon-btn icon-xs" data-action="new" data-column="${col.id}" title="Tambah task" aria-label="Tambah task">${icon('plus', 'ic-xs')}</button>
    </header>
    <div class="card-list" data-col="${col.id}"></div>
    <button class="add-task-btn" data-action="new" data-column="${col.id}">${icon('plus', 'ic-xs')} Tambah task</button>`;

  const list = section.querySelector('.card-list');
  if (visible.length === 0) list.appendChild(renderEmptyState());
  else visible.forEach((task) => list.appendChild(renderCard(b, task)));
  return section;
}

function renderEmptyState() {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = isFiltering()
    ? `${icon('search')}<p class="e-title">Tidak ada hasil</p><span class="e-sub">Coba ubah pencarian atau filter.</span>`
    : `${icon('inbox')}<p class="e-title">Belum ada task</p><span class="e-sub">Klik “Tambah task” untuk memulai.</span>`;
  return el;
}

function renderCard(b, task) {
  const el = document.createElement('article');
  el.className = 'task-card';
  el.dataset.id = task.id;
  el.tabIndex = 0;

  /* label kartu */
  const labels = (task.labels || []).map((id) => b.labels.find((l) => l.id === id)).filter(Boolean);
  const labelsHTML = labels.length
    ? `<div class="card-labels">${labels.map((l) =>
        `<span class="cl-chip" style="--lc:${l.color}"><span class="lc-dot"></span>${escapeHTML(l.name)}</span>`).join('')}</div>`
    : '';

  /* checklist */
  const cl = task.checklist || [];
  const clDone = cl.filter((i) => i.done).length;
  const clHTML = cl.length
    ? `<span class="card-check" title="Progress checklist">${icon('check', 'ic-xs')} ${clDone}/${cl.length}</span>` +
      `<div class="card-progress${clDone === cl.length ? ' full' : ''}"><div style="width:${(clDone / cl.length) * 100}%"></div></div>`
    : '';

  /* jatuh tempo */
  const due = dueInfo(task.due);
  const dueHTML = due
    ? `<span class="card-due ${due.cls}" title="${due.title}">${icon('cal', 'ic-xs')} ${due.text}</span>`
    : '';

  el.innerHTML = `
    <span class="card-handle" title="Seret untuk memindahkan">${icon('grip')}</span>
    <div class="card-body">
      ${labelsHTML}
      <h3 class="card-title">${highlight(task.title)}</h3>
      ${task.desc ? `<p class="card-desc">${highlight(task.desc)}</p>` : ''}
      <div class="card-meta">
        <span class="badge badge-${task.priority}"><span class="b-dot"></span>${{ low: 'Rendah', medium: 'Sedang', high: 'Tinggi' }[task.priority] || 'Sedang'}</span>
        ${clHTML ? `<span style="display:inline-flex;align-items:center">${clHTML.split('<div')[0]}</span>` : ''}
        ${dueHTML}
      </div>
      ${clHTML.includes('<div') ? `<div class="card-progress${clDone === cl.length ? ' full' : ''}"><div style="width:${(clDone / cl.length) * 100}%"></div></div>` : ''}
    </div>
    <div class="card-actions">
      <button class="icon-btn icon-sm" data-action="edit" title="Edit task" aria-label="Edit task">${icon('pencil', 'ic-sm')}</button>
      <button class="icon-btn icon-sm" data-action="dup" title="Duplikat task" aria-label="Duplikat task">${icon('copy', 'ic-sm')}</button>
      <button class="icon-btn icon-sm" data-action="delete" title="Hapus task" aria-label="Hapus task">${icon('trash', 'ic-sm')}</button>
    </div>`;
  return el;
}

/* render ulang dengan teknik FLIP agar elemen "meluncur" ke posisi barunya.
   opts.columns: animasi tingkat kolom (reorder kolom)
   opts.cardStart / opts.colStart: posisi awal khusus (mis. posisi kartu saat dilepas) */
function renderBoardWithFlip(opts = {}) {
  const b = activeBoard();
  if (!b) { renderBoard(); return; }

  if (opts.columns) {
    const before = new Map();
    boardEl.querySelectorAll('.column').forEach((el) => before.set(el.dataset.col, el.getBoundingClientRect()));
    for (const k in (opts.colStart || {})) before.set(k, opts.colStart[k]);
    renderBoard();
    boardEl.querySelectorAll('.column').forEach((el) => {
      const old = before.get(el.dataset.col);
      if (!old) return;
      const now = el.getBoundingClientRect();
      const dx = old.left - now.left, dy = old.top - now.top;
      if (!dx && !dy) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth;
      el.style.transition = 'transform .32s cubic-bezier(.22,.9,.32,1)';
      el.style.transform = '';
      el.addEventListener('transitionend', () => { el.style.transition = ''; el.style.transform = ''; }, { once: true });
    });
    return;
  }

  const before = new Map();
  boardEl.querySelectorAll('.task-card').forEach((el) => before.set(el.dataset.id, el.getBoundingClientRect()));
  for (const k in (opts.cardStart || {})) before.set(k, opts.cardStart[k]);
  renderBoard();
  boardEl.querySelectorAll('.task-card').forEach((el) => {
    const old = before.get(el.dataset.id);
    if (!old) return;
    const now = el.getBoundingClientRect();
    const dx = old.left - now.left, dy = old.top - now.top;
    if (!dx && !dy) return;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    void el.offsetWidth;
    el.style.transition = 'transform .3s cubic-bezier(.22,.9,.32,1)';
    el.style.transform = '';
    el.addEventListener('transitionend', () => { el.style.transition = ''; el.style.transform = ''; }, { once: true });
  });
}

/* satu listener click untuk seluruh papan (event delegation) */
boardEl.addEventListener('click', (e) => {
  if (justDragged) { justDragged = false; return; }

  const btn = e.target.closest('[data-action]');
  if (btn) {
    const act = btn.dataset.action;
    if (act === 'new') openTaskModal({ mode: 'create', columnId: btn.dataset.column });
    if (act === 'edit') openTaskModal({ mode: 'edit', task: taskById(activeBoard(), btn.closest('.task-card').dataset.id) });
    if (act === 'delete') deleteTask(btn.closest('.task-card').dataset.id);
    if (act === 'dup') duplicateTask(btn.closest('.task-card').dataset.id);
    if (act === 'col-menu') openColumnMenu(btn);
    if (act === 'add-col') {
      beginEdit(btn, '', (val) => { if (val) addColumn(val); else renderBoard(); }, 'Nama kolom…');
    }
    if (act === 'create-first-board') createBoard('Board Pertamaku');
    return;
  }

  /* klik badan kartu (bukan tombol/grip) → buka edit */
  const card = e.target.closest('.task-card');
  if (card && !e.target.closest('.card-handle')) {
    const t = taskById(activeBoard(), card.dataset.id);
    if (t) openTaskModal({ mode: 'edit', task: t });
  }
});
boardEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('task-card')) {
    const t = taskById(activeBoard(), e.target.dataset.id);
    if (t) openTaskModal({ mode: 'edit', task: t });
  }
});
/* klik dua kali nama kolom → ganti nama */
boardEl.addEventListener('dblclick', (e) => {
  const name = e.target.closest('.col-name');
  if (name) renameColumnInline(name);
});

/* ---------- 9. KOLOM ---------- */
function addColumn(name) {
  const b = activeBoard();
  if (!b) return;
  b.columns.push({ id: uid(), name, dot: COLUMN_DOTS[b.columns.length % COLUMN_DOTS.length] });
  saveState(); renderBoard(); renderBoardHeader();
  toast(`Kolom “${escapeHTML(shortTitle(name))}” ditambahkan`, 'success');
}

function renameColumnInline(nameEl) {
  const b = activeBoard();
  const col = colById(b, nameEl.closest('.column').dataset.col);
  if (!col) return;
  beginEdit(nameEl, col.name, (val) => {
    if (val) { col.name = val; saveState(); }
    renderBoard();
  }, 'Nama kolom…');
}

async function deleteColumn(colId) {
  const b = activeBoard();
  const col = colById(b, colId);
  if (!col) return;
  const n = b.tasks.filter((t) => t.column === colId).length;
  const ok = await confirmDialog({
    title: 'Hapus kolom?',
    message: `Kolom <b>“${escapeHTML(col.name)}”</b> beserta <b>${n}</b> task di dalamnya akan dihapus permanen.`,
  });
  if (!ok) return;
  b.columns = b.columns.filter((c) => c.id !== colId);
  b.tasks = b.tasks.filter((t) => t.column !== colId);
  saveState(); renderBoard(); renderBoardHeader(); renderSidebar();
  toast(`Kolom “${escapeHTML(col.name)}” dihapus`, 'danger');
}

function openColumnMenu(anchor) {
  const b = activeBoard();
  const col = colById(b, anchor.closest('.column').dataset.col);
  if (!col) return;
  openMenu(anchor, [
    { icon: 'plus', label: 'Tambah task', onClick: () => openTaskModal({ mode: 'create', columnId: col.id }) },
    { icon: 'pencil', label: 'Ganti nama kolom', onClick: () => renameColumnInline(anchor.closest('.column').querySelector('.col-name')) },
    '-',
    { icon: 'trash', label: 'Hapus kolom', danger: true, onClick: () => deleteColumn(col.id) },
  ]);
}

/* ---- drag reorder kolom (kepala kolom, mouse; grip, sentuh) ---- */
boardEl.addEventListener('pointerdown', (e) => {
  if (cardDrag || colDrag) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  const head = e.target.closest('.column-head');
  if (!head) return;
  if (e.target.closest('button')) return;            // jangan drag dari tombol
  const grip = e.target.closest('.col-grip');
  if (e.pointerType !== 'mouse' && !grip) return;    // sentuh: hanya lewat grip

  const column = head.closest('.column');
  if (!column || !column.dataset.col) return;

  const startX = e.clientX, startY = e.clientY;
  let active = false;

  const onMove = (ev) => {
    if (!active) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      active = true;
      startColDrag(ev, column);
    }
    moveColDrag(ev);
  };
  const clean = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
  };
  const onUp = () => { clean(); if (active) endColDrag(); };
  const onCancel = () => { clean(); if (active) cancelColDrag(); };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
});

function startColDrag(ev, column) {
  const rect = column.getBoundingClientRect();
  const placeholder = document.createElement('div');
  placeholder.className = 'col-placeholder';
  placeholder.style.width = Math.round(rect.width) + 'px';
  placeholder.style.height = Math.round(rect.height) + 'px';

  colDrag = {
    column, placeholder,
    id: column.dataset.col,
    originX: ev.clientX, originY: ev.clientY,
    pointerX: ev.clientX, pointerY: ev.clientY,
    overBoard: true,
    scrollRaf: 0,
  };

  boardEl.insertBefore(placeholder, column);
  column.classList.add('col-dragging');
  column.style.left = rect.left + 'px';
  column.style.top = rect.top + 'px';
  column.style.width = Math.round(rect.width) + 'px';
  column.style.height = Math.round(rect.height) + 'px';
  document.body.classList.add('is-dragging');

  updateColTarget(ev.clientX, ev.clientY);
  colDrag.scrollRaf = requestAnimationFrame(colScrollLoop);
}

function moveColDrag(ev) {
  if (!colDrag) return;
  ev.preventDefault();
  colDrag.pointerX = ev.clientX;
  colDrag.pointerY = ev.clientY;
  const dx = ev.clientX - colDrag.originX;
  const dy = ev.clientY - colDrag.originY;
  colDrag.column.style.transform = `translate(${dx}px, ${dy}px) rotate(1deg)`;
  updateColTarget(ev.clientX, ev.clientY);
}

function updateColTarget(x, y) {
  if (!colDrag) return;
  const el = document.elementFromPoint(x, y);
  colDrag.overBoard = !!(el && boardEl.contains(el));

  /* sumbu utama: horizontal di desktop (papan menyamping), vertikal di ponsel */
  const horizontal = getComputedStyle(boardEl).flexDirection !== 'column';
  const target = el ? el.closest('.column') : null;

  if (target && target !== colDrag.column) {
    const cols = [...boardEl.querySelectorAll('.column')].filter((c) => c !== colDrag.column);
    let next = null;
    for (const c of cols) {
      const r = c.getBoundingClientRect();
      const mid = horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
      if ((horizontal ? x : y) < mid) { next = c; break; }
    }
    if (next) boardEl.insertBefore(colDrag.placeholder, next);
    else {
      const ghost = boardEl.querySelector('.add-column-btn');
      ghost ? boardEl.insertBefore(colDrag.placeholder, ghost) : boardEl.appendChild(colDrag.placeholder);
    }
  }
}

function colScrollLoop() {
  if (!colDrag) return;
  const { pointerX: x, pointerY: y } = colDrag;
  const br = boardEl.getBoundingClientRect();
  if (x < br.left + 44) boardEl.scrollLeft -= 9;
  else if (x > br.right - 44) boardEl.scrollLeft += 9;
  if (y < 32) window.scrollBy(0, -8);
  else if (y > window.innerHeight - 32) window.scrollBy(0, 8);
  updateColTarget(x, y);
  colDrag.scrollRaf = requestAnimationFrame(colScrollLoop);
}

function endColDrag() {
  const { column, placeholder, id, overBoard } = colDrag;
  if (!overBoard) { cancelColDrag(); return; }

  const flyRect = column.getBoundingClientRect();
  const b = activeBoard();

  /* hitung urutan baru berdasarkan posisi placeholder */
  let index = 0;
  for (const child of boardEl.children) {
    if (child === placeholder) break;
    if (child.classList.contains('column') && child !== column) index++;
  }
  const fromIdx = b.columns.findIndex((c) => c.id === id);
  const [col] = b.columns.splice(fromIdx, 1);
  b.columns.splice(Math.min(index, b.columns.length), 0, col);

  placeholder.remove();
  column.classList.remove('col-dragging');
  column.style.cssText = '';
  stopColDragLoop();

  justDragged = true;
  setTimeout(() => (justDragged = false), 90);

  saveState();
  renderBoardWithFlip({ columns: true, colStart: { [id]: flyRect } });
}

function cancelColDrag() {
  if (!colDrag) return;
  const { column, placeholder } = colDrag;
  const flyRect = column.getBoundingClientRect();

  placeholder.remove();
  column.classList.remove('col-dragging');
  column.style.cssText = '';
  stopColDragLoop();

  /* animasikan kolom "terbang kembali" ke posisi semula */
  const finalRect = column.getBoundingClientRect();
  const dx = flyRect.left - finalRect.left;
  const dy = flyRect.top - finalRect.top;
  if (dx || dy) {
    column.style.transition = 'none';
    column.style.transform = `translate(${dx}px, ${dy}px)`;
    void column.offsetWidth;
    column.style.transition = 'transform .3s cubic-bezier(.22,.9,.32,1)';
    column.style.transform = '';
    column.addEventListener('transitionend', () => { column.style.cssText = ''; }, { once: true });
  }
  justDragged = true;
  setTimeout(() => (justDragged = false), 90);
}

function stopColDragLoop() {
  if (colDrag && colDrag.scrollRaf) cancelAnimationFrame(colDrag.scrollRaf);
  document.body.classList.remove('is-dragging');
  colDrag = null;
}

/* ---------- 10. MODAL TASK ---------- */
function openTaskModal({ mode, task = null, columnId = null }) {
  const b = activeBoard();
  if (!b) return;
  if (mode === 'create' && !b.columns.length) { toast('Tambahkan kolom dulu sebelum membuat task', 'info'); return; }

  taskCtx = { taskId: task ? task.id : null, columnId: task ? task.column : (columnId || (b.columns[0] && b.columns[0].id)) };
  draft = {
    title: task ? task.title : '',
    desc: task ? task.desc : '',
    priority: task ? task.priority : 'medium',
    column: taskCtx.columnId,
    labels: task ? [...(task.labels || [])] : [],
    due: task ? task.due : null,
    checklist: task ? JSON.parse(JSON.stringify(task.checklist || [])) : [],
  };

  $('taskModalTitle').textContent = mode === 'edit' ? 'Edit Task' : 'Task Baru';
  $('deleteInModal').hidden = mode !== 'edit';
  inputTitle.value = draft.title;
  inputDesc.value = draft.desc;
  inputTitle.closest('.field').classList.remove('error');

  /* tombol kolom mengikuti kolom board aktif */
  columnGroup.innerHTML = b.columns.map((c) =>
    `<button type="button" data-value="${c.id}">${escapeHTML(c.name)}</button>`).join('');
  setSegmented(priorityGroup, draft.priority);
  setSegmented(columnGroup, draft.column);

  renderLabelPicker();
  renderChecklist();
  dueInput.value = draft.due || '';

  taskModal.classList.add('open');
  document.body.classList.add('no-scroll');
  inputTitle.focus();
}
function closeTaskModal() {
  taskModal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  taskCtx = null;
  draft = null;
}

function setSegmented(group, value) {
  group.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === value));
}
function getSegmented(group) {
  const a = group.querySelector('button.active');
  return a ? a.dataset.value : null;
}
[priorityGroup, columnGroup].forEach((group) => {
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) setSegmented(group, btn.dataset.value);
  });
});

/* picker label */
function renderLabelPicker() {
  const b = activeBoard();
  labelPicker.innerHTML = b.labels.length
    ? b.labels.map((l) => {
        const on = draft.labels.includes(l.id);
        return `<button type="button" class="label-chip${on ? ' on' : ''}" data-label="${l.id}" style="--lc:${l.color}">
                  <span class="lc-dot"></span>${escapeHTML(l.name)}</button>`;
      }).join('')
    : '<span class="hint-kecil">Belum ada label — buat lewat tombol “Label” di header board.</span>';
}
labelPicker.addEventListener('click', (e) => {
  const chip = e.target.closest('.label-chip');
  if (!chip || !draft) return;
  const id = chip.dataset.label;
  const i = draft.labels.indexOf(id);
  if (i === -1) draft.labels.push(id); else draft.labels.splice(i, 1);
  chip.classList.toggle('on');
});

/* jatuh tempo */
dueInput.addEventListener('change', () => { if (draft) draft.due = dueInput.value || null; });
dueClear.addEventListener('click', () => { if (draft) draft.due = null; dueInput.value = ''; });

/* checklist */
function renderChecklist() {
  if (!draft) return;
  const items = draft.checklist;
  checklistWrap.innerHTML = items.length
    ? items.map((it) => `
        <div class="check-item${it.done ? ' done' : ''}" data-ci="${it.id}">
          <button type="button" class="check-box" aria-label="Tandai selesai">${it.done ? icon('check', 'ic-xs') : ''}</button>
          <span class="check-text">${escapeHTML(it.text)}</span>
          <button type="button" class="check-del" aria-label="Hapus item">${icon('x', 'ic-xs')}</button>
        </div>`).join('')
    : '<p class="check-empty">Belum ada item checklist.</p>';

  const done = items.filter((i) => i.done).length;
  checklistCount.textContent = items.length ? `${done}/${items.length}` : '';
  checklistBar.style.width = items.length ? (done / items.length) * 100 + '%' : '0';
  checklistProgress.classList.toggle('full', items.length > 0 && done === items.length);
}
checklistWrap.addEventListener('click', (e) => {
  if (!draft) return;
  const row = e.target.closest('.check-item');
  if (!row) return;
  const item = draft.checklist.find((i) => i.id === row.dataset.ci);
  if (!item) return;
  if (e.target.closest('.check-del')) draft.checklist = draft.checklist.filter((i) => i.id !== item.id);
  else item.done = !item.done;
  renderChecklist();
});
checklistInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault(); // cegah form tersubmit
  const v = e.target.value.trim();
  if (!v || !draft) return;
  draft.checklist.push({ id: uid(), text: v, done: false });
  e.target.value = '';
  renderChecklist();
});

/* simpan (buat baru / perbarui) */
taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const b = activeBoard();
  if (!b || !draft) return;

  const title = inputTitle.value.trim();
  if (!title) {
    inputTitle.closest('.field').classList.add('error');
    inputTitle.focus();
    return;
  }
  draft.title = title;
  draft.desc = inputDesc.value.trim();
  draft.priority = getSegmented(priorityGroup) || 'medium';
  draft.column = getSegmented(columnGroup) || draft.column;

  if (taskCtx.taskId) {
    const t = taskById(b, taskCtx.taskId);
    if (t) {
      Object.assign(t, {
        title: draft.title, desc: draft.desc, priority: draft.priority,
        column: draft.column, labels: [...draft.labels], due: draft.due,
        checklist: draft.checklist,
      });
      saveState();
      renderBoardWithFlip();
      renderBoardHeader();
      toast('Task berhasil diperbarui', 'success');
    }
  } else {
    const t = { id: uid(), createdAt: Date.now(), ...draft, labels: [...draft.labels] };
    b.tasks.push(t);
    saveState();
    renderBoard();
    renderBoardHeader();
    renderSidebar();
    toast(`Task “${escapeHTML(shortTitle(title))}” ditambahkan`, 'success');
    const newCard = boardEl.querySelector(`.task-card[data-id="${t.id}"]`);
    if (newCard) newCard.animate(
      [{ transform: 'scale(.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }
  closeTaskModal();
});
inputTitle.addEventListener('input', () => inputTitle.closest('.field').classList.remove('error'));

 $('deleteInModal').addEventListener('click', () => { if (taskCtx && taskCtx.taskId) deleteTask(taskCtx.taskId); });
 $('taskModalClose').addEventListener('click', closeTaskModal);
 $('taskCancel').addEventListener('click', closeTaskModal);
taskModal.addEventListener('click', (e) => { if (e.target === taskModal) closeTaskModal(); });
 $('newTaskBtn').addEventListener('click', () => openTaskModal({ mode: 'create' }));

/* CRUD task */
function deleteTask(id) {
  const b = activeBoard();
  const idx = b.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return;

  lastDeleted = { boardId: b.id, task: b.tasks[idx], index: idx };
  b.tasks.splice(idx, 1);
  saveState();
  closeTaskModal();
  renderBoardWithFlip();
  renderBoardHeader();
  renderSidebar();
  toast(`Task “${escapeHTML(shortTitle(lastDeleted.task.title))}” dihapus`, 'danger', {
    label: 'Urungkan',
    onClick: undoDelete,
  });
}
function undoDelete() {
  if (!lastDeleted) return;
  const b = state.boards.find((x) => x.id === lastDeleted.boardId);
  if (!b) { lastDeleted = null; return; }
  const task = lastDeleted.task;
  if (!colById(b, task.column)) task.column = b.columns[0] ? b.columns[0].id : null;
  b.tasks.splice(Math.min(lastDeleted.index, b.tasks.length), 0, task);
  lastDeleted = null;
  saveState();
  renderBoardWithFlip();
  renderBoardHeader();
  renderSidebar();
  toast('Task dipulihkan', 'info');
}
function duplicateTask(id) {
  const b = activeBoard();
  const i = b.tasks.findIndex((t) => t.id === id);
  if (i === -1) return;
  const copy = JSON.parse(JSON.stringify(b.tasks[i]));
  copy.id = uid();
  copy.createdAt = Date.now();
  b.tasks.splice(i + 1, 0, copy);
  saveState();
  renderBoard();
  renderSidebar();
  toast('Task diduplikasi', 'success');
  const el = boardEl.querySelector(`.task-card[data-id="${copy.id}"]`);
  if (el) el.animate(
    [{ transform: 'scale(.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' });
}

/* ---------- 11. DRAG & DROP KARTU ---------- */
boardEl.addEventListener('pointerdown', (e) => {
  if (cardDrag || colDrag) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('.column-head')) return;   // kepala kolom = area drag KOLOM
  if (e.target.closest('.card-actions')) return;  // jangan drag dari tombol kartu

  const fromHandle = !!e.target.closest('.card-handle');
  if (e.pointerType !== 'mouse' && !fromHandle) return; // sentuh: hanya lewat grip

  const card = e.target.closest('.task-card');
  if (!card) return;

  const startX = e.clientX, startY = e.clientY;
  let active = false;

  const onMove = (ev) => {
    if (!active) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      active = true;
      startCardDrag(ev, card);
    }
    moveCardDrag(ev);
  };
  const clean = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
  };
  const onUp = () => { clean(); if (active) endCardDrag(); };
  const onCancel = () => { clean(); if (active) cancelCardDrag(); };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
});

function startCardDrag(ev, card) {
  const rect = card.getBoundingClientRect();
  const list = card.closest('.card-list');

  const placeholder = document.createElement('div');
  placeholder.className = 'card-placeholder';
  placeholder.style.height = Math.round(rect.height) + 'px';

  cardDrag = {
    card, placeholder,
    id: card.dataset.id,
    fromColumn: list.dataset.col,
    originX: ev.clientX, originY: ev.clientY,
    pointerX: ev.clientX, pointerY: ev.clientY,
    overList: null,
    scrollRaf: 0,
  };

  list.insertBefore(placeholder, card);
  list.classList.add('has-placeholder');
  card.classList.add('dragging');
  card.style.left = rect.left + 'px';
  card.style.top = rect.top + 'px';
  card.style.width = Math.round(rect.width) + 'px';
  document.body.classList.add('is-dragging');

  updateCardTarget(ev.clientX, ev.clientY);
  cardDrag.scrollRaf = requestAnimationFrame(cardScrollLoop);
}

function moveCardDrag(ev) {
  if (!cardDrag) return;
  ev.preventDefault();
  cardDrag.pointerX = ev.clientX;
  cardDrag.pointerY = ev.clientY;
  const dx = ev.clientX - cardDrag.originX;
  const dy = ev.clientY - cardDrag.originY;
  cardDrag.card.style.transform = `translate(${dx}px, ${dy}px) rotate(2.5deg) scale(1.03)`;
  updateCardTarget(ev.clientX, ev.clientY);
}

function updateCardTarget(x, y) {
  if (!cardDrag) return;
  /* elementFromPoint melewati kartu melayang (pointer-events: none) */
  const el = document.elementFromPoint(x, y);
  const columnEl = el ? el.closest('.column') : null;
  const list = columnEl ? columnEl.querySelector('.card-list') : null;

  boardEl.querySelectorAll('.column.col-over').forEach((c) => c.classList.remove('col-over'));
  if (columnEl) columnEl.classList.add('col-over');

  if (list) {
    document.querySelectorAll('.card-list.has-placeholder').forEach((l) => l.classList.remove('has-placeholder'));
    list.classList.add('has-placeholder');

    const cards = [...list.querySelectorAll('.task-card')].filter((c) => c !== cardDrag.card);
    let next = null;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (y < r.top + r.height / 2) { next = c; break; }
    }
    if (next) list.insertBefore(cardDrag.placeholder, next);
    else list.appendChild(cardDrag.placeholder);
    cardDrag.overList = list;
  } else {
    cardDrag.overList = null;
  }
}

function cardScrollLoop() {
  if (!cardDrag) return;
  const { pointerX: x, pointerY: y } = cardDrag;
  if (y < 32) window.scrollBy(0, -8);
  else if (y > window.innerHeight - 32) window.scrollBy(0, 8);
  const br = boardEl.getBoundingClientRect();
  if (x < br.left + 44) boardEl.scrollLeft -= 8;
  else if (x > br.right - 44) boardEl.scrollLeft += 8;
  const list = cardDrag.overList;
  if (list) {
    const r = list.getBoundingClientRect();
    if (y >= r.top && y <= r.bottom) {
      if (y < r.top + 40) list.scrollTop -= 7;
      else if (y > r.bottom - 40) list.scrollTop += 7;
    }
  }
  updateCardTarget(x, y);
  cardDrag.scrollRaf = requestAnimationFrame(cardScrollLoop);
}

function endCardDrag() {
  const { card, placeholder, id, overList, fromColumn } = cardDrag;
  if (!overList) { cancelCardDrag(); return; }

  const b = activeBoard();
  const flyRect = card.getBoundingClientRect();
  const toColumn = overList.dataset.col;

  let index = 0;
  for (const el of overList.children) {
    if (el === placeholder) break;
    if (el.classList.contains('task-card') && el !== card) index++;
  }

  const before = positionSignature(b, id);
  moveTask(b, id, toColumn, index);
  const changed = positionSignature(b, id) !== before;

  placeholder.remove();
  card.classList.remove('dragging');
  card.style.cssText = '';
  stopCardDragLoop();

  justDragged = true;
  setTimeout(() => (justDragged = false), 90);

  if (!changed) { renderBoard(); return; }

  saveState();
  renderBoardWithFlip({ cardStart: { [id]: flyRect } });

  const col = colById(b, toColumn);
  const colName = col ? col.name : '';
  if (toColumn !== fromColumn) {
    toast(`Dipindahkan ke ${escapeHTML(colName)}`, 'info');
    /* perayaan kecil saat task masuk kolom "selesai" */
    if (col && /done|selesai|beres|finish/i.test(col.name)) {
      const el = boardEl.querySelector(`.task-card[data-id="${id}"]`);
      if (el) celebrate(el);
    }
  } else {
    toast('Urutan task diperbarui', 'info');
  }
}

function cancelCardDrag() {
  if (!cardDrag) return;
  const { card, placeholder } = cardDrag;
  const flyRect = card.getBoundingClientRect();

  placeholder.remove();
  card.classList.remove('dragging');
  card.style.cssText = '';
  stopCardDragLoop();

  const finalRect = card.getBoundingClientRect();
  const dx = flyRect.left - finalRect.left;
  const dy = flyRect.top - finalRect.top;
  if (dx || dy) {
    card.style.transition = 'none';
    card.style.transform = `translate(${dx}px, ${dy}px)`;
    void card.offsetWidth;
    card.style.transition = 'transform .3s cubic-bezier(.22,.9,.32,1)';
    card.style.transform = '';
    card.addEventListener('transitionend', () => { card.style.cssText = ''; }, { once: true });
  }
  justDragged = true;
  setTimeout(() => (justDragged = false), 90);
}

function stopCardDragLoop() {
  if (cardDrag && cardDrag.scrollRaf) cancelAnimationFrame(cardDrag.scrollRaf);
  document.body.classList.remove('is-dragging');
  boardEl.querySelectorAll('.column.col-over').forEach((c) => c.classList.remove('col-over'));
  document.querySelectorAll('.card-list.has-placeholder').forEach((l) => l.classList.remove('has-placeholder'));
  cardDrag = null;
}

/* pindahkan task ke kolom & urutan baru di array board.tasks */
function moveTask(b, id, toColId, toIndex) {
  const from = b.tasks.findIndex((t) => t.id === id);
  if (from === -1) return;
  const [task] = b.tasks.splice(from, 1);
  task.column = toColId;
  const colTasks = b.tasks.filter((t) => t.column === toColId);
  const ref = colTasks[toIndex];
  if (ref) b.tasks.splice(b.tasks.indexOf(ref), 0, task);
  else b.tasks.push(task);
}
function positionSignature(b, id) {
  const t = taskById(b, id);
  if (!t) return '';
  return t.column + ':' + b.tasks.filter((x) => x.column === t.column).indexOf(t);
}

window.addEventListener('blur', () => {
  if (cardDrag) cancelCardDrag();
  if (colDrag) cancelColDrag();
});
document.addEventListener('contextmenu', (e) => {
  if (cardDrag || colDrag) e.preventDefault();
});

/* confetti saat task masuk kolom selesai */
function celebrate(cardEl) {
  const colors = ['#3f68c9', '#37a169', '#e0a13e', '#cc4657'];
  const rect = cardEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + 10;
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
    ], { duration: 650 + Math.random() * 300, easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => p.remove();
  }
}

/* ---------- 12. PENCARIAN & FILTER ---------- */
function taskVisible(t) {
  if (searchQuery) {
    const hay = (t.title + ' ' + (t.desc || '')).toLowerCase();
    if (!hay.includes(searchQuery.toLowerCase())) return false;
  }
  if (filter.priority.length && !filter.priority.includes(t.priority)) return false;
  if (filter.labels.length && !(t.labels || []).some((l) => filter.labels.includes(l))) return false;
  if (filter.due.length && !filter.due.some((m) => dueFilterMatch(t.due, m))) return false;
  return true;
}
function dueFilterMatch(due, mode) {
  if (!due) return false;
  if (mode === 'late') return due < todayISO();
  if (mode === 'week') return due <= isoIn(7);
  return false;
}

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim();
  clearSearchBtn.hidden = !searchQuery;
  renderBoard();
});
clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input'));
  searchInput.focus();
});

/* ---------- 13. DARK MODE, KEYBOARD & INIT ---------- */
function setTheme(mode, persist = true) {
  document.documentElement.dataset.theme = mode;
  if (persist) { try { localStorage.setItem(THEME_KEY, mode); } catch (e) {} }
}
 $('themeToggle').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

/* Esc menutup layer paling atas; "/" memfokuskan pencarian */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (confirmModal.classList.contains('open')) { settleConfirm(false); return; }
    if (taskModal.classList.contains('open'))    { closeTaskModal(); return; }
    if (labelModal.classList.contains('open'))   { closeLabelModal(); return; }
    if (currentMenu)                             { closeMenu(); return; }
    if (!filterPanel.hidden)                     { filterPanel.hidden = true; return; }
    return;
  }
  if (e.key === '/' &&
      !taskModal.classList.contains('open') &&
      !confirmModal.classList.contains('open') &&
      !labelModal.classList.contains('open')) {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      searchInput.focus();
    }
  }
});

(function init() {
  /* isi semua ikon statis bertanda data-icon */
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

  if (!document.documentElement.dataset.theme) setTheme('light', false);

  state = loadState();
  state.boards.forEach(normalizeBoard);
  if (!state.activeBoardId && state.boards.length) state.activeBoardId = state.boards[0].id;

  renderAll();
  boardEl.classList.add('intro'); // animasi kolom masuk sekali di awal
  setTimeout(() => boardEl.classList.remove('intro'), 900);
})();
