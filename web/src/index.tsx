import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './lib/i18n'; // initialize i18next before App Bridge loads
import App from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
