import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampEvaPlayerPosition,
  createInitialEvaState,
  EVA_AIRLOCK_SPAWN,
  EVA_EYE_HEIGHT,
  EVA_FRICTION,
  EVA_HUD_SPAWN,
  EVA_MAX_RADIUS,
  EVA_PLAYER_RADIUS,
  findNearestEvaInteractable,
  stepEvaPhysics,
} from './evaPhysics';

function sampleSlopeHeight(x: number, z: number): number {
  return Math.sin(x * 0.15) * 0.6 + Math.cos(z * 0.12) * 0.4 + Math.max(0, Math.hypot(x, z) - 18) * 0.05;
}

test('EVA spawn points start clear of all outpost colliders at terrainHeight + 1.75m', () => {
  const hudSpawn = createInitialEvaState(sampleSlopeHeight, EVA_HUD_SPAWN);
  const clampedHud = clampEvaPlayerPosition(hudSpawn.x, hudSpawn.z, hudSpawn.x, hudSpawn.z);
  assert.ok(Math.hypot(clampedHud.x - hudSpawn.x, clampedHud.z - hudSpawn.z) < 0.001);
  assert.equal(hudSpawn.y, sampleSlopeHeight(hudSpawn.x, hudSpawn.z) + EVA_EYE_HEIGHT);

  const airlockSpawn = createInitialEvaState(sampleSlopeHeight, EVA_AIRLOCK_SPAWN);
  const clampedAirlock = clampEvaPlayerPosition(
    airlockSpawn.x,
    airlockSpawn.z,
    airlockSpawn.x,
    airlockSpawn.z
  );
  assert.ok(Math.hypot(clampedAirlock.x - airlockSpawn.x, clampedAirlock.z - airlockSpawn.z) < 0.001);
  assert.equal(airlockSpawn.y, sampleSlopeHeight(airlockSpawn.x, airlockSpawn.z) + EVA_EYE_HEIGHT);
});

test('EVA walking accelerates with 0.38g inertia, damps at 0.88 per tick, and applies head-bob + strafe tilt', () => {
  let state = createInitialEvaState(sampleSlopeHeight, EVA_HUD_SPAWN);

  // Accelerate forward for 12 frames (~0.2s)
  for (let i = 0; i < 12; i++) {
    state = stepEvaPhysics(state, { forward: 1, right: 0, turn: 0 }, 1 / 60, sampleSlopeHeight);
  }
  const speedAfterAccel = Math.hypot(state.vx, state.vz);
  assert.ok(speedAfterAccel > 1.0);
  assert.ok(state.walkDistance > 0.1);
  assert.notEqual(state.bobOffset, 0);

  // Release keys -> velocity coasts down by 0.88 per 60Hz tick
  const vxBeforeCoast = state.vx;
  const vzBeforeCoast = state.vz;
  const nextTick = stepEvaPhysics(state, { forward: 0, right: 0, turn: 0 }, 1 / 60, sampleSlopeHeight);
  assert.ok(Math.abs(nextTick.vx - vxBeforeCoast * EVA_FRICTION) < 1e-4);
  assert.ok(Math.abs(nextTick.vz - vzBeforeCoast * EVA_FRICTION) < 1e-4);

  // Strafe right -> negative camera roll strafe tilt
  let strafeState = createInitialEvaState(sampleSlopeHeight, EVA_HUD_SPAWN);
  for (let i = 0; i < 10; i++) {
    strafeState = stepEvaPhysics(
      strafeState,
      { forward: 0, right: 1, turn: 0 },
      1 / 60,
      sampleSlopeHeight
    );
  }
  assert.ok(strafeState.strafeTilt < -0.005);

  // After coming to full rest on sloped terrain, eye Y equals terrainHeight + 1.75
  for (let i = 0; i < 90; i++) {
    strafeState = stepEvaPhysics(
      strafeState,
      { forward: 0, right: 0, turn: 0 },
      1 / 60,
      sampleSlopeHeight
    );
  }
  const expectedY = sampleSlopeHeight(strafeState.x, strafeState.z) + EVA_EYE_HEIGHT;
  assert.ok(Math.abs(strafeState.y - expectedY) < 0.002);
});

