// Dual-era archaeological model layer for Moreh Derech NEXT.
// GLB files are NOT bundled here: use only licensed, documented assets.
// Coordinates, scale and orientation MUST match between the two eras.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ERA_MODES = Object.freeze({ PRESENT:'present', ANCIENT:'ancient', COMPARE:'compare' });

function validateManifest(manifest) {
  if (!manifest || !manifest.present?.url || !manifest.ancient?.url) {
    throw new Error('Both present and ancient GLB URLs are required');
  }
  for (const era of ['present', 'ancient']) {
    const entry = manifest[era];
    if (!Array.isArray(entry.sources) || !entry.sources.length) {
      throw new Error(era + ' requires archaeological provenance');
    }
    if (typeof entry.url !== 'string' || !/\.glb(?:[?#].*)?$/i.test(entry.url)) {
      throw new Error(era + ' must reference a GLB file');
    }
  }
}

export class DualEraSite {
  constructor({scene, loader = new GLTFLoader()} = {}) {
    if (!scene) throw new Error('Three.js scene required');
    this.scene = scene;
    this.loader = loader;
    this.group = new THREE.Group();
    this.group.name = 'archaeology-dual-era';
    this.scene.add(this.group);
    this.mode = ERA_MODES.PRESENT;
    this.mix = 0.5;
    this.models = {};
    this.manifest = null;
    this.generation = 0;
  }

  async load(manifest) {
    validateManifest(manifest);
    const generation = ++this.generation;
    const [present, ancient] = await Promise.all([
      this.loader.loadAsync(manifest.present.url),
      this.loader.loadAsync(manifest.ancient.url)
    ]);
    if (generation !== this.generation) return false;
    this.clearModels();
    this.manifest = manifest;
    this.models = {present: present.scene, ancient: ancient.scene};
    for (const [era, model] of Object.entries(this.models)) {
      model.name = era;
      model.traverse(obj => {
        if (!obj.isMesh) return;
        obj.userData.archaeologicalEra = era;
        // Clone materials to avoid modifying cached/shared assets.
        if (Array.isArray(obj.material)) obj.material = obj.material.map(m => m.clone());
        else if (obj.material) obj.material = obj.material.clone();
      });
      this.group.add(model);
    }
    this.setMode(this.mode, this.mix);
    return true;
  }

  setMode(mode, mix = this.mix) {
    if (!Object.values(ERA_MODES).includes(mode)) throw new Error('Unknown era mode');
    this.mode = mode;
    this.mix = THREE.MathUtils.clamp(Number(mix) || 0, 0, 1);
    for (const [era, model] of Object.entries(this.models)) {
      model.visible = mode === ERA_MODES.COMPARE || mode === era;
      model.traverse(obj => {
        if (!obj.isMesh) return;
        const opacity = mode === ERA_MODES.COMPARE
          ? (era === 'present' ? 1 - this.mix : this.mix) : 1;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!mat) continue;
          mat.transparent = opacity < 1;
          mat.opacity = opacity;
          mat.depthWrite = opacity >= 1;
          mat.needsUpdate = true;
        }
      });
    }
  }

  getEvidence(era) {
    return this.manifest?.[era]?.sources || [];
  }

  clearModels() {
    for (const model of Object.values(this.models)) {
      this.group.remove(model);
      model.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => mat?.dispose());
        // GLTFLoader may share geometries: do not dispose them here.
      });
    }
    this.models = {};
  }

  dispose() {
    ++this.generation;
    this.clearModels();
    this.group.removeFromParent();
  }
}
