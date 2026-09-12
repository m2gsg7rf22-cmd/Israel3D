// Character Wardrobe & Appearance Customizer: swatch buttons recolor the
// shirt/pants materials on the existing rig in real time and persist the
// choice. No clothing item catalog or body-shape editing -- just outfit
// color, applied directly to the shared materials characterRig.js exposes.
import { saveState, getSave } from './saveSystem.js';

export function initCharacterCustomizer(panelEl, { shirtMat, pantsMat }) {
  const saved = getSave().outfit;
  shirtMat.color.set(saved.shirt);
  pantsMat.color.set(saved.pants);

  panelEl.querySelectorAll('.swatch-row[data-target="shirt"] .swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      shirtMat.color.set(color);
      saveState({ outfit: { ...getSave().outfit, shirt: color } });
    });
  });
  panelEl.querySelectorAll('.swatch-row[data-target="pants"] .swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      pantsMat.color.set(color);
      saveState({ outfit: { ...getSave().outfit, pants: color } });
    });
  });
}