test('EVA perimeter clamp enforces 65-unit radius and blocks dome, solar array, rover, and boulder overlap', () => {
  // 65-unit perimeter clamp
  const edge = clampEvaPlayerPosition(55, 0, 95, 0);
  assert.ok(Math.hypot(edge.x, edge.z) <= EVA_MAX_RADIUS - EVA_PLAYER_RADIUS + 1e-4);

  // Cannot walk into Main Habitat Dome (center 0.9, 1.0, radius 3.45)
  const domePush = clampEvaPlayerPosition(0.9, 5.2, 0.9, 2.0);
  assert.ok(Math.hypot(domePush.x - 0.9, domePush.z - 1.0) >= 3.45 + EVA_PLAYER_RADIUS - 1e-3);

  // Cannot walk through Solar Array front row (x: -10.1..-3.5, z: 2.55..3.95)
  const solarPush = clampEvaPlayerPosition(-6.8, 4.5, -6.8, 3.7);
  assert.ok(solarPush.z >= 3.95 + EVA_PLAYER_RADIUS - 1e-3);

  // Cannot walk into dynamic boulder or moved rover
  const dynamicObstacles = [{ id: 'big_basalt', x: 15, z: 15, radius: 1.3 }];
  const boulderPush = clampEvaPlayerPosition(15, 18, 15, 15.1, dynamicObstacles, { x: -12, z: -12 });
  assert.ok(Math.hypot(boulderPush.x - 15, boulderPush.z - 15) >= 1.3 + EVA_PLAYER_RADIUS - 1e-3);

  const roverPush = clampEvaPlayerPosition(-12, -10, -12, -12.1, dynamicObstacles, { x: -12, z: -12 });
  assert.ok(Math.hypot(roverPush.x + 12, roverPush.z + 12) >= 1.05 + EVA_PLAYER_RADIUS - 1e-3);
});

test('EVA proximity prompts trigger within 3.5 units for Solar Array, Rover, Exterior MOXIE, and Airlock', () => {
  // Near Solar Array front row facing North (-Z)
  const solarPrompt = findNearestEvaInteractable(-6.8, 5.0, 0, -1);
  assert.ok(solarPrompt);
  assert.equal(solarPrompt.interactable.id, 'eva_solar');
  assert.equal(solarPrompt.interactable.promptLabel, '[E] Clean Solar Array');

  // Near Rover at moved position (12.0, -4.0) looking East (+X)
  const roverPrompt = findNearestEvaInteractable(9.4, -4.0, 1, 0, { x: 12.0, z: -4.0 });
  assert.ok(roverPrompt);
  assert.equal(roverPrompt.interactable.id, 'eva_rover');
  assert.equal(roverPrompt.interactable.promptLabel, '[E] Inspect Rover / Open FHAZ Cam');

  // Near Exterior MOXIE Unit (-3.7, -4.4 pad extends to z = -5.8) looking South (+Z)
  const moxiePrompt = findNearestEvaInteractable(-3.7, -7.2, 0, 1);
  assert.ok(moxiePrompt);
  assert.equal(moxiePrompt.interactable.id, 'eva_moxie');
  assert.equal(moxiePrompt.interactable.promptLabel, '[E] Service Exterior Intake');

  // Near Main Habitat Airlock Hatch (0.9, 3.88) looking North (-Z)
  const airlockPrompt = findNearestEvaInteractable(0.9, 5.2, 0, -1);
  assert.ok(airlockPrompt);
  assert.equal(airlockPrompt.interactable.id, 'eva_airlock');
  assert.equal(airlockPrompt.interactable.promptLabel, '[E] Enter Habitat Airlock');

  // Far out on Martian dunes returns null
  const farNone = findNearestEvaInteractable(25, 25, 0, -1);
  assert.equal(farNone, null);
});
