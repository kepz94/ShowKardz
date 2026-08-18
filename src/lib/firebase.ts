/**
 * Firebase setup.
 *
 * These values are PUBLIC. Every Firebase web app ships them inside its
 * JavaScript bundle — they identify the project, they do not authorise anything.
 * What protects the data is Firestore rules plus a signed-in user, which is why
 * firestore.rules in the repo root is part of this feature and not an afterthought.
 * (A service-account key would be a real secret. The client never sees one.)
 */
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, getAuth, getRedirectResult, onAuthStateChanged,
  signInWithPopup, signInWithRedirect, signOut, type User,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCaRdN37-vvvitQ10CUQv47ZFsXsvxvk4g',
  authDomain: 'showkardz.firebaseapp.com',
  projectId: 'showkardz',
  storageBucket: 'showkardz.firebasestorage.app',
  messagingSenderId: '30233896984',
  appId: '1:30233896984:web:111c77441777e34018bb6d',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

/**
 * Offline persistence is the whole reason Firestore is the right store here:
 * writes made at the table with no signal land in the local cache and flush on
 * reconnect, and reads keep working. This is configured at initialisation —
 * it cannot be turned on later.
 */
export const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

/** An installed home-screen app has no popup to return to. */
function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export async function signIn(): Promise<void> {
  const provider = new GoogleAuthProvider();
  // A popup inside an installed PWA opens a window the user cannot get back
  // from, so standalone takes the redirect path. In a browser tab the popup is
  // better — it keeps the app's state instead of reloading it.
  if (isStandalone()) {
    await signInWithRedirect(auth, provider);
    return;
  }
  await signInWithPopup(auth, provider);
}

export const signOutOfApp = (): Promise<void> => signOut(auth);

export function watchAuth(onUser: (user: User | null) => void): () => void {
  // Resolves the standalone redirect on the way back in. A failure here must
  // not stop the listener attaching, or a returning user is stuck signed out.
  void getRedirectResult(auth).catch(() => undefined);
  return onAuthStateChanged(auth, onUser);
}

export type { User };
