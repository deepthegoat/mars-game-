export type EvaInteractableId =
  | 'eva_solar'
  | 'eva_rover'
  | 'eva_moxie'
  | 'eva_airlock';

export interface EvaInteractable {
  id: EvaInteractableId;
  promptLabel: string;
  shortTitle: string;
  maxDistance: number;
}

export interface EvaCircleCollider {
  id: string;
  x: number;
  z: number;
  radius: number;
}

export interface EvaBoxCollider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface EvaPhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  pitch: number;
  walkDistance: number;
  bobOffset: number;
  strafeTilt: number;
}

export interface EvaMoveInput {
  forward: number;
  right: number;
  turn: number;
}

export const EVA_EYE_HEIGHT = 1.75;
export const EVA_PLAYER_RADIUS = 0.45;
export const EVA_MAX_RADIUS = 65;
export const EVA_FRICTION = 0.88; // Per 60Hz reference step damping
export const EVA_ACCEL = 32.0; // Weighted 0.38g Martian EVA suit acceleration
export const EVA_MAX_SPEED = 4.6;
export const EVA_INTERACT_RADIUS = 3.5;

// Default HUD spawn: open yard facing the sunlit Habitat Dome, Cyan Airlock, Solar Field & Rover
export const EVA_HUD_SPAWN = {
  x: 2.1,
  z: 9.2,
  yaw: 0.22,
};

// Airlock exit spawn: right outside Main Habitat Airlock porch facing open Martian terrain & Rover
export const EVA_AIRLOCK_SPAWN = {
  x: 0.9,
  z: 5.5,
  yaw: -2.2,
};

// Static exterior outpost obstacle footprint matching MarsOutpostScene.ts 1:1
export const EVA_STATIC_CIRCLE_COLLIDERS: EvaCircleCollider[] = [
  // Main Habitat Dome (Shelter) & airlock vestibule
  { id: 'shelter_dome', x: 0.9, z: 1.0, radius: 3.45 },
  { id: 'shelter_airlock', x: 0.9, z: 3.45, radius: 0.92 },
  // Hydroponic Bio-Dome
  { id: 'biodome', x: 6.8, z: 2.0, radius: 2.85 },
  // Pressurized connecting tunnels
  { id: 'tunnel_west_1', x: -0.6, z: -0.8, radius: 0.72 },
  { id: 'tunnel_west_2', x: -2.1, z: -2.6, radius: 0.72 },
  { id: 'tunnel_east_1', x: 3.1, z: 1.4, radius: 0.72 },
  { id: 'tunnel_east_2', x: 4.6, z: 1.6, radius: 0.72 },
  // Cryo Tank Rack & Comms Dish
  { id: 'tank_rack', x: -3.55, z: 4.35, radius: 1.25 },
  { id: 'comms_dish', x: 5.05, z: -4.1, radius: 1.15 },
  // Science Boulders
  { id: 'rock-delta', x: -9.4, z: 5.8, radius: 1.05 },
  { id: 'rock-olivine', x: -1.4, z: 5.8, radius: 1.05 },
  { id: 'rock-carbonate', x: 5.8, z: 5.6, radius: 1.0 },
  { id: 'rock-sulfate', x: 9.2, z: 4.4, radius: 1.0 },
];

export const EVA_STATIC_BOX_COLLIDERS: EvaBoxCollider[] = [
  // MOXIE Core concrete pad & generator housing (-3.7, -4.4)
  { id: 'moxie_pad', minX: -5.6, maxX: -1.8, minZ: -5.8, maxZ: -3.0 },
  // Solar Array Field front & rear panel rows (-6.8, 2.2)
  { id: 'solar_front_row', minX: -10.1, maxX: -3.5, minZ: 2.55, maxZ: 3.95 },
  { id: 'solar_rear_row', minX: -10.1, maxX: -3.5, minZ: 0.35, maxZ: 1.75 },
  // Solar junction box & battery housing
  { id: 'solar_junction', minX: -5.35, maxX: -3.85, minZ: 1.65, maxZ: 2.85 },
];

