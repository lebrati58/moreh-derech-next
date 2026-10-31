// Mondes 3D — environnement : ciel physique + éclairage d'ambiance HDR (Poly Haven CC0), soleil méditerranéen avec ombres,
// terrain sableux avec plage, mer animée (shader), mouettes. Rien n'est une image plaquée : tout est géométrie et shaders.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { pbr, hdriUrl } from './materials.js';

export async function buildEnvironment({ renderer, scene, Q, plan, manager }) {
  const out = { update() {} };
  // Soleil de fin de matinée, au sud-est : la façade de scène (tournée vers l'est) et les gradins sont éclairés.
  const elev = THREE.MathUtils.degToRad(40), azim = THREE.MathUtils.degToRad(125);
  const sunDir = new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), -Math.cos(azim) * Math.cos(elev)).normalize();
  sunDir.set(0.58, Math.sin(elev), 0.52).normalize();
  const sky = new Sky(); sky.scale.setScalar(4000); scene.add(sky);
  const u = sky.material.uniforms; u.turbidity.value = 3.2; u.rayleigh.value = 1.1; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82; u.sunPosition.value.copy(sunDir);
  scene.fog = new THREE.Fog('#c9d8e6', 140, Q.far);

  // Éclairage d'ambiance : HDRI CC0 si présent, sinon le ciel procédural.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const url = hdriUrl();
  try {
    if (!url) throw new Error('no hdr');
    const hdr = await new RGBELoader(manager).loadAsync(url);
    scene.environment = pmrem.fromEquirectangular(hdr).texture; hdr.dispose(); out.envSource = 'hdri';
  } catch (e) {
    const s2 = new THREE.Scene(); const sk = new Sky(); sk.scale.setScalar(1000); Object.assign(sk.material.uniforms.sunPosition, { value: sunDir.clone() }); s2.add(sk);
    scene.environment = pmrem.fromScene(s2).texture; out.envSource = 'sky';
  }
  scene.environmentIntensity = 0.55;

  const sun = new THREE.DirectionalLight('#fff1d8', 2.6); sun.position.copy(sunDir).multiplyScalar(120);
  sun.castShadow = Q.shadows;
  if (Q.shadows) { sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap); const c = sun.shadow.camera; c.left = c.bottom = -75; c.right = c.top = 75; c.near = 10; c.far = 320; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; }
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#dfe9f5', '#b49a72', 0.35));
  out.sun = sun; out.sunDir = sunDir;

  // Terrain : sol plat autour du théâtre, dunes au-delà, plage puis fond marin.
  const T = new THREE.PlaneGeometry(700, 700, Q.detail >= 1 ? 180 : 110, Q.detail >= 1 ? 180 : 110); T.rotateX(-Math.PI / 2);
  const p = T.attributes.position, shore = plan.shoreX;
  const n2 = (x, z) => Math.sin(x * 0.045) * Math.cos(z * 0.052) + 0.5 * Math.sin(x * 0.11 + z * 0.07) + 0.25 * Math.sin(x * 0.23 - z * 0.19);
  out.height = (x, z) => {
    if (x < shore + 10) { const t = THREE.MathUtils.clamp((shore + 10 - x) / 22, 0, 1); return -2.1 * t * t - (x < shore - 20 ? (shore - 20 - x) * 0.04 : 0); }
    const d = Math.hypot(x, z), far = THREE.MathUtils.clamp((d - 80) / 50, 0, 1);
    return far * (1.4 + 1.6 * n2(x, z)) * (x > shore + 25 ? 1 : (x - shore - 10) / 15);
  };
  for (let i = 0; i < p.count; i++) p.setY(i, out.height(p.getX(i), p.getZ(i)));
  T.computeVertexNormals();
  const uv = T.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  const ground = new THREE.Mesh(T, pbr('sand', { tile: 7, tint: '#f6e7c8', normal: 0.8, gain: 1.35 })); ground.receiveShadow = true; ground.userData = { tag: 'ground' };
  scene.add(ground); out.ground = ground;

  // Mer : shader (vagues, Fresnel, reflet du soleil, écume au rivage). Pas de simulation physique.
  const seaMat = new THREE.ShaderMaterial({
    transparent: true, fog: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: sunDir }, uShore: { value: shore }, uDeep: { value: new THREE.Color('#0f5677') }, uShallow: { value: new THREE.Color('#3fa6b0') },
      uSky: { value: new THREE.Color('#bcd6ea') }, uZen: { value: new THREE.Color('#5d8fc4') }, uFog: { value: new THREE.Color('#c9d8e6') }, uFar: { value: Q.far }, uQ: { value: Q.water } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime,uShore,uFar,uQ; uniform vec3 uSun,uDeep,uShallow,uSky,uZen,uFog; varying vec3 vW;
      float h(vec2 p){ return sin(p.x*.21+uTime*1.1)*.5+sin(p.y*.17-uTime*.9)*.5+sin((p.x+p.y)*.37+uTime*1.7)*.25+sin((p.x*.8-p.y)*.71-uTime*2.3)*.12*uQ+sin((p.x*1.9+p.y*1.3)+uTime*3.1)*.06*uQ; }
      void main(){ vec2 q=vW.xz; float e=.25; vec3 N=normalize(vec3(-(h(q+vec2(e,0.))-h(q-vec2(e,0.)))*.35,1.,-(h(q+vec2(0.,e))-h(q-vec2(0.,e)))*.35));
        vec3 V=normalize(cameraPosition-vW); float fr=.03+.97*pow(1.-max(dot(N,V),0.),5.); vec3 R=reflect(-V,N);
        vec3 refl=mix(uSky,uZen,clamp(R.y*1.6,0.,1.)); float depth=clamp((uShore-vW.x)/90.,0.,1.); vec3 base=mix(uShallow,uDeep,depth);
        vec3 col=mix(base,refl,fr*.85); col+=vec3(1.,.95,.85)*pow(max(dot(R,normalize(uSun)),0.),220.)*3.;
        float foam=smoothstep(7.,0.,uShore-vW.x)*(.55+.45*sin(vW.z*.35+uTime*1.3+h(q)*2.)); col=mix(col,vec3(.96),clamp(foam,0.,1.)*.75);
        float d=length(cameraPosition-vW); col=mix(col,uFog,clamp((d-140.)/(uFar-140.),0.,1.));
        gl_FragColor=vec4(col,mix(.82,.97,depth));
#include <colorspace_fragment>

      }`
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200, 1, 1), seaMat); sea.rotateX(-Math.PI / 2); sea.position.set(shore - 1100 + 4, -0.6, 0); sea.userData = { tag: 'sea', era: 'both' };
  scene.add(sea); out.sea = sea;

  // Mouettes : quelques silhouettes animées au-dessus de la mer.
  const gulls = [];
  const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.45, 0.05, 0.12, -0.45, 0.05, -0.12, 0, 0, 0, 0.45, 0.05, 0.12, 0.45, 0.05, -0.12].map((v, i) => v), 3)); wing.setIndex([0, 1, 2, 3, 5, 4]);
  wing.computeVertexNormals();
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(wing, new THREE.MeshStandardMaterial({ color: '#f4f4f2', side: THREE.DoubleSide })); m.scale.setScalar(1.6); scene.add(m); gulls.push({ m, r: 30 + i * 9, h: 14 + (i % 3) * 4, s: 0.12 + (i % 4) * 0.03, o: i * 1.7, cx: shore - 25 - i * 6, cz: -30 + i * 9 }); }

  out.update = (t, focus) => {
    seaMat.uniforms.uTime.value = t;
    gulls.forEach(g => { const a = t * g.s + g.o; g.m.position.set(g.cx + Math.cos(a) * g.r, g.h + Math.sin(t * .7 + g.o) * 1.2, g.cz + Math.sin(a) * g.r); g.m.rotation.y = -a; const f = Math.sin(t * 8 + g.o) * 0.5; g.m.scale.y = 1.6 + f; });
    if (focus && sun.castShadow) { const fx = Math.round(focus.x / 8) * 8, fz = Math.round(focus.z / 8) * 8; sun.target.position.set(fx, 0, fz); sun.position.set(fx, 0, fz).addScaledVector(sunDir, 120); }
  };
  return out;
}
