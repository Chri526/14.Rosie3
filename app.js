// app.js — logique de l'application Mon Journal (journal intime personnel, synchronisé en ligne)

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let currentEntries = [];
let pendingFiles = []; // {file: File|null, url, type, existingMediaObj?}
let editingId = null;
let galleryTagFilter = 'Tous';
let lightboxItems = [];
let lightboxIndex = 0;
let unsubscribeEntries = null;

// ---------- Date du jour (couverture) ----------
(function initCoverDate() {
  const el = $('#cover-date');
  if (!el) return;
  const txt = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  el.textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
})();

// ---------- Toast ----------
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---------- Invitations à écrire ----------
const WRITING_PROMPTS = [
  "Qu'est-ce qui vous a fait sourire aujourd'hui ?",
  "Racontez un moment simple de votre journée.",
  "De quoi êtes-vous fier·ère aujourd'hui ?",
  "Qu'avez-vous appris récemment ?",
  "Décrivez ce que vous ressentez, là, maintenant.",
  "Quel a été le meilleur repas de votre journée ?",
  "Qui avez-vous croisé aujourd'hui qui compte pour vous ?",
  "Qu'est-ce qui vous a surpris aujourd'hui ?",
  "Notez un petit détail que vous ne voulez pas oublier.",
  "Qu'aimeriez-vous vous rappeler dans dix ans ?",
  "Quelque chose vous a agacé ? Écrivez-le, puis lâchez-le.",
  "Quel est votre état d'esprit ce soir ?",
  "Qu'avez-vous accompli, même petit, aujourd'hui ?",
  "De quoi êtes-vous reconnaissant·e en ce moment ?",
  "Racontez un rêve, un projet, une envie du moment."
];

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

function promptForToday() {
  return WRITING_PROMPTS[dayOfYear(new Date()) % WRITING_PROMPTS.length];
}

// ---------- Navigation ----------
function switchView(view) {
  $$('.view').forEach(v => v.classList.add('hidden-view'));
  $(`#view-${view}`).classList.remove('hidden-view');
  $$('.bottom-nav .bn-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'timeline') renderTimeline();
  if (view === 'gallery') renderGallery();
  if (view === 'calendar') renderCalendar();
  if (view === 'add' && !editingId) resetForm();
}
$$('.bottom-nav .bn-item[data-view]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
$('#btn-cancel-add').addEventListener('click', () => switchView('timeline'));
$('#btn-title-home').addEventListener('click', () => switchView('timeline'));
$('#btn-back-cover').addEventListener('click', () => {
  $('#app').classList.remove('active');
  $('#cover').classList.remove('hidden');
});

// ---------- Ouverture du journal (porte d'accès protégée par mot de passe) ----------
function enterApp() {
  $('#cover').classList.add('hidden');
  $('#app').classList.add('active');
  $('#cover-login').classList.add('hidden-view');
  subscribeToEntries();
  updateAccountUI();
}

function showLoginGate() {
  $('#cover-login').classList.remove('hidden-view');
  $('#cover-login-email').focus();
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), ms))
  ]);
}

$('#btn-open-album').addEventListener('click', async () => {
  const btn = $('#btn-open-album');
  btn.disabled = true;
  const ready = await withTimeout(JournalDB.authReady, 6000);
  btn.disabled = false;
  if (!ready) {
    console.error('Firebase ne répond pas — vérifiez config.js, votre connexion, et la console pour plus de détails.');
    showToast('Impossible de se connecter au service — vérifiez votre connexion internet.');
    return;
  }
  if (JournalDB.initError) {
    console.error('Erreur de configuration :', JournalDB.initError);
    showToast('Configuration incomplète : ' + JournalDB.initError.message);
    return;
  }
  if (JournalDB.isLoggedIn) {
    enterApp();
  } else {
    showLoginGate();
  }
});

$('#cover-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#cover-login-email').value.trim();
  const password = $('#cover-login-password').value;
  const errEl = $('#cover-login-error');
  const btn = $('#cover-login-submit');
  errEl.style.display = 'none';
  btn.disabled = true;
  try {
    await JournalDB.login(email, password);
    enterApp();
  } catch (err) {
    errEl.textContent = 'Connexion impossible : email ou mot de passe incorrect.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
});