const EVA_INTERACTABLE_META: Record<EvaInteractableId, EvaInteractable> = {
  eva_solar: {
    id: 'eva_solar',
    promptLabel: '[E] Clean Solar Array',
    shortTitle: 'Solar Array Field',
    maxDistance: EVA_INTERACT_RADIUS,
  },
  eva_rover: {
    id: 'eva_rover',
    promptLabel: '[E] Inspect Rover / Open FHAZ Cam',
    shortTitle: 'Mars Utility Rover',
    maxDistance: EVA_INTERACT_RADIUS,
  },
  eva_moxie: {
    id: 'eva_moxie',
    promptLabel: '[E] Service Exterior Intake',
    shortTitle: 'Exterior MOXIE Unit',
    maxDistance: EVA_INTERACT_RADIUS,
  },
  eva_airlock: {
    id: 'eva_airlock',
    promptLabel: '[E] Enter Habitat Airlock',
    shortTitle: 'Main Habitat Airlock',
    maxDistance: 2.75,
  },
};

function clampVal(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function distanceToBox2D(
  px: number,
  pz: number,
  box: { minX: number; maxX: number; minZ: number; maxZ: number }
): { dist: number; cx: number; cz: number } {
  const cx = clampVal(px, box.minX, box.maxX);
  const cz = clampVal(pz, box.minZ, box.maxZ);
  return { dist: Math.hypot(px - cx, pz - cz), cx, cz };
}

function pushOutOfCircle(
  x: number,
  z: number,
  cx: number,
  cz: number,
  minDist: number
): { x: number; z: number } {
  const dx = x - cx;
  const dz = z - cz;
  const dist = Math.hypot(dx, dz);
  if (dist >= minDist) return { x, z };
  if (dist < 1e-4) {
    return { x: cx, z: cz + minDist };
  }
  const scale = minDist / dist;
  return {
    x: cx + dx * scale,
    z: cz + dz * scale,
  };
}

function pushOutOfBox(
  x: number,
  z: number,
  box: EvaBoxCollider,
  playerRadius: number
): { x: number; z: number } {
  const cx = clampVal(x, box.minX, box.maxX);
  const cz = clampVal(z, box.minZ, box.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const dist = Math.hypot(dx, dz);

  if (dist >= playerRadius) return { x, z };

  // Inside the AABB core -> push out along nearest edge normal
  if (dist < 1e-4) {
    const left = Math.abs(x - box.minX);
    const right = Math.abs(box.maxX - x);
    const top = Math.abs(z - box.minZ);
    const bottom = Math.abs(box.maxZ - z);
    const minEdge = Math.min(left, right, top, bottom);
    if (minEdge === left) return { x: box.minX - playerRadius, z };
    if (minEdge === right) return { x: box.maxX + playerRadius, z };
    if (minEdge === top) return { x, z: box.minZ - playerRadius };
    return { x, z: box.maxZ + playerRadius };
  }

  const scale = playerRadius / dist;
  return {
    x: cx + dx * scale,
    z: cz + dz * scale,
  };
}

export function clampEvaPlayerPosition(
  prevX: number,
  prevZ: number,
  nextX: number,
  nextZ: number,
  extraCircleObstacles: EvaCircleCollider[] = [],
  roverPos?: { x: number; z: number },
  playerRadius = EVA_PLAYER_RADIUS,
  maxRadius = EVA_MAX_RADIUS
): { x: number; z: number } {
  let x = nextX;
  let z = nextZ;

  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return { x: prevX, z: prevZ };
  }

  // Run two short solver passes so corners and neighboring boulders settle cleanly
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < EVA_STATIC_BOX_COLLIDERS.length; i++) {
      const res = pushOutOfBox(x, z, EVA_STATIC_BOX_COLLIDERS[i], playerRadius);
      x = res.x;
      z = res.z;
    }

    for (let i = 0; i < EVA_STATIC_CIRCLE_COLLIDERS.length; i++) {
      const obs = EVA_STATIC_CIRCLE_COLLIDERS[i];
      const res = pushOutOfCircle(x, z, obs.x, obs.z, obs.radius + playerRadius);
      x = res.x;
      z = res.z;
    }

    for (let i = 0; i < extraCircleObstacles.length; i++) {
      const obs = extraCircleObstacles[i];
      const res = pushOutOfCircle(x, z, obs.x, obs.z, obs.radius + playerRadius);
      x = res.x;
      z = res.z;
    }

    if (roverPos) {
      const res = pushOutOfCircle(x, z, roverPos.x, roverPos.z, 1.05 + playerRadius);
      x = res.x;
      z = res.z;
    }

    // Enforce 65-unit perimeter boundary around the outpost
    const r = Math.hypot(x, z);
    const allowedR = Math.max(1, maxRadius - playerRadius);
    if (r > allowedR) {
      const scale = allowedR / r;
      x *= scale;
      z *= scale;
    }
  }

  return { x, z };
}

