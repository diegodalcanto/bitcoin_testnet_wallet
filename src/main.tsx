import { render } from 'preact';
import { initPwa } from './state/pwa';
import { initTheme } from './state/settings';
import { App } from './ui/App';
import './ui/styles.css';

initTheme();
initPwa();

const root = document.getElementById('app');
if (root) render(<App />, root);
