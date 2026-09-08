import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Sin `React.StrictMode`, a propósito.
//
// En struct_pad el canvas se montaba como isla `client:only="react"`, que NO
// envuelve en StrictMode. El doble montaje que StrictMode hace en desarrollo
// dispara dos veces los `useEffect` de deep-link de `MathCanvas`: la planilla
// se descargaría dos veces y el diálogo de reemplazo saldría repetido. Es un
// problema del andamiaje, no del canvas, y así no aparece.
createRoot(document.getElementById('root')!).render(<App />);
