// Mondes 3D — déplacement à pied (1re personne) et caméra libre.
// Collisions : rayons contre les maillages de collision accélérés par three-mesh-bvh (MIT) : murs (glissement), sol, marches ≤ 0,6 m, gravité.
// Commandes : WASD/flèches + souris (verrouillage du pointeur) sur ordinateur ; joystick virtuel + glisser pour regarder sur téléphone.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from '../vendor/three-mesh-bvh/three-mesh-bvh.module.js';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const EYE = 1.65, RADIUS = 0.35, STEP = 0.6, WALK = 2.4, RUN = 5, G = 18;

export class Player {
  constructor(camera, dom, opts = {}) {
    this.camera = camera; this.dom = dom; this.bounds = opts.bounds; this.heightFn = opts.height;
    this.pos = new THREE.Vector3(); this.vy = 0; this.yaw = 0; this.pitch = -0.05;
    this.mode = 'walk'; this.colliders = []; this.keys = {}; this.joy = { x: 0, y: 0 }; this.run = false;
    this.ray = new THREE.Raycaster(); this.ray.firstHitOnly = true;
    this.orbit = new OrbitControls(camera, dom); this.orbit.enabled = false; this.orbit.enableDamping = true; this.orbit.maxPolarAngle = Math.PI * 0.495; this.orbit.minDistance = 3; this.orbit.maxDistance = 220;
    this.onSelect = null; this.locked = false;
    this._bind();
  }
  setColliders(meshes) {
    this.colliders = meshes.filter(m => m.isMesh && !m.isInstancedMesh);
    this.colliders.forEach(m => { if (!m.geometry.boundsTree) m.geometry.computeBoundsTree(); });
  }
  place(pos, yaw, pitch = -0.05) { this.pos.set(pos[0], pos[1], pos[2]); this.yaw = yaw; this.pitch = pitch; this.vy = 0; this.snapGround(true); this.apply(); }
  setMode(m) {
    if (m === this.mode) return; this.mode = m;
    if (m === 'fly') {
      if (document.pointerLockElement) document.exitPointerLock();
      const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-1);
      this.orbit.target.copy(this.pos).addScaledVector(dir, 25).setY(4);
      this.camera.position.set(this.pos.x, this.pos.y + 40, this.pos.z).addScaledVector(dir, -20);
      this.orbit.enabled = true; this.orbit.update();
    } else {
      this.orbit.enabled = false;
      const t = this.orbit.target; this.pos.set(t.x, 30, t.z); this.snapGround(true);
      const d = new THREE.Vector3().subVectors(t, this.camera.position); this.yaw = Math.atan2(-d.x, -d.z); this.pitch = -0.05; this.apply();
    }
  }
  flyTo(target, from) { this.setMode('fly'); this.orbit.target.copy(target); this.camera.position.copy(from); this.orbit.update(); }
  _bind() {
    const d = this.dom;
    addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; this.keys[e.code] = true; if (e.code === 'KeyE' && this.locked && this.onSelect) this.onSelect(null); });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.joy.x = this.joy.y = 0; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === d; });
    d.addEventListener('mousemove', e => { if (this.mode === 'walk' && this.locked) this.look(e.movementX, e.movementY, 0.0022); });
    // tactile et souris sans verrouillage : joystick à gauche, regard à droite, tap = sélection
    const touches = new Map();
    d.addEventListener('pointerdown', e => {
      d.setPointerCapture(e.pointerId);
      const left = e.pointerType === 'touch' && e.clientX < innerWidth * 0.42 && e.clientY > innerHeight * 0.35;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), joy: left && this.mode === 'walk', moved: 0 });
      if (left && this.mode === 'walk' && this.joyEl) { this.joyEl.hidden = false; this.joyEl.style.transform = `translate(${e.clientX - 60}px,${e.clientY - 60}px)`; }
    });
    d.addEventListener('pointermove', e => {
      const t = touches.get(e.pointerId); if (!t) return;
      const dx = e.clientX - t.x, dy = e.clientY - t.y; t.x = e.clientX; t.y = e.clientY; t.moved += Math.abs(dx) + Math.abs(dy);
      if (t.joy) { const jx = e.clientX - t.x0, jy = e.clientY - t.y0, l = Math.min(1, Math.hypot(jx, jy) / 55), a = Math.atan2(jy, jx);
        this.joy.x = Math.cos(a) * l; this.joy.y = Math.sin(a) * l; this.run = l > 0.95 && Math.hypot(jx, jy) > 75;
        if (this.knobEl) this.knobEl.style.transform = `translate(${Math.cos(a) * l * 40}px,${Math.sin(a) * l * 40}px)`; }
      else if (this.mode === 'walk' && !this.locked) this.look(dx, dy, e.pointerType === 'touch' ? 0.0042 : 0.003);
    });
    const end = e => {
      const t = touches.get(e.pointerId); if (!t) return; touches.delete(e.pointerId);
      if (t.joy) { this.joy.x = this.joy.y = 0; this.run = false; if (this.joyEl) this.joyEl.hidden = true; if (this.knobEl) this.knobEl.style.transform = ''; }
      else if (t.moved < 10 && performance.now() - t.t < 450 && this.onSelect) {
        if (this.mode === 'walk' && e.pointerType === 'mouse' && !this.locked && this.wantLock) { d.requestPointerLock?.(); return; }
        this.onSelect(this.locked ? null : { x: e.clientX, y: e.clientY });
      }
    };
    d.addEventListener('pointerup', end); d.addEventListener('pointercancel', end);
  }
  look(dx, dy, k) { this.yaw -= dx * k; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.35, 1.25); }
  apply() { this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z); this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); }
  groundAt(x, y, z, up = STEP + 0.05) {
    this.ray.set(new THREE.Vector3(x, y + up, z), new THREE.Vector3(0, -1, 0)); this.ray.far = y + up + 20;
    const h = this.ray.intersectObjects(this.colliders, false)[0];
    const terr = this.heightFn ? this.heightFn(x, z) : 0;
    return h ? Math.max(h.point.y, terr) : terr;
  }
  snapGround(force) { const g = this.groundAt(this.pos.x, force ? 80 : this.pos.y, this.pos.z, force ? 0 : STEP + 0.05); if (force || this.pos.y <= g + 0.01) { this.pos.y = g; this.vy = 0; } }
  blocked(from, dir, dist) {
    for (const h of [STEP + 0.05, 1.1, 1.6]) {
      this.ray.set(new THREE.Vector3(from.x, from.y + h, from.z), dir); this.ray.far = dist + RADIUS;
      const hit = this.ray.intersectObjects(this.colliders, false)[0];
      // une marche (dessus à moins de STEP au-dessus des pieds) n'est pas un mur
      if (hit) { const g = this.groundAt(hit.point.x + dir.x * 0.12, from.y, hit.point.z + dir.z * 0.12, 2.6); if (g - from.y > STEP) return hit; }
    }
    return null;
  }
  update(dt) {
    dt = Math.min(dt, 0.05);
    if (this.mode === 'fly') { this.orbit.update(); return; }
    const k = this.keys, f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - this.joy.y, s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + this.joy.x;
    if (k.KeyQ) this.yaw += dt * 1.6; if (k.KeyR) this.yaw -= dt * 1.6;
    const sp = (k.ShiftLeft || k.ShiftRight || this.run ? RUN : WALK);
    const fw = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), rt = new THREE.Vector3(-fw.z, 0, fw.x);
    const mv = fw.multiplyScalar(f).add(rt.multiplyScalar(s)); const len = Math.min(1, mv.length());
    if (len > 0.01) {
      mv.normalize(); let dist = sp * len * dt;
      for (let it = 0; it < 2 && dist > 1e-4; it++) {
        const hit = this.blocked(this.pos, mv, dist);
        if (!hit) { this.tryMove(mv, dist); break; }
        const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : mv.clone().negate(); n.y = 0; n.normalize();
        const free = Math.max(0, hit.distance - RADIUS); if (free > 0.01) this.tryMove(mv, free);
        mv.addScaledVector(n, -mv.dot(n)); dist = (dist - free) * mv.length(); if (mv.lengthSq() < 1e-4) break; mv.normalize();
      }
    }
    // gravité / marches
    const g = this.groundAt(this.pos.x, this.pos.y, this.pos.z);
    if (this.pos.y > g + 0.02) { this.vy -= G * dt; this.pos.y = Math.max(g, this.pos.y + this.vy * dt); if (this.pos.y === g) this.vy = 0; } else { this.pos.y = g; this.vy = 0; }
    const b = this.bounds; if (b) { this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX); this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ); }
    this.apply();
  }
  tryMove(dir, d) {
    const nx = this.pos.x + dir.x * d, nz = this.pos.z + dir.z * d, g = this.groundAt(nx, this.pos.y, nz, 2.6);
    if (g - this.pos.y > STEP) return false;            // marche trop haute : bloqué
    this.pos.x = nx; this.pos.z = nz; if (g > this.pos.y) this.pos.y = g; return true;
  }
  fwd() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
}
