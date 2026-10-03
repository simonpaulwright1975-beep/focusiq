import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import './employee.css';
import { EmployeeApp } from './EmployeeApp.js';
import { LandingGate } from '../shared/Landing.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LandingGate app="employee" subtitle="Your FocusiQ assessment" enterLabel="Get started">
      <EmployeeApp />
    </LandingGate>
  </StrictMode>,
);
