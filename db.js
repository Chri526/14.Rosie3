// db.js — couche de données "cloud" : Firebase (compte + authentification + métadonnées)
// + Cloudinary (hébergement des photos/vidéos). Voir config.js pour les identifiants
// et GUIDE-CONFIGURATION.md pour la mise en place complète.
//
// Ce journal est personnel : une seule et unique adresse email peut s'y connecter.
// Tant que personne n'est connecté, aucune page du journal n'est chargée ni visible.

let firebaseApp, auth, firestore;
let currentUser = null;
let authReadyResolve;
const authReady = new Promise((res) => { authReadyResolve = res; });
let authReadyDone = false;
let initError = null;

function resolveAuthReadyOnce() {
  if (!authReadyDone) { authReadyDone = true; authReadyResolve(); }
}

function initFirebase() {
  try {
    if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey || window.FIREBASE_CONFIG.apiKey.includes('VOTRE_')) {
      throw new Error("config.js n'est pas renseigné (FIREBASE_CONFIG manquant ou incomplet).");
    }
    firebaseApp = firebase.initializeApp(window.FIREBASE_CONFIG);
    auth = firebase.auth();
    firestore = firebase.firestore();

    auth.onAuthStateChanged((user) => {
      currentUser = user || null;
      resolveAuthReadyOnce();
      if (window.onAuthReady) window.onAuthReady();
    }, (err) => {
      console.error('Erreur onAuthStateChanged', err);
      initError = err;
      resolveAuthReadyOnce();
    });
  } catch (err) {
    console.error('Erreur d\'initialisation Firebase', err);
    initError = err;
    // On ne laisse jamais authReady bloqué indéfiniment, même en cas d'erreur de config.
    resolveAuthReadyOnce();
  }
}

async function login(email, password) {
  if (!auth) throw new Error(initError ? initError.message : "Firebase n'est pas initialisé.");
  await auth.signInWithEmailAndPassword(email, password);
}

async function logout() {
  if (!auth) return;
  await auth.signOut();
}

async function requestPasswordReset(email) {
  if (!auth) throw new Error(initError ? initError.message : "Firebase n'est pas initialisé.");
  await auth.sendPasswordResetEmail(email);
}

function uid() {
  return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function uploadToCloudinary(file, onProgress) {
  const url = `https://api.cloudinary.com/v1_1/${window.CLOUDINARY_CLOUD_NAME}/auto/upload`;
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', window.CLOUDINARY_UPLOAD_PRESET);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        resolve({ url: data.secure_url, type: file.type.startsWith('video') ? 'video' : 'image' });
      } else {
        reject(new Error('Échec de l\'envoi vers Cloudinary (' + xhr.status + ')'));
      }
    };
    xhr.onerror = () => reject(new Error('Erreur réseau pendant l\'envoi'));
    xhr.send(form);
  });
}

// entry: { id?, date, tag, title, note, _files: File[], _existingMedia: [{url,type}] }
async function addEntry(entry, onProgress) {
  if (!currentUser) throw new Error('Non connecté');
  const newMedia = [];
  const files = entry._files || [];
  for (let i = 0; i < files.length; i++) {
    const uploaded = await uploadToCloudinary(files[i], (p) => onProgress && onProgress(i, files.length, p));
    newMedia.push(uploaded);
  }
  const existingMedia = entry._existingMedia || [];
  const doc = {
    date: entry.date,
    tag: entry.tag,
    title: entry.title,
    note: entry.note,
    ownerId: currentUser.uid,
    media: [...existingMedia, ...newMedia],
    createdAt: entry.createdAt || Date.now()
  };
  if (entry.id) {
    await firestore.collection('entries').doc(entry.id).set(doc, { merge: true });
    return { id: entry.id, ...doc };
  }
  const ref = await firestore.collection('entries').add(doc);
  return { id: ref.id, ...doc };
}

async function deleteEntry(id) {
  await firestore.collection('entries').doc(id).delete();
}

// Écoute en direct de toutes les pages du journal, triées de la plus récente
// à la plus ancienne (et par heure de création pour les jours à plusieurs pages).
// Renvoie une fonction "unsubscribe" à appeler pour arrêter l'écoute.
function listenEntries(callback, onError) {
  const query = firestore.collection('entries').orderBy('date', 'desc');
  return query.onSnapshot((snap) => {
    const entries = [];
    snap.forEach((doc) => entries.push({ id: doc.id, ...doc.data() }));
    entries.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    callback(entries);
  }, (err) => { console.error('Erreur de synchronisation', err); if (onError) onError(err); });
}

window.JournalDB = {
  initFirebase, login, logout, requestPasswordReset, addEntry, deleteEntry, listenEntries, uid,
  authReady,
  get currentUser() { return currentUser; },
  get isLoggedIn() { return !!currentUser; },
  get initError() { return initError; }
};
