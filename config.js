// config.js — identifiants du projet (voir GUIDE-CONFIGURATION.md pour le détail).

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDUvqhDN-MJVJfm_ugR7iLaR2Y95cvCn8U",
  authDomain: "rosie-44a3c.firebaseapp.com",
  projectId: "rosie-44a3c",
  storageBucket: "rosie-44a3c.firebasestorage.app",
  messagingSenderId: "589193333756",
  appId: "1:589193333756:web:6922a7cb06b94992924079"
};

// Cloudinary : pour l'hébergement des photos/vidéos.
window.CLOUDINARY_CLOUD_NAME = "j61gsva0";
window.CLOUDINARY_UPLOAD_PRESET = "MonJournalIntime";

// L'unique adresse email autorisée à ouvrir ce journal.
// Doit être identique au compte créé dans Firebase (Authentication → Users)
// et à l'email utilisé dans les règles Firestore (voir GUIDE-CONFIGURATION.md).
window.JOURNAL_OWNER_EMAIL = "chris26@monjournalintime.com";