export function createInitialEvaState(
  groundHeightFn: (x: number, z: number) => number,
  spawn: { x: number; z: number; yaw: number } = EVA_HUD_SPAWN
): EvaPhysicsState {
  const y = groundHeightFn(spawn.x, spawn.z) + EVA_EYE_HEIGHT;
  return {
    x: spawn.x,
    y,
    z: spawn.z,
    vx: 0,
    vz: 0,
    yaw: spawn.yaw,
    pitch: 0,
    walkDistance: 0,
    bobOffset: 0,
    strafeTilt: 0,
  };
}

export function stepEvaPhysics(
  state: EvaPhysicsState,
  input: EvaMoveInput,
  dt: number,
  groundHeightFn: (x: number, z: number) => number,
  extraCircleObstacles: EvaCircleCollider[] = [],
  roverPos?: { x: number; z: number }
): EvaPhysicsState {
  const safeDt = clampVal(dt, 0.0001, 0.05);
  let yaw = state.yaw;
  if (input.turn !== 0) {
    yaw -= input.turn * safeDt * 2.1;
  }

  const rawFwd = clampVal(input.forward, -1, 1);
  const rawRight = clampVal(input.right, -1, 1);
  const inputLen = Math.hypot(rawFwd, rawRight);
  const nf = inputLen > 1 ? rawFwd / inputLen : rawFwd;
  const nr = inputLen > 1 ? rawRight / inputLen : rawRight;

  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  const wishX = fwdX * nf + rightX * nr;
  const wishZ = fwdZ * nf + rightZ * nr;

  let vx = state.vx + wishX * EVA_ACCEL * safeDt;
  let vz = state.vz + wishZ * EVA_ACCEL * safeDt;

  // Frame-rate-independent 0.88 per-tick friction damping (at 60Hz reference)
  const damping = Math.pow(EVA_FRICTION, safeDt * 60);
  vx *= damping;
  vz *= damping;

  const speed = Math.hypot(vx, vz);
  if (speed > EVA_MAX_SPEED) {
    const scale = EVA_MAX_SPEED / speed;
    vx *= scale;
    vz *= scale;
  } else if (speed < 0.015 && inputLen < 0.01) {
    vx = 0;
    vz = 0;
  }

  const prevX = state.x;
  const prevZ = state.z;
  const nextX = prevX + vx * safeDt;
  const nextZ = prevZ + vz * safeDt;

  const clamped = clampEvaPlayerPosition(
    prevX,
    prevZ,
    nextX,
    nextZ,
    extraCircleObstacles,
    roverPos
  );

  // Dampen velocity component pushed back by an obstacle
  const movedX = clamped.x - prevX;
  const movedZ = clamped.z - prevZ;
  const stepDist = Math.hypot(movedX, movedZ);
  if (Math.hypot(nextX - clamped.x, nextZ - clamped.z) > 0.002) {
    vx = movedX / safeDt;
    vz = movedZ / safeDt;
  }

  const effectiveSpeed = Math.hypot(vx, vz);
  const speedFactor = clampVal(effectiveSpeed / EVA_MAX_SPEED, 0, 1);
  const walkDistance = state.walkDistance + stepDist;

  // Weighted Martian stride head-bob & subtle lateral strafe roll tilt
  let bobOffset = state.bobOffset;
  if (stepDist > 0.0004 && speedFactor > 0.04) {
    const targetBob = Math.sin(walkDistance * 2.15) * 0.048 * speedFactor;
    bobOffset = bobOffset + (targetBob - bobOffset) * Math.min(1, safeDt * 14);
  } else {
    bobOffset = bobOffset + (0 - bobOffset) * Math.min(1, safeDt * 10);
  }

  const targetTilt = -nr * 0.024 * (0.35 + 0.65 * speedFactor);
  const strafeTilt = state.strafeTilt + (targetTilt - state.strafeTilt) * Math.min(1, safeDt * 9);

  const terrainY = groundHeightFn(clamped.x, clamped.z);

  return {
    x: clamped.x,
    y: terrainY + EVA_EYE_HEIGHT + bobOffset,
    z: clamped.z,
    vx,
    vz,
    yaw,
    pitch: state.pitch,
    walkDistance,
    bobOffset,
    strafeTilt,
  };
}

