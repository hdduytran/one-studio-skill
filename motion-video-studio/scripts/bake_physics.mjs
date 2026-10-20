#!/usr/bin/env node
// Bake a Rapier rigid-body simulation to per-frame transforms (JSON) so a Remotion
// 3D scene can play it back deterministically (live physics is not frame-seekable).
//
// Usage: node bake_physics.mjs <project-dir> <sim.json> [--out public/physics/<name>.json]
// Needs in the project: npm i -D @dimforge/rapier3d-compat@0.19.2
//
// sim.json:
// { "fps": 30, "seconds": 4, "gravity": [0, -9.81, 0], "seed": 1,
//   "ground": { "y": 0, "size": [20, 20], "restitution": 0.3 },
//   "bodies": [
//     { "id": "a", "shape": "box", "size": [1,1,1], "position": [0,6,0], "rotation": [0.3,0,0.2],
//       "velocity": [0,0,0], "angularVelocity": [0,2,0], "restitution": 0.4, "friction": 0.6, "density": 1 },
//     { "id": "b", "shape": "ball", "radius": 0.5, "position": [0.5,9,0] } ],
//   "spawn": { "count": 20, "shape": "box", "size": [0.6,0.6,0.6], "area": [4, 4], "height": [6, 14] } }
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? ".");
const simPath = resolve(process.argv[3] ?? "sim.json");
const oi = process.argv.indexOf("--out");
const out = resolve(dir, oi > 0 ? process.argv[oi + 1] : `public/physics/${basename(simPath, ".json")}.json`);
const require = createRequire(join(dir, "package.json"));
let RAPIER;
try {
  const m = await import(require.resolve("@dimforge/rapier3d-compat"));
  RAPIER = m.default ?? m;
} catch {
  console.error("Missing dep. In the project run: npm i -D @dimforge/rapier3d-compat@0.19.2");
  process.exit(1);
}
await RAPIER.init();

const sim = JSON.parse(readFileSync(simPath, "utf8"));
const fps = sim.fps ?? 30;
const frames = Math.round((sim.seconds ?? 4) * fps);
const substeps = sim.substeps ?? 4;

// Seeded PRNG so "spawn" layouts are repeatable.
let s = sim.seed ?? 1;
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

const bodies = [...(sim.bodies ?? [])];
if (sim.spawn) {
  const sp = sim.spawn;
  for (let i = 0; i < sp.count; i++) {
    bodies.push({
      id: `s${i}`, shape: sp.shape ?? "box", size: sp.size, radius: sp.radius,
      position: [(rnd() - 0.5) * sp.area[0], sp.height[0] + rnd() * (sp.height[1] - sp.height[0]), (rnd() - 0.5) * sp.area[1]],
      rotation: [rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI],
      restitution: sp.restitution ?? 0.3, friction: sp.friction ?? 0.6,
    });
  }
}

const world = new RAPIER.World({ x: sim.gravity?.[0] ?? 0, y: sim.gravity?.[1] ?? -9.81, z: sim.gravity?.[2] ?? 0 });
world.timestep = 1 / (fps * substeps);
if (sim.ground) {
  const g = sim.ground;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid((g.size?.[0] ?? 20) / 2, 0.5, (g.size?.[1] ?? 20) / 2).setTranslation(0, (g.y ?? 0) - 0.5, 0).setRestitution(g.restitution ?? 0.3),
  );
}
const eulerToQuat = ([x, y, z]) => {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x / 2), Math.sin(x / 2), Math.cos(y / 2), Math.sin(y / 2), Math.cos(z / 2), Math.sin(z / 2)];
  return { x: sx * cy * cz + cx * sy * sz, y: cx * sy * cz - sx * cy * sz, z: cx * cy * sz + sx * sy * cz, w: cx * cy * cz - sx * sy * sz };
};
const handles = bodies.map((b) => {
  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(...b.position)
    .setRotation(eulerToQuat(b.rotation ?? [0, 0, 0]))
    .setLinvel(...(b.velocity ?? [0, 0, 0]))
    .setAngvel({ x: b.angularVelocity?.[0] ?? 0, y: b.angularVelocity?.[1] ?? 0, z: b.angularVelocity?.[2] ?? 0 });
  const rb = world.createRigidBody(desc);
  const col =
    b.shape === "ball"
      ? RAPIER.ColliderDesc.ball(b.radius ?? 0.5)
      : RAPIER.ColliderDesc.cuboid(...(b.size ?? [1, 1, 1]).map((v) => v / 2));
  world.createCollider(col.setRestitution(b.restitution ?? 0.3).setFriction(b.friction ?? 0.6).setDensity(b.density ?? 1), rb);
  return rb;
});

// frames[f][i] = [px,py,pz,qx,qy,qz,qw] rounded to keep the file small.
const r = (v) => Math.round(v * 1e4) / 1e4;
const track = [];
for (let f = 0; f < frames; f++) {
  track.push(handles.map((rb) => { const p = rb.translation(), q = rb.rotation(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w].map(r); }));
  for (let k = 0; k < substeps; k++) world.step();
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ fps, frames, bodies: bodies.map(({ id, shape, size, radius }) => ({ id, shape, size, radius })), track }));
console.log(`✓ baked ${bodies.length} bodies × ${frames} frames → ${out}`);
