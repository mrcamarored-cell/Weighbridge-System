// Shared Firebase config + helpers used by every page
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, runTransaction, Timestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD8vEIq7vPDE3EXdZLBPr3gjygZN9MpQgs",
  authDomain: "weighbridge-system-ee0b0.firebaseapp.com",
  projectId: "weighbridge-system-ee0b0",
  storageBucket: "weighbridge-system-ee0b0.firebasestorage.app",
  messagingSenderId: "1087988339377",
  appId: "1:1087988339377:web:3fedc03a481e786b384890"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, runTransaction, Timestamp, onSnapshot
};

// ===== Generate a safe sequential Delivery No. using a Firestore transaction =====
export async function generateDeliveryNo() {
  const counterRef = doc(db, "counters", "deliveryNo");
  const newNumber = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let current = 1000; // starting number
    if (counterDoc.exists()) {
      current = (counterDoc.data().value || 1000) + 1;
    }
    transaction.set(counterRef, { value: current });
    return current;
  });
  return "DN-" + newNumber;
}

// ===== Track "who is online" - call this once per page after login =====
export async function markUserActive(uid) {
  try {
    await updateDoc(doc(db, "users", uid), { lastActive: serverTimestamp(), online: true });
  } catch (err) { console.error(err); }
}

export function startActiveHeartbeat(uid) {
  markUserActive(uid);
  setInterval(() => markUserActive(uid), 60000); // every 60 seconds
}

// ===== Require login, return user profile doc data =====
export function requireAuth(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    const profile = userDocSnap.exists() ? userDocSnap.data() : { role: "user" };
    startActiveHeartbeat(user.uid);
    callback(user, profile);
  });
}

// ===== Role-based redirect guard =====
export function requireRole(profile, allowedRoles) {
  if (!allowedRoles.includes(profile.role)) {
    alert("You do not have permission to access this page.");
    window.location.href = "dashboard.html";
    return false;
  }
  return true;
}
