// Character Wardrobe & Appearance Customizer: swatch buttons recolor the
// shirt/pants materials on the existing rig in real time and persist the
// choice. No clothing item catalog or body-shape editing -- just outfit
// color, applied directly to the shared materials characterRig.js exposes.
import { saveState, getSave } from './saveSystem.js';

export function initCharacterCustomizer(panelEl, { shirtMat, pantsMat }) {
  const saved = getSave().outfit;
  shirtMat.color.set(saved.shirt);
  pantsMat.color.set(saved.pants);

  // one-click outfit presets (shirt+pants color pairs) -- there's only one
  // character mesh in this build, so a "skin" here means a color combo
  // rather than a separate model, same honest scope as the wardrobe swatches
  panelEl.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const shirt = btn.dataset.shirt, pants = btn.dataset.pants;
      shirtMat.color.set(shirt);
      pantsMat.color.set(pants);
      saveState({ outfit: { shirt, pants } });
    });
  });

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
