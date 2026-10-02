import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import './employee.css';
import { EmployeeApp } from './EmployeeApp.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EmployeeApp />
  </StrictMode>,
);