$('#cover-login-forgot').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = $('#cover-login-email').value.trim();
  if (!email) { showToast('Indiquez d\'abord votre email ci-dessus.'); return; }
  try {
    await JournalDB.requestPasswordReset(email);
    showToast('Email de réinitialisation envoyé ✓');
  } catch (err) {
    showToast('Impossible d\'envoyer l\'email — vérifiez l\'adresse.');
  }
});

// ---------- Abonnement en direct aux pages du journal ----------
function subscribeToEntries() {
  if (unsubscribeEntries) unsubscribeEntries();
  unsubscribeEntries = JournalDB.listenEntries((entries) => {
    currentEntries = entries;
    const activeView = $$('.bottom-nav .bn-item.active')[0]?.dataset.view || 'timeline';
    if (activeView === 'timeline') renderTimeline();
    if (activeView === 'gallery') renderGallery();
    updateEntriesCounter();
  }, (err) => {
    showToast('Connexion impossible : vérifiez votre connexion internet.');
  });
}

window.onAuthReady = () => {
  if (!JournalDB.isLoggedIn && $('#app').classList.contains('active')) {
    // La session a expiré ou l'utilisateur s'est déconnecté : retour à la couverture.
    if (unsubscribeEntries) { unsubscribeEntries(); unsubscribeEntries = null; }
    currentEntries = [];
    $('#app').classList.remove('active');
    $('#cover').classList.remove('hidden');
  }
  updateAccountUI();
};

function updateEntriesCounter() {
  const badge = $('#entries-counter');
  if (!badge) return;
  const n = currentEntries.length;
  badge.textContent = n === 0 ? '' : (n === 1 ? '1 page' : `${n} pages`);
}

// ---------- Chronologie ----------
let entryRenderCounter = 0;

