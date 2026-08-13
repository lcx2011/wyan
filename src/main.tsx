import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { appTheme } from './theme';
import { bootstrapServerArchive } from './api/archive';
import './index.css';

/** Hydrate the server-owned single archive before any Zustand store is imported. */
async function mount(): Promise<void> {
  await bootstrapServerArchive();
  const { default: App } = await import('./App');
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}

void mount();
