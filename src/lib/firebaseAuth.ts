import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export async function signInWithGooglePopup(): Promise<{
  uid: string;
  email: string;
  name: string;
  picture: string;
  idToken?: string;
}> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const idToken = credential?.idToken || (await result.user.getIdToken().catch(() => undefined));

  const uid = result.user.uid;
  const email = result.user.email || '';
  const name = result.user.displayName || email.split('@')[0] || 'Lunao User';
  const picture = result.user.photoURL || '';

  return { uid, email, name, picture, idToken };
}

export async function signOutGoogle(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    /* ignore */
  }
}

export async function connectGmailWithFirebase(): Promise<{ email: string; displayName: string; accessToken: string }> {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/gmail.send');
  provider.setCustomParameters({ prompt: 'select_account consent' });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;

  if (!accessToken) {
    throw new Error('Failed to retrieve access token from Google sign-in.');
  }

  const email = result.user.email || 'connected-user@gmail.com';
  const displayName = result.user.displayName || email;

  return { email, displayName, accessToken };
}
