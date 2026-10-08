import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RampPrim } from '../config/map';
import { WORLD } from '../config/map';
import { rampHeight } from '../sim/systems/world';
import { NIGHT_GLOW } from './nightGlow';

/**
 * v10: the stone stairs up 上野の山 were unreadable at night (the hill has no street lamps).
 * Minimal light, drawn only (no lamp is added to the night rules): a dim lit nosing on every
 * tread so the steps read as steps, and three pairs of low stone lanterns along the sides.
 * Warm white, low saturation: never a faction colour.
 */
export function buildStairLights(scene: THREE.Scene): void {
  const stairs = WORLD.filter((p): p is RampPrim => p.kind === 'ramp' && p.style === 'stairs' && p.group === 'hill');
  const nosings: THREE.BufferGeometry[] = [], posts: THREE.BufferGeometry[] = [], heads: THREE.BufferGeometry[] = [];
  for (const p of stairs) {
    const along = p.axis === 'z';
    const len = along ? p.d : p.w, wide = along ? p.w : p.d;
    // Same tread count as the drawn stairs (sceneBuilder: a riser of ~4.5 units).
    const n = Math.max(3, Math.round((p.hHigh - p.hLow) / 4.5));
    const at = (u: number, side: number) => {
      // u: 0 at the foot … 1 at the top; side: across, from the centre line.
      const off = (p.dir === 1 ? u - 0.5 : 0.5 - u) * len;
      return along ? { x: p.x + side, z: p.z + off } : { x: p.x + off, z: p.z + side };
    };
    for (let i = 0; i < n; i++) {
      const h = p.hLow + ((p.hHigh - p.hLow) * (i + 1)) / n;
      const c = at(i / n, 0); // the front edge of tread i
      const g = new THREE.BoxGeometry(along ? wide - 16 : 2.2, 0.7, along ? 2.2 : wide - 16);
      g.translate(c.x, h + 0.36, c.z);
      nosings.push(g);
    }
    for (const u of [0.04, 0.5, 0.96]) for (const s of [-1, 1]) {
      const c = at(u, s * (wide / 2 + 9));
      const y = rampHeight(p, at(u, 0).x, at(u, 0).z);
      posts.push(new THREE.BoxGeometry(9, 26, 9).translate(c.x, y + 13, c.z), new THREE.BoxGeometry(15, 3, 15).translate(c.x, y + 27.5, c.z));
      heads.push(new THREE.BoxGeometry(11, 8, 11).translate(c.x, y + 33, c.z), new THREE.BoxGeometry(17, 3, 17).translate(c.x, y + 38.5, c.z));
    }
  }
  if (!stairs.length) return;
  const nosing = new THREE.MeshBasicMaterial({ color: 0xfff0d8, transparent: true, opacity: 0.25 });
  const warm = new THREE.Color(0xfff0d8), head = new THREE.MeshBasicMaterial({ color: warm });
  const stone = new THREE.MeshStandardMaterial({ color: 0x6d675e, roughness: 0.95 });
  scene.add(new THREE.Mesh(mergeGeometries(nosings)!, nosing), new THREE.Mesh(mergeGeometries(posts)!, stone), new THREE.Mesh(mergeGeometries(heads)!, head));
  // By day the nosings are just a paler stone edge; after dark they glow softly.
  NIGHT_GLOW.push({ set: (k) => { nosing.opacity = 0.2 + 0.55 * k; head.color.copy(warm).multiplyScalar(0.75 + 0.25 * k); } });
}
