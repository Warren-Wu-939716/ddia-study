import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { requestPersistentStorage } from './lib/db.ts';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

void requestPersistentStorage();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
