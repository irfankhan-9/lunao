// Google Identity Services (GIS) Client-side Auth for Lunao
const GOOGLE_CLIENT_ID =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) ||
  '613207679335-kv6plsos20rp4j3oangsikmq2hkoekab.apps.googleusercontent.com';

export async function ensureGisLoaded(): Promise<void> {
  if (typeof window === 'undefined') return;
  if ((window as any).google?.accounts?.oauth2) return;
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      if ((window as any).google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services SDK')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services SDK'));
    document.head.appendChild(script);
  });
}

export async function signInWithGoogleGIS(): Promise<{
  uid: string;
  email: string;
  name: string;
  picture: string;
  accessToken?: string;
}> {
  await ensureGisLoaded();
  const google = (window as any).google;
  if (!google?.accounts?.oauth2?.initTokenClient) {
    throw new Error('Google Identity Services is unavailable in this browser.');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid email profile',
        prompt: 'select_account',
        callback: async (response: any) => {
          if (response.error) {
            if (response.error === 'popup_closed_by_user') {
              reject(new Error('popup-closed-by-user'));
            } else if (response.error === 'access_denied') {
              reject(new Error('Google sign-in access was denied.'));
            } else {
              reject(new Error(`Google sign-in error: ${response.error}`));
            }
            return;
          }

          if (response.access_token) {
            try {
              const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${response.access_token}` },
              });
              if (!uRes.ok) {
                throw new Error('Failed to retrieve user profile from Google.');
              }
              const uData = await uRes.json();
              if (!uData.email) {
                throw new Error('Google account has no associated email.');
              }
              resolve({
                uid: uData.sub || uData.email,
                email: uData.email,
                name: uData.name || uData.email.split('@')[0],
                picture: uData.picture || '',
                accessToken: response.access_token,
              });
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error('No access token received from Google.'));
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (err) {
      reject(err);
    }
  });
}
