import { createRoot } from 'react-dom/client'
import './styles/motion.css'
import App from './App.tsx'
import './index.css'
import './i18n/extraLangs'
import { installEcMotion } from './lib/ecMotion'
import { installAutoDir } from './lib/autoDir'
import { installPillGuard } from './lib/pillGuard'

installEcMotion()
installAutoDir();
installPillGuard(); // the selected label can never vanish into the liquid pill (QA #89/#95/#97, see lib/pillGuard.ts)

// After a new deploy, an open tab may ask for script files that no longer exist:
// reload once to pick up the new build instead of showing a blank screen.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('ec-chunk-reload') || 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem('ec-chunk-reload', String(Date.now()));
  } catch {
    /* storage unavailable: still reload */
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
