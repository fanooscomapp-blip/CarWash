import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { I18nProvider } from './lib/i18n.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { ToastProvider } from './components/ui.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter><App /></BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  </React.StrictMode>,
);
