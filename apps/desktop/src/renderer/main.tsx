import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';
import { initI18n, loadTranslations } from './i18n/config';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

// Initialize i18n before rendering
initI18n()
  .then(async () => {
    // Load initial language translations
    const initialLocale = window.accomplish?.getInitialLocale
      ? await window.accomplish.getInitialLocale()
      : 'en';
    await loadTranslations(initialLocale);
    
    // Render the app
    const root = createRoot(container);
    root.render(
      <StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>
    );
  })
  .catch((error) => {
    console.error('Failed to initialize i18n:', error);
    // Fallback: render without i18n
    const root = createRoot(container);
    root.render(
      <StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>
    );
  });