function renderTimeline() {
  const container = $('#timeline-container');
  if (!currentEntries.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="big">✒️</div>
        <h3>Votre première page vous attend</h3>
        <p>${escapeHTML(promptForToday())}</p>
        <div style="margin-top:16px;"><button class="btn-dark" onclick="switchView('add')">Écrire aujourd'hui</button></div>
      </div>`;
    return;
  }
  let html = '<div class="timeline">';
  let lastYear = null;
  entryRenderCounter = 0;
  for (const entry of currentEntries) {
    const year = (entry.date || '').slice(0, 4) || '—';
    if (year !== lastYear) { html += `<div class="year-heading">${year}</div>`; lastYear = year; }
    html += renderEntryCard(entry, entryRenderCounter++);
  }
  html += '</div>';
  container.innerHTML = html;
  attachEntryHandlers();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderEntryCard(entry, index) {
  const media = entry.media || [];
  const hasMedia = media.length > 0;
  const mediaHtml = media.map((m, i) => `
    <div class="media-thumb" data-entry="${entry.id}" data-idx="${i}">
      ${m.type === 'video'
        ? `<video src="${m.url}" muted></video><div class="play-badge">▶</div>`
        : `<img src="${m.url}" loading="lazy" alt="">`}
    </div>`).join('');

  const altClass = hasMedia && (index % 2 === 1) ? ' entry-card--alt' : '';

  const infoBlock = `
    <div class="entry-info">
      <div class="entry-top">
        <div>
          <span class="entry-date">${formatDate(entry.date)}</span>
          ${entry.tag ? `<span class="entry-tag">${entry.tag}</span>` : ''}
        </div>
        <div class="entry-actions">
          <button class="entry-menu-btn" data-id="${entry.id}" title="Options">⋯</button>
          <div class="entry-menu-popover hidden-view" data-menu-for="${entry.id}">
            <button class="btn-edit" data-id="${entry.id}">✎ Modifier</button>
            <button class="btn-delete" data-id="${entry.id}">🗑 Supprimer</button>
          </div>
        </div>
      </div>
      <h3>${escapeHTML(entry.title || '')}</h3>
      ${entry.note ? `<div class="note">${sanitizeHTML(entry.note)}</div>` : ''}
    </div>`;

  const mediaBlock = hasMedia ? `
    <div class="entry-media-side">
      <div class="entry-media-grid">${mediaHtml}</div>
    </div>` : '';

  return `
    <div class="entry-card${altClass}" data-id="${entry.id}" data-date="${entry.date || ''}">
      <div class="entry-body">
        ${infoBlock}
        ${mediaBlock}
      </div>
    </div>`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Nettoie le HTML produit par l'éditeur de texte enrichi : ne garde que la mise en
// forme (gras, italique, souligné, couleur, police, surlignage), rien d'exécutable.
const RT_ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'FONT', 'DIV', 'BR']);
const RT_ALLOWED_STYLES = new Set(['color', 'background-color', 'font-family']);

function sanitizeHTML(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');

  function cleanNode(node) {
    Array.from(node.childNodes).forEach(cleanNode);
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (!RT_ALLOWED_TAGS.has(node.tagName)) {
        const parent = node.parentNode;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
        return;
      }
      const style = node.getAttribute('style');
      const face = node.getAttribute('face');
      const color = node.getAttribute('color');
      const bgcolor = node.getAttribute('bgcolor');
      Array.from(node.attributes).forEach(a => node.removeAttribute(a.name));
      if (style) {
        const kept = style.split(';').map(s => s.trim()).filter(Boolean).filter(rule => {
          const prop = rule.split(':')[0].trim().toLowerCase();
          return RT_ALLOWED_STYLES.has(prop);
        });
        if (kept.length) node.setAttribute('style', kept.join('; '));
      }
      if (node.tagName === 'FONT') {
        if (face) node.setAttribute('face', face);
        if (color) node.setAttribute('color', color);
        if (bgcolor) node.setAttribute('bgcolor', bgcolor);
      }
    } else if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode.removeChild(node);
    }
  }

  Array.from(doc.body.childNodes).forEach(cleanNode);
  return doc.body.innerHTML;
}

function attachEntryHandlers() {
  $$('.media-thumb').forEach(el => {
    el.addEventListener('click', () => {
      const entry = currentEntries.find(e => e.id === el.dataset.entry);
      openLightbox(entry.media, parseInt(el.dataset.idx, 10));
    });
  });
  $$('.entry-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popover = document.querySelector(`.entry-menu-popover[data-menu-for="${btn.dataset.id}"]`);
      const wasOpen = !popover.classList.contains('hidden-view');
      $$('.entry-menu-popover').forEach(p => p.classList.add('hidden-view'));
      if (!wasOpen) popover.classList.remove('hidden-view');
    });
  });
  $$('.btn-edit').forEach(el => el.addEventListener('click', () => editEntry(el.dataset.id)));
  $$('.btn-delete').forEach(el => el.addEventListener('click', () => confirmDelete(el.dataset.id)));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.entry-actions')) {
    $$('.entry-menu-popover').forEach(p => p.classList.add('hidden-view'));
  }
});

async function confirmDelete(id) {
  if (!confirm('Supprimer définitivement cette page ?')) return;
  try {
    await JournalDB.deleteEntry(id);
    showToast('Page supprimée');
  } catch (e) {
    console.error(e);
    showToast('Suppression impossible');
  }
}

function editEntry(id) {
  const entry = currentEntries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  $('#add-heading').textContent = 'Modifier la page';
  $('#entry-id').value = entry.id;
  $('#entry-date').value = entry.date || '';
  $('#entry-tag').value = entry.tag || 'Quotidien';
  $('#entry-title').value = entry.title || '';
  $('#entry-note').innerHTML = sanitizeHTML(entry.note || '');
  pendingFiles = (entry.media || []).map(m => ({ file: null, existingMediaObj: m, url: m.url, type: m.type }));
  renderPreviews();
  $('#writing-prompt').classList.add('hidden-view');
  switchView('add');
}

// ---------- Galerie ----------
function renderGallery() {
  const tags = ['Tous', ...new Set(currentEntries.map(e => e.tag).filter(Boolean))];
  $('#gallery-filters').innerHTML = tags.map(t =>
    `<button class="filter-chip ${t === galleryTagFilter ? 'active' : ''}" data-tag="${t}">${t}</button>`
  ).join('');
  $$('.filter-chip').forEach(el => el.addEventListener('click', () => { galleryTagFilter = el.dataset.tag; renderGallery(); }));

  const items = [];
  currentEntries.forEach(entry => {
    if (galleryTagFilter !== 'Tous' && entry.tag !== galleryTagFilter) return;
    (entry.media || []).forEach((m, i) => items.push({ media: entry.media, idx: i, item: m }));
  });

  const grid = $('#gallery-container');
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="big">🖼️</div></div>`;
    return;
  }
  grid.innerHTML = items.map((it, gi) => `
    <div class="media-thumb" data-gi="${gi}">
      ${it.item.type === 'video'
        ? `<video src="${it.item.url}" muted></video><div class="play-badge">▶</div>`
        : `<img src="${it.item.url}" loading="lazy" alt="">`}
    </div>`).join('');

  $$('#gallery-container .media-thumb').forEach((el, gi) => {
    el.addEventListener('click', () => { const it = items[gi]; openLightbox(it.media, it.idx); });
  });
}

