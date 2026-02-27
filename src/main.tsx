import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyTheme, getStoredThemeMode } from './core/theme';

// FOUC 防止: React レンダリング前にテーマを同期適用
applyTheme(getStoredThemeMode());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
