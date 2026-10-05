import '../shared/demoReset.js';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import './employee.css';
import { EmployeeApp } from './EmployeeApp.js';
import { LandingGate, PreviewGate } from '../shared/Landing.js';
import { BackendContext, createPreviewBackend } from './backend.js';

/** employee.html?preview: a Director's practice copy of the staff view; nothing is saved. */
function Preview() {
  const [backend] = useState(createPreviewBackend);
  return (
    <BackendContext.Provider value={backend}>
      <EmployeeApp />
    </BackendContext.Provider>
  );
}

const preview = new URLSearchParams(window.location.search).has('preview');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {preview ? (
      <PreviewGate>
        <Preview />
      </PreviewGate>
    ) : (
      <LandingGate app="employee" subtitle="Your FocusiQ assessment" enterLabel="Get started">
        <EmployeeApp />
      </LandingGate>
    )}
  </StrictMode>,
);