// ---------- Lightbox ----------
function openLightbox(mediaArr, idx) {
  lightboxItems = mediaArr; lightboxIndex = idx;
  renderLightbox();
  $('#lightbox').classList.add('active');
}
function renderLightbox() {
  const m = lightboxItems[lightboxIndex];
  $('#lightbox-content').innerHTML = m.type === 'video'
    ? `<video src="${m.url}" controls autoplay></video>`
    : `<img src="${m.url}" alt="">`;
}
$('#lightbox-close').addEventListener('click', () => $('#lightbox').classList.remove('active'));
$('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') $('#lightbox').classList.remove('active'); });
$('#lightbox-prev').addEventListener('click', () => { lightboxIndex = (lightboxIndex - 1 + lightboxItems.length) % lightboxItems.length; renderLightbox(); });
$('#lightbox-next').addEventListener('click', () => { lightboxIndex = (lightboxIndex + 1) % lightboxItems.length; renderLightbox(); });
document.addEventListener('keydown', (e) => {
  if (!$('#lightbox').classList.contains('active')) return;
  if (e.key === 'Escape') $('#lightbox').classList.remove('active');
  if (e.key === 'ArrowLeft') $('#lightbox-prev').click();
  if (e.key === 'ArrowRight') $('#lightbox-next').click();
});

// ---------- Formulaire d'ajout ----------
function resetForm() {
  editingId = null;
  pendingFiles = [];
  $('#add-heading').textContent = 'Écrire aujourd\'hui';
  $('#entry-form').reset();
  $('#entry-id').value = '';
  $('#entry-date').valueAsDate = new Date();
  $('#entry-note').innerHTML = '';
  renderPreviews();
  $('#upload-progress').style.display = 'none';
  $('#writing-prompt-text').textContent = promptForToday();
  $('#writing-prompt').classList.remove('hidden-view');
}

$('#btn-dismiss-prompt').addEventListener('click', () => $('#writing-prompt').classList.add('hidden-view'));
$('#btn-use-prompt').addEventListener('click', () => {
  $('#entry-note').focus();
  if (!$('#entry-note').textContent.trim()) {
    $('#entry-note').innerHTML = '';
  }
});

const dropzone = $('#dropzone');
const fileInput = $('#file-input');
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('drag'); handleFiles(e.dataTransfer.files); });
fileInput.addEventListener('change', () => handleFiles(fileInput.files));

function handleFiles(fileList) {
  Array.from(fileList).forEach(file => {
    const type = file.type.startsWith('video') ? 'video' : 'image';
    pendingFiles.push({ file, url: URL.createObjectURL(file), type });
  });
  fileInput.value = '';
  renderPreviews();
}

function renderPreviews() {
  const grid = $('#preview-grid');
  grid.innerHTML = pendingFiles.map((p, i) => `
    <div class="preview-item">
      ${p.type === 'video' ? `<video src="${p.url}" muted></video>` : `<img src="${p.url}">`}
      <button type="button" class="remove" data-i="${i}">×</button>
    </div>`).join('');
  $$('#preview-grid .remove').forEach(btn => btn.addEventListener('click', () => {
    pendingFiles.splice(parseInt(btn.dataset.i, 10), 1);
    renderPreviews();
  }));
}

