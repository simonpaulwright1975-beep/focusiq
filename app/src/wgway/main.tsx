import '../shared/demoReset.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import '../employee/employee.css';
import { LandingGate } from '../shared/Landing.js';
import { WgWayApp } from './WgWayApp.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LandingGate app="employee" subtitle="Live the Walter Geering Way" enterLabel="Get started">
      <WgWayApp />
    </LandingGate>
  </StrictMode>,
);
