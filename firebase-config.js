// Import necessary Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyANtgkveBtVVL3G7LYw7qFe61KCoAUGQ2U",
  authDomain: "football-rondo-by-louay.firebaseapp.com",
  projectId: "football-rondo-by-louay",
  storageBucket: "football-rondo-by-louay.appspot.com",
  messagingSenderId: "12258070738",
  appId: "1:12258070738:web:e1602f5facafc8c88ddd0b",
  measurementId: "G-7KFPWXVB9P",
  databaseURL: "https://football-rondo-by-louay-default-rtdb.europe-west1.firebasedatabase.app"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Export Firebase app & database
export { app, db };