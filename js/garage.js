// Garage & Vehicle Spawner panel: teleports the car/moto next to the player
// (auto-entering it if the player is on foot) and offers a quick repair that
// resets a stuck/flipped vehicle's motion state. No purchase economy or
// vehicle catalog here -- both vehicles already exist in the world, so
// "spawning" means summoning the existing one rather than buying a new one.
export function initGarage(panelEl, { teleportToVehicle, repairVehicle }) {
  panelEl.querySelector('#garage-car-spawn').addEventListener('click', () => teleportToVehicle('car'));
  panelEl.querySelector('#garage-car-repair').addEventListener('click', () => repairVehicle('car'));
  panelEl.querySelector('#garage-moto-spawn').addEventListener('click', () => teleportToVehicle('moto'));
  panelEl.querySelector('#garage-moto-repair').addEventListener('click', () => repairVehicle('moto'));
}
