import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from '../../shared/i18n/I18nProvider';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider></React.StrictMode>,
);
