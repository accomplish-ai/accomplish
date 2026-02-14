import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { initTheme } from './lib/theme';
import './styles/globals.css';
import { initI18n } from './i18n';

initTheme();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

// Initialize i18n before rendering
initI18n()
  .then(() => {
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
    // Render anyway with fallback
    const root = createRoot(container);
    root.render(
      <StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>
    );
  });
