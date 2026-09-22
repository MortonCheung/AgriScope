import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { AppRouter } from './app/AppRouter';
import './design/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <AppRouter />
    </MotionConfig>
  </React.StrictMode>,
);
