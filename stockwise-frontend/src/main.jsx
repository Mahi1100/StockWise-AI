// stockwise-frontend/src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Import Bootstrap CSS (CRITICAL)
import 'bootstrap/dist/css/bootstrap.min.css'; 

// This minimalist wrapper ensures no complex theme provider crashes the app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);