// ---------- Éditeur de texte enrichi ----------
const noteEditable = $('#entry-note');
try { document.execCommand('styleWithCSS', false, true); } catch (e) { /* ignoré si non supporté */ }
let savedNoteRange = null;

function saveNoteSelection() {
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (noteEditable.contains(range.commonAncestorContainer)) {
      savedNoteRange = range.cloneRange();
    }
  }
}
noteEditable.addEventListener('mouseup', saveNoteSelection);
noteEditable.addEventListener('keyup', saveNoteSelection);

function restoreNoteSelection() {
  if (!savedNoteRange) { noteEditable.focus(); return; }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedNoteRange);
}

noteEditable.addEventListener('input', () => {
  if (noteEditable.textContent.trim() === '') noteEditable.innerHTML = '';
});
noteEditable.addEventListener('focus', () => $('#writing-prompt').classList.add('hidden-view'));

// Boutons Gras / Italique / Souligné — mousedown preventDefault empêche
// de perdre la sélection en cours dans l'éditeur.
$$('#note-toolbar .rt-btn[data-cmd]').forEach(btn => {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    document.execCommand(btn.dataset.cmd, false, null);
  });
});

// Nuances de couleur (texte et surlignage)
$$('#note-toolbar .rt-swatches').forEach(group => {
  const mode = group.dataset.mode;
  group.querySelectorAll('.rt-swatch').forEach(sw => {
    sw.addEventListener('mousedown', (e) => e.preventDefault());
    sw.addEventListener('click', () => {
      const color = sw.dataset.color;
      if (mode === 'fore') {
        document.execCommand('foreColor', false, color);
      } else {
        document.execCommand('hiliteColor', false, color);
      }
    });
  });
});

// Police — un <select> vole nécessairement le focus à l'ouverture,
// on restaure donc la sélection sauvegardée avant d'appliquer.
$('#note-font').addEventListener('change', () => {
  restoreNoteSelection();
  const font = $('#note-font').value;
  if (font) document.execCommand('fontName', false, font);
  $('#note-font').value = '';
});

// Emoji
$('#btn-emoji-toggle').addEventListener('mousedown', (e) => e.preventDefault());
$('#btn-emoji-toggle').addEventListener('click', () => {
  $('#emoji-panel').classList.toggle('hidden-view');
});
$('#btn-emoji-close').addEventListener('mousedown', (e) => e.preventDefault());
$('#btn-emoji-close').addEventListener('click', () => {
  $('#emoji-panel').classList.add('hidden-view');
});
$$('#emoji-panel .rt-emoji-grid button').forEach(btn => {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    document.execCommand('insertText', false, btn.dataset.emoji);
    $('#emoji-panel').classList.add('hidden-view');
  });
});

$('#entry-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveBtn = $('#btn-save-entry');
  const progressWrap = $('#upload-progress');
  const progressBar = progressWrap.firstElementChild;
  saveBtn.disabled = true;
  progressWrap.style.display = 'block';
  progressBar.style.width = '2%';
  try {
    const newFiles = pendingFiles.filter(p => p.file).map(p => p.file);
    const existingMedia = pendingFiles.filter(p => p.existingMediaObj).map(p => p.existingMediaObj);

    await JournalDB.addEntry({
      id: editingId || undefined,
      date: $('#entry-date').value,
      tag: $('#entry-tag').value,
      title: $('#entry-title').value.trim(),
      note: sanitizeHTML($('#entry-note').innerHTML.trim()),
      _files: newFiles,
      _existingMedia: existingMedia
    }, (fileIndex, totalFiles, progress) => {
      const overall = ((fileIndex + progress) / Math.max(totalFiles, 1)) * 100;
      progressBar.style.width = Math.min(overall, 99) + '%';
    });

    progressBar.style.width = '100%';
    showToast(editingId ? 'Page mise à jour' : 'Page enregistrée ✓');
    resetForm();
    switchView('timeline');
  } catch (err) {
    console.error(err);
    showToast('Erreur pendant l\'envoi — vérifiez votre connexion et réessayez.');
  } finally {
    saveBtn.disabled = false;
    setTimeout(() => { progressWrap.style.display = 'none'; progressBar.style.width = '0%'; }, 600);
  }
});

