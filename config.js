// config.js — identifiants du projet (voir GUIDE-CONFIGURATION.md pour le détail).

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCo502goAIjY4tEweMvljKUZpu5w-A6528",
  authDomain: "les-dd-a-sh.firebaseapp.com",
  projectId: "les-dd-a-sh",
  storageBucket: "les-dd-a-sh.firebasestorage.app",
  messagingSenderId: "481563322437",
  appId: "1:481563322437:web:5ed18115cb39846dcb9b2c"
};

// Cloudinary : pour l'hébergement des photos/vidéos.
window.CLOUDINARY_CLOUD_NAME = "xtmn1g9i";
window.CLOUDINARY_UPLOAD_PRESET = "Les DD a Shanghai";

// L'unique adresse email autorisée à ouvrir ce journal.
// Doit être identique au compte créé dans Firebase (Authentication → Users)
// et à l'email utilisé dans les règles Firestore (voir GUIDE-CONFIGURATION.md).
window.JOURNAL_OWNER_EMAIL = "lesddashanghai@albumsouvenir.com";
