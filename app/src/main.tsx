import './shared/demoReset.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App.js';
import { StoreProvider } from './state.js';
import { LandingGate } from './shared/Landing.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LandingGate app="director" subtitle="Director dashboard" enterLabel="Enter dashboard">
      <StoreProvider>
        <App />
      </StoreProvider>
    </LandingGate>
  </StrictMode>,
);