// ---------- Réglages : mon compte ----------
function updateAccountUI() {
  const panel = $('#account-panel');
  if (!panel) return;
  if (JournalDB.isLoggedIn) {
    panel.innerHTML = `
      <p style="color:var(--sage); font-weight:600;">💛 Connecté en tant que ${escapeHTML(JournalDB.currentUser.email || '')}</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn-outline" id="btn-reset-password">Changer mon mot de passe</button>
        <button class="btn-outline" id="btn-logout">Se déconnecter</button>
      </div>`;
    $('#btn-reset-password').addEventListener('click', async () => {
      try {
        await JournalDB.requestPasswordReset(JournalDB.currentUser.email);
        showToast('Email de réinitialisation envoyé ✓');
      } catch (err) {
        showToast('Impossible d\'envoyer l\'email.');
      }
    });
    $('#btn-logout').addEventListener('click', async () => {
      await JournalDB.logout();
      showToast('Déconnecté');
    });
  } else {
    panel.innerHTML = `<p>Vous n'êtes pas connecté.</p>`;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  });
}

// ---------- Calendrier ----------
const CAL_MIN = new Date(2020, 0, 1);
const today = new Date();
const CAL_MAX = new Date(today.getFullYear(), today.getMonth(), 1);
let calCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
if (calCurrentMonth < CAL_MIN) calCurrentMonth = new Date(CAL_MIN);

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function pad2(n) { return String(n).padStart(2, '0'); }

function renderCalendar() {
  $('#cal-month-label').textContent = `${MOIS_FR[calCurrentMonth.getMonth()]} ${calCurrentMonth.getFullYear()}`;
  $('#cal-prev').disabled = (calCurrentMonth.getFullYear() === CAL_MIN.getFullYear() && calCurrentMonth.getMonth() === CAL_MIN.getMonth());
  $('#cal-next').disabled = (calCurrentMonth.getFullYear() === CAL_MAX.getFullYear() && calCurrentMonth.getMonth() === CAL_MAX.getMonth());

  // Regroupe les pages par date (YYYY-MM-DD)
  const byDate = {};
  currentEntries.forEach(e => {
    if (!e.date) return;
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });

  const year = calCurrentMonth.getFullYear();
  const month = calCurrentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = lundi

  let html = '';
  for (let i = 0; i < firstWeekday; i++) html += `<div class="cal-cell cal-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    const dayEntries = byDate[dateStr];
    if (dayEntries && dayEntries.length) {
      const withMedia = dayEntries.find(e => e.media && e.media.length);
      const thumbUrl = withMedia ? withMedia.media[0].url : null;
      const multi = dayEntries.length > 1 ? `<span class="cal-day-count">${dayEntries.length}</span>` : '';
      html += `
        <button class="cal-cell cal-day cal-has-entry" data-date="${dateStr}" style="${thumbUrl ? `background-image:url('${thumbUrl}')` : ''}">
          ${multi}
          <span class="cal-day-num">${d}</span>
        </button>`;
    } else {
      html += `<div class="cal-cell cal-day"><span class="cal-day-num cal-day-num--empty">${d}</span></div>`;
    }
  }
  $('#calendar-grid').innerHTML = html;

  $$('.cal-has-entry').forEach(btn => {
    btn.addEventListener('click', () => goToDate(btn.dataset.date));
  });
}

function goToDate(dateStr) {
  switchView('timeline');
  setTimeout(() => {
    const card = document.querySelector(`.entry-card[data-date="${dateStr}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('entry-highlight');
      setTimeout(() => card.classList.remove('entry-highlight'), 1800);
    }
  }, 60);
}

$('#cal-prev').addEventListener('click', () => {
  if ($('#cal-prev').disabled) return;
  calCurrentMonth = new Date(calCurrentMonth.getFullYear(), calCurrentMonth.getMonth() - 1, 1);
  renderCalendar();
});
$('#cal-next').addEventListener('click', () => {
  if ($('#cal-next').disabled) return;
  calCurrentMonth = new Date(calCurrentMonth.getFullYear(), calCurrentMonth.getMonth() + 1, 1);
  renderCalendar();
});

// ---------- Démarrage ----------
JournalDB.initFirebase();

// expose pour les onclick inline
window.switchView = switchView;
