// Shared Firebase config + helpers used by every page
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
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

// ===== Create a new auth user WITHOUT signing out the current admin =====
// Uses a temporary secondary Firebase app so the admin's session stays intact.
export async function createUserKeepingSession(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, "Secondary_" + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await signOut(secondaryAuth);
    return uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

// ===== Verify a supervisor/admin by username + password =====
// Uses a temporary secondary Firebase app so the current operator's session is untouched.
export async function verifySupervisor(username, password) {
  const qy = query(collection(db, "users"), where("username", "==", username));
  const snap = await getDocs(qy);
  if (snap.empty) return { ok: false, reason: "Supervisor username not found." };
  const u = snap.docs[0].data();
  if (!["supervisor", "admin"].includes(u.role)) {
    return { ok: false, reason: "This user is not a supervisor or admin." };
  }
  const secondaryApp = initializeApp(firebaseConfig, "Verify_" + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    await signInWithEmailAndPassword(secondaryAuth, u.email, password);
    await signOut(secondaryAuth);
    return { ok: true, name: u.name || username };
  } catch (e) {
    return { ok: false, reason: "Incorrect supervisor password." };
  } finally {
    await deleteApp(secondaryApp);
  }
}

// ===== Verify the CURRENT user's own password (re-auth on a temporary app) =====
export async function verifyPassword(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, "PW_" + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    await signInWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "Incorrect password." };
  } finally {
    await deleteApp(secondaryApp);
  }
}

// ===== Append an entry to the audit trail =====
export async function logAudit(entry) {
  try {
    await addDoc(collection(db, "auditLog"), {
      deliveryNo: entry.deliveryNo || "",
      truckNumber: entry.truckNumber || "",
      action: entry.action || "",
      fromStatus: entry.fromStatus || "",
      toStatus: entry.toStatus || "",
      byUser: entry.byUser || "",
      reason: entry.reason || "",
      at: serverTimestamp()
    });
  } catch (e) { console.error("audit log failed", e); }
}

// ===== Reverse a delivery ONE step back (or delete it if it is at Truck In) =====
export async function reverseOneStep(docId, data, reason, byUser) {
  const prev = { "Loading Complete": "Truck In", "Truck Out": "Loading Complete", "Completed": "Truck Out" };
  const cur = data.status;
  if (cur === "Truck In") {
    await deleteDoc(doc(db, "deliveries", docId));
    await logAudit({ deliveryNo: data.deliveryNo, truckNumber: data.truckNumber, action: "Delete", fromStatus: "Truck In", toStatus: "(deleted)", byUser, reason });
    return "deleted";
  }
  const to = prev[cur];
  if (!to) throw new Error("Cannot reverse from status: " + cur);
  const upd = { status: to, reversedIndicator: true };
  if (cur === "Loading Complete") { upd.numberOfBags = null; upd.hold = null; upd.pickedBy = null; upd.pickedAt = null; }
  else if (cur === "Truck Out") { upd.grossWeight = null; upd.netWeight = null; upd.pgiBy = null; upd.pgiAt = null; }
  else if (cur === "Completed") { upd.receivedBags = null; upd.receivedBy = null; upd.receivedAt = null; }
  await updateDoc(doc(db, "deliveries", docId), upd);
  await logAudit({ deliveryNo: data.deliveryNo, truckNumber: data.truckNumber, action: "Reverse", fromStatus: cur, toStatus: to, byUser, reason });
  return to;
}

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
  setInterval(() => checkForceLogout(uid), 20000); // every 20 seconds
}

// ===== Check if an admin flagged this user for forced logout =====
async function checkForceLogout(uid) {
  try {
    const userDocRef = doc(db, "users", uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists() && snap.data().forceLogout === true) {
      await updateDoc(userDocRef, { forceLogout: false, online: false });
      alert("You have been signed out by an administrator.");
      await signOut(auth);
      window.location.href = "index.html";
    }
  } catch (err) { console.error(err); }
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
