import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safe API fetch helper for authenticated requests
export function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  if ((urlStr.startsWith('/api/') || urlStr.includes('/api/')) && !headers.has('Authorization')) {
    const storedToken =
      localStorage.getItem('lunao_auth_token') ||
      localStorage.getItem('token') ||
      'lunao-mock-dev-token';
    headers.set('Authorization', `Bearer ${storedToken}`);
  }
  return window.fetch(input, { ...init, headers });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
