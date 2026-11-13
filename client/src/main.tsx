import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Handy for debugging and automated checks.
import { simPos } from './net';
import { store } from './store';
(window as unknown as Record<string, unknown>).__sc = { store, simPos };
import { hotspotMenu, furnitureMenu, DOOR_SPOT } from './actions';
import { TOWN } from '../../shared/world';
(window as unknown as Record<string, unknown>).__openSpot = (id: string) => {
  const spot = id === 'door' ? DOOR_SPOT : TOWN.hotspots.find((h) => h.id === id);
  if (spot) hotspotMenu(spot, 300, 300);
};
(window as unknown as Record<string, unknown>).__furn = (item: Parameters<typeof furnitureMenu>[0]) => furnitureMenu(item, 300, 300);
