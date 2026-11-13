import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { installEcMotion } from './lib/ecMotion'

installEcMotion();

createRoot(document.getElementById("root")!).render(<App />);