export function findNearestEvaInteractable(
  playerX: number,
  playerZ: number,
  lookDirX: number,
  lookDirZ: number,
  roverPos: { x: number; z: number } = { x: 3.6, z: 4.4 }
): { interactable: EvaInteractable; distance: number } | null {
  const lookLen = Math.hypot(lookDirX, lookDirZ);
  const lx = lookLen > 1e-4 ? lookDirX / lookLen : 0;
  const lz = lookLen > 1e-4 ? lookDirZ / lookLen : -1;

  const candidates: Array<{
    id: EvaInteractableId;
    dist: number;
    tx: number;
    tz: number;
  }> = [];

  // 1. Solar Array Field footprint (-10.1..-3.5, 0.35..3.95)
  const solarMeasure = distanceToBox2D(playerX, playerZ, {
    minX: -10.1,
    maxX: -3.5,
    minZ: 0.35,
    maxZ: 3.95,
  });
  candidates.push({
    id: 'eva_solar',
    dist: solarMeasure.dist,
    tx: solarMeasure.cx,
    tz: solarMeasure.cz,
  });

  // 2. Live Mars Utility Rover position
  const roverDist = Math.hypot(roverPos.x - playerX, roverPos.z - playerZ);
  candidates.push({
    id: 'eva_rover',
    dist: roverDist,
    tx: roverPos.x,
    tz: roverPos.z,
  });

  // 3. Exterior MOXIE Intake footprint (-5.6..-1.8, -5.8..-3.0)
  const moxieMeasure = distanceToBox2D(playerX, playerZ, {
    minX: -5.6,
    maxX: -1.8,
    minZ: -5.8,
    maxZ: -3.0,
  });
  candidates.push({
    id: 'eva_moxie',
    dist: moxieMeasure.dist,
    tx: moxieMeasure.cx,
    tz: moxieMeasure.cz,
  });

  // 4. Main Habitat Airlock Hatch (0.9, 3.88)
  const airlockX = 0.9;
  const airlockZ = 3.88;
  const airlockDist = Math.hypot(airlockX - playerX, airlockZ - playerZ);
  candidates.push({
    id: 'eva_airlock',
    dist: airlockDist,
    tx: airlockX,
    tz: airlockZ,
  });

  let best: { interactable: EvaInteractable; distance: number; score: number } | null = null;

  for (const c of candidates) {
    const meta = EVA_INTERACTABLE_META[c.id];
    if (c.dist > meta.maxDistance) continue;

    const toX = c.tx - playerX;
    const toZ = c.tz - playerZ;
    const toLen = Math.hypot(toX, toZ);
    const dot = toLen > 1e-4 ? (toX / toLen) * lx + (toZ / toLen) * lz : 1;

    // Allow interaction when facing roughly toward the object or standing right beside it
    if (dot < -0.1 && c.dist > 2.1) continue;

    const score = dot * 1.8 - c.dist * 0.6;
    if (!best || score > best.score) {
      best = { interactable: meta, distance: c.dist, score };
    }
  }

  return best ? { interactable: best.interactable, distance: best.distance } : null;
}
