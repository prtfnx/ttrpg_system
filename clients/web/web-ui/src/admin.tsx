import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { AdminPanel } from './pages/AdminPanel/AdminPanel';

const config = (window as any).TTRPG_CONFIG;

if (!config || !config.sessionCode) {
  console.error('Missing session configuration');
} else {
  ReactDOM.createRoot(document.getElementById('admin-root')!).render(
    <React.StrictMode>
      <AdminPanel 
        sessionCode={config.sessionCode}
        sessionName={config.sessionName}
        userRole={config.userRole}
        userInfo={config.userInfo}
      />
    </React.StrictMode>,
  );
}
