import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { takeHubTheme } from './lib/hubTheme';
import './styles/obsidian.css';
import './styles/halo.css';
import './styles/galaxy.css';
import './styles/cinematic.css';

// Framed by the Bookmark Hub: its theme came in the address; keep it, clean the address.
takeHubTheme();

// NOTE: /share/<id> never reaches the SPA — the server renders it (SEO/OG SSR).

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
