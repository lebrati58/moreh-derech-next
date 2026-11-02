// Moreh Derech NEXT — « אדריכלות קלאסית » : constructeurs des 14 maquettes schématiques (three.js du dépôt).
// Chaque constructeur remplit le groupe G ; les maillages étiquetés (TAGS[étiquette]) sont surlignés quand on choisit un élément.
// Les étiquettes et positions des repères sont dans architecture/data.json (champ t / p).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// ---------- helpers ----------
const C={lime:0xE8DFCC,lime2:0xD2C4A8,lime3:0xBFAF90,marble:0xF4F1EA,basalt:0x55535A,terra:0xB5653F,sand:0xDCC48F,water:0x4F8FA8,dark:0x2A2522,bronze:0x8C6A3A,olive:0x8E9A62,red:0x9A3B3B,blue:0x3E6E8E,wood:0x7A5A3C,straw:0xC9A35E,must:0x5A1E3A,oil:0xC9A227,mash:0x5D5A2E,grape:0x5B2A55};
const MAT={};const mat=c=>MAT[c]||(MAT[c]=new THREE.MeshStandardMaterial({color:c,roughness:.85}));
let G,TAGS,UPD;
function T(m,tag){if(!tag)return m;m.material=m.material.clone();(TAGS[tag]||(TAGS[tag]=[])).push(m);return m}
function add(m,tag,parent){m.castShadow=m.receiveShadow=true;(parent||G).add(m);return T(m,tag)}
function box(w,h,d,x,y,z,c,tag){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),typeof c==="number"?mat(c):c);m.position.set(x,y+h/2,z);return add(m,tag)}
function cyl(r,h,x,y,z,c,tag,seg=18,r2){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r2??r,h,seg),typeof c==="number"?mat(c):c);m.position.set(x,y+h/2,z);return add(m,tag)}
function column(x,z,y0,h,r,c,tags){const tb=typeof tags==="string"?{b:tags,s:tags,c:tags}:(tags||{});
  cyl(r*1.3,.28,x,y0,z,c,tb.b);cyl(r,h-.28-.42,x,y0+.28,z,c,tb.s,16,r*1.08);box(r*2.5,.42,r*2.5,x,y0+h-.42,z,c,tb.c)}
function emis(m,c){m.material=m.material.clone();m.material.emissive=new THREE.Color(c);m.material.emissiveIntensity=1;return m}
function lathe(pts,phiS,phiL,c,tag,seg=48){const g=new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p[0],p[1])),seg,phiS,phiL);
  const m=new THREE.Mesh(g,mat(c).clone());m.material.side=THREE.DoubleSide;return add(m,tag)}
function steps(r0,y0,n,w,rise,list){let r=r0,y=y0;for(let i=0;i<n;i++){y+=rise;list.push([r,y]);r+=w;list.push([r,y])}return[r,y]}
function canvasTex(draw,s=256,rep=[1,1]){const cv=document.createElement("canvas");cv.width=cv.height=s;draw(cv.getContext("2d"),s);
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep[0],rep[1]);return t}
function texMat(tex){return new THREE.MeshStandardMaterial({map:tex,roughness:.9})}
const paving=()=>canvasTex((g,s)=>{g.fillStyle="#8f8676";g.fillRect(0,0,s,s);for(let y=0;y<s;y+=32)for(let x=-(y/32%2)*24;x<s;x+=48){g.fillStyle=`hsl(38,${10+Math.random()*8}%,${55+Math.random()*12}%)`;g.fillRect(x+2,y+2,44,28)}},256,[6,1.5]);
const mosaic=()=>canvasTex((g,s)=>{g.fillStyle="#efe6d2";g.fillRect(0,0,s,s);const u=s/8;for(let i=0;i<8;i++)for(let j=0;j<8;j++){const cx=i*u+u/2,cy=j*u+u/2;
  g.strokeStyle="#7B1E3E";g.lineWidth=3;g.strokeRect(i*u+4,j*u+4,u-8,u-8);g.fillStyle=(i+j)%2?"#3E6E8E":"#A97A1F";g.beginPath();g.moveTo(cx,cy-u/4);g.lineTo(cx+u/4,cy);g.lineTo(cx,cy+u/4);g.lineTo(cx-u/4,cy);g.fill()}},256,[4,3]);
const flutes=()=>canvasTex((g,s)=>{for(let i=0;i<20;i++){const x=i*s/20;const gr=g.createLinearGradient(x,0,x+s/20,0);gr.addColorStop(0,"#d9d2c2");gr.addColorStop(.5,"#f6f2ea");gr.addColorStop(1,"#c8bfad");g.fillStyle=gr;g.fillRect(x,0,s/20,s)}},256,[1,1]);
const zodiac=()=>canvasTex((g,s)=>{g.fillStyle="#efe6d2";g.fillRect(0,0,s*2,s);
  const W=s*2;for(let x=0;x<W;x+=32)for(let y=0;y<s;y+=32){g.strokeStyle="#A97A1F";g.lineWidth=2;g.strokeRect(x+4,y+4,24,24)}
  const cx=W/2,cy=s/2,R=s*.42;g.fillStyle="#f6efe0";g.fillRect(cx-R-8,cy-R-8,2*R+16,2*R+16);g.strokeStyle="#7B1E3E";g.lineWidth=4;g.strokeRect(cx-R-8,cy-R-8,2*R+16,2*R+16);
  g.beginPath();g.arc(cx,cy,R,0,7);g.fillStyle="#E6D3A8";g.fill();g.stroke();
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;g.beginPath();g.moveTo(cx+Math.cos(a)*R*.42,cy+Math.sin(a)*R*.42);g.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);g.stroke();
    g.fillStyle=i%2?"#3E6E8E":"#9A3B3B";g.beginPath();g.arc(cx+Math.cos(a+.26)*R*.72,cy+Math.sin(a+.26)*R*.72,7,0,7);g.fill()}
  g.beginPath();g.arc(cx,cy,R*.42,0,7);g.fillStyle="#C9A227";g.fill();g.stroke();
  for(const[dx,dy]of[[-1,-1],[1,-1],[1,1],[-1,1]]){g.fillStyle="#55663A";g.beginPath();g.arc(cx+dx*(R-6),cy+dy*(R-6),10,0,7);g.fill()}
},256,[1,1]);
function flat(w,d,x,y,z,material,tag){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),material);m.rotation.x=-Math.PI/2;m.position.set(x,y,z);m.receiveShadow=true;G.add(m);return T(m,tag)}
function seg(a,b,w,h,c,tag,y=0){const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz);const m=box(L,h,w,(a[0]+b[0])/2,y,(a[1]+b[1])/2,c,tag);m.rotation.y=-Math.atan2(dz,dx);return m}
function road(a,b,tag,c=C.marble,w=.42,gap=.6,cr=.04,ch=.4){seg(a,b,w,.05,c,tag);const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),nx=-dz/L,nz=dx/L;
  for(let t=.3;t<L;t+=gap){const x=a[0]+dx*t/L,z=a[1]+dz*t/L;cyl(cr,ch,x+nx*(w/2+.05),.05,z+nz*(w/2+.05),C.marble,tag,6);cyl(cr,ch,x-nx*(w/2+.05),.05,z-nz*(w/2+.05),C.marble,tag,6)}}
function archShape(w,h,ops){const s=new THREE.Shape();s.moveTo(-w/2,0);
  for(const o of ops){s.lineTo(o.c-o.ow/2,0);s.lineTo(o.c-o.ow/2,o.sh);s.absarc(o.c,o.sh,o.ow/2,Math.PI,0,true);s.lineTo(o.c+o.ow/2,0)}
  s.lineTo(w/2,0);s.lineTo(w/2,h);s.lineTo(-w/2,h);s.closePath();return s}
function extr(shape,depth,c,tag){const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false});g.translate(0,0,-depth/2);const m=new THREE.Mesh(g,mat(c));return add(m,tag)}
function amphora(x,y,z,tag){const pts=[[0,0],[.12,.02],[.2,.25],[.28,.6],[.26,.95],[.12,1.12],[.09,1.3],[.11,1.36],[0,1.36]];const m=lathe(pts,0,Math.PI*2,C.terra,tag,16);m.position.set(x,y,z);return m}
function flowParticles(path,n,color,speed,size=.11){const pm=new THREE.MeshBasicMaterial({color});const pg=new THREE.SphereGeometry(size,8,6);
  const segs=[];let L=0;for(let i=0;i<path.length-1;i++){const a=new THREE.Vector3(...path[i]),b=new THREE.Vector3(...path[i+1]);const l=a.distanceTo(b);segs.push({a,b,l,s:L});L+=l}
  const P=[];for(let i=0;i<n;i++){const s=new THREE.Mesh(pg,pm);G.add(s);P.push({s,o:i/n})}
  return t=>{for(const p of P){const d=((t*speed/L+p.o)%1)*L;const sg=segs.find(q=>d>=q.s&&d<=q.s+q.l)||segs[segs.length-1];p.s.position.copy(sg.a).lerp(sg.b,(d-sg.s)/sg.l)}}}

// ---------- chapiteau corinthien (canon de Vitruve IV,1 : hauteur ≈ diamètre ; 2 couronnes de 8 feuilles d'acanthe,
// caulicoles, volutes d'angle, hélices centrales, abaque à côtés concaves avec fleuron) ----------
// Feuille d'acanthe : surface courbée (pointe qui se recourbe vers l'extérieur), bords à lobes, nervure centrale.
function acanthusLeaf(w, h, curl, phi0, wrapR) {
  const NU = 10, NV = 26, pos = [], uv = [], idx = [];
  let y = 0, z = 0; const P = [];
  for (let j = 0; j <= NV; j++) { const v = j / NV, phi = phi0 + curl * v * v * v; P.push([y, z, phi]); y += Math.cos(phi) * h / NV; z += Math.sin(phi) * h / NV; }
  for (let j = 0; j <= NV; j++) {
    const v = j / NV, [py, pz, phi] = P[j];
    // silhouette : large à la base, pointe effilée ; 4 paires de lobes dentelés
    let half = w / 2 * Math.pow(Math.sin(Math.PI * Math.min(.97, .12 + v * .88)), .8);
    half *= 1 - .3 * Math.pow(Math.max(0, Math.sin(v * Math.PI * 4.5 - .4)), 6);
    const ny = -Math.sin(phi), nz = Math.cos(phi);
    for (let i = 0; i <= NU; i++) {
      const u = i / NU * 2 - 1, x = u * half;
      const off = half * .32 * u * u + w * .035 * Math.exp(-u * u * 40) - w * .02; // bords relevés + nervure
      let X = x, Z = pz + off * nz; const Y = py + off * ny;
      const a = X / wrapR; X = wrapR * Math.sin(a); Z += wrapR * (Math.cos(a) - 1); // épouse la corbeille
      pos.push(X, Y, Z); uv.push(i / NU, v);
    }
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + NU + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function spiral(lead, cx, cy, z, r0, th0, dir, turns, tubeR) {
  const pts = lead.map(p => new THREE.Vector3(...p));
  const N = 40; for (let k = 0; k <= N; k++) { const t = k / N, r = r0 * (1 - .78 * t), th = th0 + dir * t * turns * Math.PI * 2; pts.push(new THREE.Vector3(cx + Math.cos(th) * r, cy + Math.sin(th) * r, z)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 70, tubeR, 6);
}
function corinthianCapital(x, y0, z, H, rBot, rTop, A, tag) {
  const parts = [], rAt = yy => rBot + (rTop - rBot) * Math.min(1, Math.max(0, yy / (H * .86)));
  const phi0 = Math.atan2(rTop - rBot, H * .86);
  parts.push(new THREE.LatheGeometry([[rBot * .98, 0], [rBot, H * .02], [rTop * .97, H * .84], [rTop * 1.04, H * .86], [rTop * 1.04, H * .87], [0, H * .87]].map(p => new THREE.Vector2(p[0], p[1])), 40));
  const astr = new THREE.TorusGeometry(rBot * 1.03, H * .025, 8, 40); astr.rotateX(Math.PI / 2); astr.translate(0, H * .02, 0); parts.push(astr);
  const ring = (n, off, hgt, w, curl, yb) => { for (let i = 0; i < n; i++) { const r = rAt(yb) + .005, g = acanthusLeaf(w, hgt, curl, phi0, r); g.translate(0, yb, r); g.rotateY(off + i * Math.PI * 2 / n); parts.push(g); } };
  ring(8, 0, H * .42, 2 * Math.PI * rBot / 8 * 1.32, 1.35, H * .03);           // 1re couronne
  ring(8, Math.PI / 8, H * .66, 2 * Math.PI * rBot / 8 * 1.3, 1.45, H * .04);    // 2e couronne (alternée)
  for (let f = 0; f < 4; f++) {
    const face = [];
    for (const s of [-1, 1]) {
      const cx = s * rBot * .42, yTop = H * .62, zs = Math.sqrt(Math.max(0, rAt(yTop) ** 2 - cx * cx)) + .02;
      // caulicole (tige cannelée) + nœud
      const c = new THREE.CylinderGeometry(H * .03, H * .04, H * .16, 10); c.translate(cx, H * .54, zs - .01); face.push(c);
      const kn = new THREE.TorusGeometry(H * .036, H * .013, 6, 14); kn.rotateX(Math.PI / 2); kn.translate(cx, yTop, zs); face.push(kn);
      // calice : deux petites feuilles qui s'ouvrent
      for (const t of [-1, 1]) { const l = acanthusLeaf(H * .12, H * .16, 1.6, .2, 1); l.rotateZ(-t * s * .55); l.rotateY(t * .5); l.translate(cx, yTop, zs + .01); face.push(l); }
      // volute d'angle : monte vers l'extérieur sous la corne de l'abaque, puis s'enroule
      const vr = H * .095, vcx = s * A * .87, vcy = H * .79, vz = A * .87;
      face.push(spiral([[cx, yTop, zs], [s * A * .5, H * .78, (zs + vz) / 2]], vcx, vcy + 0, vz, vr, Math.PI / 2, -s, 1.6, H * .026));
      const eye = new THREE.SphereGeometry(H * .03, 10, 8); eye.translate(vcx, vcy, vz); face.push(eye);
      // hélice : s'enroule vers l'axe, sous le fleuron
      const hr = H * .06, hcx = s * A * .2, hcy = H * .79, hz = rTop + .02;
      face.push(spiral([[cx, yTop, zs], [s * A * .3, H * .76, (zs + hz) / 2]], hcx, hcy, hz, hr, Math.PI / 2, s, 1.4, H * .018));
    }
    for (const g of face) { g.rotateY(f * Math.PI / 2); parts.push(g); }
  }
  // abaque à côtés concaves (cornes aux angles) + moulure
  const ab = new THREE.Shape(), c = A, k = A * .2, cut = A * .12;
  ab.moveTo(-c + cut, -c); ab.quadraticCurveTo(0, -c + k, c - cut, -c); ab.lineTo(c, -c + cut); ab.quadraticCurveTo(c - k, 0, c, c - cut); ab.lineTo(c - cut, c);
  ab.quadraticCurveTo(0, c - k, -c + cut, c); ab.lineTo(-c, c - cut); ab.quadraticCurveTo(-c + k, 0, -c, -c + cut); ab.closePath();
  const abg = new THREE.ExtrudeGeometry(ab, { depth: H * .13, bevelEnabled: true, bevelSize: H * .012, bevelThickness: H * .012, bevelSegments: 2, curveSegments: 12 });
  abg.rotateX(-Math.PI / 2); abg.translate(0, H * .87 + H * .012, 0); parts.push(abg);
  // fleuron (rosette à 6 pétales) au milieu de chaque face de l'abaque
  for (let f = 0; f < 4; f++) {
    const zf = A - k * .5 + H * .02, yf = H * .94;
    const core = new THREE.SphereGeometry(H * .03, 10, 8); core.translate(0, yf, zf + .01); core.rotateY(f * Math.PI / 2); parts.push(core);
    for (let p = 0; p < 6; p++) { const pt = new THREE.SphereGeometry(H * .028, 8, 6); pt.scale(.55, 1.2, .45); pt.translate(0, H * .04, 0); pt.rotateZ(p * Math.PI / 3); pt.translate(0, yf, zf); pt.rotateY(f * Math.PI / 2); parts.push(pt); }
  }
  const geo = mergeGeometries(parts.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(a)) n.deleteAttribute(a); if (!n.attributes.normal) n.computeVertexNormals(); return n; }));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xF1ECE1, roughness: .62, side: THREE.DoubleSide, shadowSide: THREE.BackSide }));
  m.position.set(x, y0, z); return add(m, tag);
}

// ======================= BUILDERS =======================
const BUILD={
orders(){
  box(23.5,.3,3.8,4,0,0,C.lime2);box(22.5,.4,3,4,.3,0,C.lime,"styl");
  const fl=texMat(flutes());
  // Doric
  const ds=new THREE.Mesh(new THREE.CylinderGeometry(.42,.5,5.2,20),fl.clone());ds.position.set(-6,.7+2.6,0);add(ds,"dshaft");
  cyl(.62,.35,-6,5.9,0,C.lime,"ech",24,.45);box(1.4,.3,1.4,-6,6.25,0,C.lime,"abac");
  box(2.8,.55,1.4,-6,6.55,0,C.lime,"darch");box(2.8,.6,1.3,-6,7.1,0,C.lime2,"met");
  for(const x of[-7.1,-6,-4.9])box(.34,.6,.06,x,7.1,.66,C.lime3,"trig");
  for(const x of[-6.55,-5.45]){const m=box(.62,.5,.03,x,7.15,.66,0xC9A98C,"met")}
  box(3.1,.25,1.6,-6,7.7,0,C.marble);
  // Ionic
  cyl(.58,.15,0,.7,0,C.marble,"ibase",24);cyl(.48,.12,0,.85,0,C.marble,"ibase",24);cyl(.55,.15,0,.97,0,C.marble,"ibase",24);
  const is=new THREE.Mesh(new THREE.CylinderGeometry(.38,.42,4.8,20),fl.clone());is.position.set(0,1.12+2.4,0);add(is,"ishaft");
  box(1.15,.3,.8,0,5.92,0,C.marble,"vol");
  for(const s of[-1,1]){const tr=new THREE.Mesh(new THREE.TorusGeometry(.2,.07,8,24),mat(C.marble));tr.position.set(s*.52,6.03,.42);add(tr,"vol");
    const tr2=tr.clone();tr2.position.z=-.42;G.add(tr2);(TAGS.vol).push(tr2)}
  box(1.15,.1,1.15,0,6.22,0,C.marble,"vol");box(2.4,.5,1.2,0,6.32,0,C.marble);
  // Corinthian
  cyl(.55,.15,6,.7,0,C.marble,"",24);cyl(.46,.12,6,.85,0,C.marble,"",24);cyl(.52,.15,6,.97,0,C.marble,"",24);
  const cs=new THREE.Mesh(new THREE.CylinderGeometry(.36,.4,4.6,20),fl.clone());cs.position.set(6,1.12+2.3,0);add(cs);
  corinthianCapital(6,5.72,0,1.18,.365,.5,.65,"acan");box(2.4,.5,1.2,6,6.9,0,C.marble);
  // Arch
  const ar=extr(archShape(4.4,5.5,[{c:0,ow:2.2,sh:2.8}]),1.2,C.lime,"arcus");ar.position.set(16,0,0);
  box(.5,.55,1.3,16,3.6,0,C.lime3,"key");
  // Vault
  box(.5,1.6,4,19.5,0,0,C.lime2,"vault");box(.5,1.6,4,22.5,0,0,C.lime2,"vault");
  const v=new THREE.Mesh(new THREE.CylinderGeometry(1.75,1.75,4,24,1,true,Math.PI/2,Math.PI),mat(C.lime).clone());v.material.side=THREE.DoubleSide;v.rotation.x=Math.PI/2;v.position.set(21,1.6,0);add(v,"vault");
},
temple(){
  box(14.4,.35,22.4,0,0,0,C.lime2,"krep");box(13.6,.35,21.6,0,.35,0,C.lime2,"krep");box(12.8,.35,20.8,0,.7,0,C.lime,"styl");
  const tg={b:"shaft",s:"shaft",c:"cap"};
  for(let i=0;i<6;i++){const x=-5.6+i*2.24;column(x,9.8,1.05,6,.4,C.marble,tg);column(x,-9.8,1.05,6,.4,C.marble,tg)}
  for(let j=1;j<8;j++){const z=-9.8+j*2.45;column(5.6,z,1.05,6,.4,C.marble,tg);column(-5.6,z,1.05,6,.4,C.marble,tg)}
  box(12,.6,20,0,7.05,0,C.marble,"arch");box(12,.6,20,0,7.65,0,C.lime,"met");
  for(let x=-5.6;x<=5.7;x+=1.12)box(.35,.58,.06,x,7.66,10.02,C.lime3,"trig");
  box(12.8,.3,20.8,0,8.25,0,C.marble,"cornice");
  const sh=new THREE.Shape();sh.moveTo(-6.4,0);sh.lineTo(6.4,0);sh.lineTo(0,1.8);sh.closePath();
  const roof=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:20.8,bevelEnabled:false}),mat(C.lime));roof.position.set(0,8.55,-10.4);add(roof,"ped");
  const sh2=new THREE.Shape();sh2.moveTo(-5.6,.15);sh2.lineTo(5.6,.15);sh2.lineTo(0,1.5);sh2.closePath();
  const ty=new THREE.Mesh(new THREE.ExtrudeGeometry(sh2,{depth:.05,bevelEnabled:false}),mat(C.lime3));ty.position.set(0,8.55,10.4);add(ty,"ped");
  box(.5,.6,.3,0,10.3,10.4,C.marble,"acro");box(.45,.5,.3,-6.2,8.55,10.4,C.marble,"acro");box(.45,.5,.3,6.2,8.55,10.4,C.marble,"acro");
  box(8,5.9,13,0,1.05,-2,C.lime,"cella");box(2,3.6,.1,0,1.05,4.52,C.dark,"cella");
  box(7.6,.04,4.8,0,1.06,7.1,C.lime2,"pronaos");
  box(.08,1.5,20,-6.04,7.05,0,C.lime3,"entab");
},
bath(){
  box(19.4,3.2,.4,3.5,0,-4,C.lime2);
  for(const x of[-6,-2,2,6,11]){box(.4,3.2,3,x,0,-2.5,C.lime2);box(.4,3.2,3,x,0,2.5,C.lime2)}
  box(.4,3.2,8,13,0,0,C.lime2);box(19.4,.5,.4,3.5,0,4,C.lime3);
  box(8,.06,8,-10,0,0,C.sand,"pal");
  for(let i=0;i<5;i++){column(-13.6+i*1.8,-3.6,0,3,.18,C.lime,"pal");column(-13.6+i*1.8,3.6,0,3,.18,C.lime,"pal")}
  box(3.6,.06,8,-4,0,0,C.lime,"apo");box(3.4,.45,.6,-4,0,-3.4,C.lime3,"apo");
  for(let i=0;i<3;i++)box(.7,.7,.06,-5+i*1,1.5,-3.79,C.dark,"apo");
  box(3.6,.06,8,0,0,0,C.marble,"fri");box(3,.3,3.4,0,0,-1.5,C.lime3,"fri");
  const pool=box(2.6,.06,3,0,.28,-1.5,C.water,"fri");pool.material.transparent=true;pool.material.opacity=.85;
  box(8.6,.06,8,6.5,0,0,C.dark,"hyp");
  const pg=new THREE.BoxGeometry(.24,.88,.24);const pm=mat(C.terra).clone();
  const xs=[],zs=[];for(let x=2.5;x<=10.6;x+=.6)xs.push(x);for(let z=-3.6;z<=3.6;z+=.6)zs.push(z);
  const im=new THREE.InstancedMesh(pg,pm,xs.length*zs.length);let k=0;const o=new THREE.Object3D();
  for(const x of xs)for(const z of zs){if(Math.abs(x-6)<.3)continue;o.position.set(x,.5,z);o.updateMatrix();im.setMatrixAt(k++,o.matrix)}
  im.count=k;im.castShadow=im.receiveShadow=true;G.add(im);(TAGS.pilae||(TAGS.pilae=[])).push(im);
  for(const[x0,x1,tag]of[[2.2,5.8,"tep"],[6.2,10.8,"cal"]]){box(x1-x0,.1,4.4,(x0+x1)/2,.94,-1.8,C.terra,"susp");box(x1-x0,.12,4.4,(x0+x1)/2,1.04,-1.8,C.marble,tag)}
  for(let x=6.5;x<=10.6;x+=.5)box(.3,2.1,.12,x,1.16,-3.74,C.terra,"tub");
  box(1.2,.7,6.6,10.2,.94,0,C.lime3,"cal");const hw=box(1,.05,6.2,10.2,1.6,0,C.water,"cal");emis(hw,0x1d3a48);
  const v=new THREE.Mesh(new THREE.CylinderGeometry(4,4,4.6,28,1,true,Math.PI/2,Math.PI/2),new THREE.MeshStandardMaterial({color:C.lime2,transparent:true,opacity:.55,side:THREE.DoubleSide}));
  v.rotation.z=Math.PI/2;v.position.set(8.5,3.2,0);G.add(v);T(v,"vault");
  box(2,1.3,2.6,12,0,0,C.basalt,"pf");const fire=box(.9,.55,1.1,11.4,.08,0,C.terra,"pf");emis(fire,0xff6a1a);
  cyl(.45,1,12,1.3,-.65,C.bronze,"pf");cyl(.45,1,12,1.3,.65,C.bronze,"pf");
  const fl=new THREE.PointLight(0xff7a2a,1.4,7);fl.position.set(11.2,.6,0);G.add(fl);
  // latrine
  box(3.6,.06,3,-12.3,0,6.6,C.lime,"lat");box(3.6,1.6,.25,-12.3,0,7.95,C.lime2,"lat");box(.25,1.6,3,-14.1,0,6.6,C.lime2,"lat");
  box(3.3,.5,.6,-12.1,0,7.5,C.marble,"lat");for(let i=0;i<5;i++)box(.24,.02,.32,-13.4+i*.65,.5,7.45,C.dark,"lat");
  box(3.3,.04,.25,-12.1,.02,6.95,C.water,"lat");
  const pmat=new THREE.MeshBasicMaterial({color:0xff8a3a});const pg2=new THREE.SphereGeometry(.09,8,6);const P=[];
  for(let i=0;i<70;i++){const s=new THREE.Mesh(pg2,pmat);G.add(s);P.push({s,o:Math.random(),xe:2.6+Math.random()*8,ze:-3.3+Math.random()*6.6})}
  UPD=t=>{for(const p of P){const u=(t*.12+p.o)%1;let x,y,z,sc=1;
    if(u<.6){const a=u/.6;x=11.3+(p.xe-11.3)*a;z=p.ze*a;y=.45}
    else{const a=(u-.6)/.4;x=p.xe;if(p.xe>6.4){z=p.ze+(-3.66-p.ze)*Math.min(1,a*2);y=a<.5?.45:.45+(a-.5)*2*2.7}else{z=p.ze;y=.45;sc=1-a}}
    p.s.position.set(x,y,z);p.s.scale.setScalar(Math.max(.05,sc))}};
},
theatre(){
  const pts=[[6,0]];steps(6,0,8,.58,.4,pts);const top1=pts[pts.length-1];pts.push([top1[0]+1,top1[1]]);
  const top2=steps(top1[0]+1,top1[1],7,.6,.45,pts);pts.push([top2[0]+.6,top2[1]+.9],[top2[0]+.6,0]);
  lathe(pts,Math.PI/2,Math.PI,C.lime,"cav");
  lathe([[top1[0],top1[1]+.01],[top1[0]+1,top1[1]+.01]],Math.PI/2,Math.PI,C.lime3,"diaz");
  lathe([[6.02,.41],[6.56,.41]],Math.PI/2,Math.PI,C.marble,"hon");
  for(const a of[-60,-30,0,30,60]){const r=(6+top2[0])/2,th=a*Math.PI/180;const b=box(.35,.06,top2[0]-6,Math.sin(th)*r,top2[1]/2,-Math.cos(th)*r,C.lime3);
    b.lookAt(0,b.position.y,0);b.rotateX(-Math.atan2(top2[1],top2[0]-6))}
  for(const a of[-45,0,45]){const th=a*Math.PI/180,r=top1[0]+1.05;const v=box(1.1,1.3,.3,Math.sin(th)*r,top1[1],-Math.cos(th)*r,C.dark,"vom");v.lookAt(0,v.position.y,0)}
  for(const a of[-67.5,-22.5,22.5,67.5]){const th=a*Math.PI/180,r=top1[0]+1.04;const v=box(.55,.55,.2,Math.sin(th)*r,top1[1]+.2,-Math.cos(th)*r,0x5a4636,"echo");v.lookAt(0,v.position.y,0)}
  const R=top2[0]+.62;for(let i=0;i<=12;i++){const a=(-90+i*15)*Math.PI/180;const b=box(.8,2,.12,Math.sin(a)*R,.3,-Math.cos(a)*R,C.dark,"amb");b.lookAt(0,b.position.y,0)}
  const og=new THREE.CircleGeometry(6,40,0,Math.PI);const orch=new THREE.Mesh(og,mat(C.marble).clone());orch.rotation.x=-Math.PI/2;orch.position.y=.02;orch.receiveShadow=true;G.add(orch);T(orch,"orch");
  box(26,1.2,4,0,0,2,C.lime2,"pulp");
  box(27,9,1,0,0,4.5,C.lime2,"scaen");
  for(let x=-11;x<=11;x+=2.2){if(Math.abs(x)<1.2)continue;column(x,3.7,1.2,3.6,.2,C.marble,"scaen");column(x,3.7,5.2,3,.18,C.marble,"scaen")}
  box(24,.4,.7,0,4.8,3.7,C.marble,"scaen");box(24,.35,.6,0,8.2,3.7,C.marble,"scaen");
  box(2.2,3.2,.1,0,1.2,3.98,C.dark,"regia");box(1.5,2.6,.1,-6,1.2,3.98,C.dark,"regia");box(1.5,2.6,.1,6,1.2,3.98,C.dark,"regia");
  for(const s of[-1,1]){box(3,2.4,1.4,s*14.5,0,.3,C.dark,"adit");box(3.4,.5,1.8,s*14.5,2.4,.3,C.lime2,"adit")}
},
amph(){
  const S=1.35;const pts=[[6.2,1.6]];const e=steps(6.2,1.6,10,.63,.45,pts);pts.push([e[0],e[1]+1.2],[e[0]+.5,e[1]+1.2],[e[0]+.5,0]);
  const cav=lathe(pts,0,Math.PI*2,C.lime,"cav",64);cav.geometry.scale(S,1,1);
  const ar=new THREE.Mesh(new THREE.CircleGeometry(6,64),mat(C.sand).clone());ar.geometry.scale(S,1,1);ar.rotation.x=-Math.PI/2;ar.position.y=.02;ar.receiveShadow=true;G.add(ar);T(ar,"arena");
  const pd=new THREE.Mesh(new THREE.CylinderGeometry(6.15,6.15,1.6,64,1,true),mat(C.lime2).clone());pd.material.side=THREE.DoubleSide;pd.geometry.scale(S,1,1);pd.position.y=.8;add(pd,"pod");
  const R=e[0]+.52;for(let i=0;i<28;i++){const a=i/28*Math.PI*2;if(Math.abs(Math.sin(a))<.12)continue;
    for(const y of[.3,3.4]){const b=box(.9,1.8,.12,Math.cos(a)*R*S,y,Math.sin(a)*R,C.dark,"arc");b.lookAt(0,b.position.y,0)}}
  box(6.5,2.5,2.4,10.8,0,0,C.dark,"pt");box(6.5,2.5,2.4,-10.8,0,0,C.dark,"pl");
  for(const a of[20,-20,160,200]){const t=a*Math.PI/180;const b=box(.7,1,.12,Math.cos(t)*6.18*S,0,Math.sin(t)*6.18,C.dark,"carc");b.lookAt(0,.5,0)}
},
hipp(){
  box(50,.05,14,0,0,0,C.sand,"track");
  for(const s of[-1,1]){box(50,.6,1,0,0,s*7.5,C.lime,"cav");box(50,1.2,1,0,0,s*8.5,C.lime,"cav");box(50,1.8,1,0,0,s*9.5,C.lime2,"cav")}
  const sp=lathe([[7,0],[7,.6],[8,.6],[8,1.2],[9,1.2],[9,1.8],[10,1.8],[10,0]],0,Math.PI,C.lime,"sph",32);sp.position.x=25;
  box(30,.8,1.2,0,0,0,C.lime2,"spina");
  for(const[x,tag]of[[15.6,"mp"],[-15.6,"ms"]])for(const z of[-.4,0,.4]){const c=new THREE.Mesh(new THREE.ConeGeometry(.3,2.2,12),mat(C.bronze));c.position.set(x,1.1,z);add(c,tag)}
  const ob=new THREE.Mesh(new THREE.ConeGeometry(.55,6,4),mat(C.red));ob.position.set(0,3.8,0);ob.rotation.y=Math.PI/4;add(ob,"obel");
  box(1.5,2.5,14.4,-25.6,0,0,C.lime2,"carc");for(let i=0;i<12;i++)box(.06,1.8,.9,-24.84,0,-6.05+i*1.1,C.dark,"carc");
  for(let i=0;i<4;i++)box(1,.5,.6,-6+i*4,.8,0,C.marble,"spina");
  box(4,1.4,1.6,0,1.8,-9.3,C.marble,"sac");box(4.4,.2,2,0,3.2,-9.3,C.terra,"sac");box(1,.8,.1,0,1.85,-8.48,C.dark,"sac");
},
church(){
  flat(18,12,1,.03,0,texMat(mosaic()),"mos");
  box(18,4,.3,1,0,-6,C.lime2);box(18,1.1,.3,1,0,6,C.lime3);
  box(.3,4,3.2,-8,0,-4.4,C.lime2);box(.3,4,2.6,-8,0,0,C.lime2);box(.3,4,3.2,-8,0,4.4,C.lime2);
  box(.3,4,3.5,10,0,-4.25,C.lime2);box(.3,4,3.5,10,0,4.25,C.lime2);
  for(let x=-6.5;x<=8.6;x+=1.5){column(x,-2.5,0,4.2,.22,C.marble,"col");column(x,2.5,0,4.2,.22,C.marble,"col")}
  box(16.6,.4,.45,1,4.2,-2.5,C.marble,"col");box(16.6,.4,.45,1,4.2,2.5,C.marble,"col");box(16.6,2,.3,1,4.6,-2.5,C.lime2,"nave");
  flat(16,4.6,1,.05,0,new THREE.MeshStandardMaterial({color:0xE6D7B6,transparent:true,opacity:0}),"nave");
  flat(16,3.2,1,.05,4.3,new THREE.MeshStandardMaterial({color:0xE6D7B6,transparent:true,opacity:0}),"aisle");
  const ap=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,4,28,1,true,0,Math.PI),mat(C.lime2).clone());ap.material.side=THREE.DoubleSide;ap.position.set(10,2,0);add(ap,"apse");
  const dome=new THREE.Mesh(new THREE.SphereGeometry(2.5,28,12,Math.PI/2,Math.PI,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0xC9A24A,roughness:.7,side:THREE.DoubleSide}));dome.position.set(10,4,0);add(dome,"apse");
  box(3,.35,5,8.5,0,0,C.marble,"bema");const bh=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,.35,28,1,false,0,Math.PI),mat(C.marble).clone());bh.position.set(10,.175,0);add(bh,"bema");
  box(.12,.9,1.9,7.05,.35,-1.55,C.marble,"chan");box(.12,.9,1.9,7.05,.35,1.55,C.marble,"chan");
  box(.9,.9,.9,9.3,.35,0,C.marble,"alt");
  box(2,.06,12,-9,0,0,C.lime,"nar");box(.3,4,12,-10,0,0,C.lime2,"nar");
  box(10,.06,12,-15,0,0,C.lime,"atr");
  for(let x=-19.5;x<=-10.5;x+=1.5){column(x,-5.6,0,3,.17,C.lime,"atr");column(x,5.6,0,3,.17,C.lime,"atr")}
  cyl(.85,.5,-15,0,0,C.lime3,"phi");cyl(.7,.05,-15,.5,0,C.water,"phi");
  box(6,.06,4,5,0,-8,C.lime,"bap");box(6,3,.3,5,0,-10,C.lime2,"bap");box(.3,3,4,2,0,-8,C.lime2,"bap");box(.3,3,4,8,0,-8,C.lime2,"bap");
  box(2.6,.25,1,5,0,-8,C.marble,"font");box(1,.25,2.6,5,0,-8,C.marble,"font");
  box(2.2,.06,.7,5,.22,-8,C.blue,"font");box(.7,.06,2.2,5,.22,-8,C.blue,"font");
  // small centralized octagon
  cyl(1.8,1.6,-17.5,0,-9,C.lime2,"cent",8);cyl(1.2,1,-17.5,1.6,-9,C.lime,"cent",8);const cd=new THREE.Mesh(new THREE.SphereGeometry(1.1,16,8,0,Math.PI*2,0,Math.PI/2),mat(0xC9A24A));cd.position.set(-17.5,2.6,-9);add(cd,"cent");
},
syn(){
  flat(16,9,0,.03,0,texMat(zodiac()),"mos");
  box(16.6,3.5,.35,0,0,-4.6,C.lime2);box(.35,3.5,9.2,-8.2,0,0,C.lime2);box(16.6,1,.35,0,0,4.6,C.lime3);
  box(.35,3.5,3.8,8.2,0,-2.7,C.lime2);box(.35,3.5,3.8,8.2,0,2.7,C.lime2);
  box(.6,.15,1.6,8.2,0,0,C.lime3,"thr");
  for(let x=-6;x<=6;x+=2){column(x,-1.7,0,3.3,.2,C.lime,"col");column(x,1.7,0,3.3,.2,C.lime,"col")}
  box(.5,.4,8.4,-7.75,0,0,C.lime3,"ben");box(.4,.75,8.4,-7.95,0,0,C.lime3,"ben");box(15,.4,.5,0,0,4.15,C.lime3,"ben");
  box(4.2,.6,1.4,0,0,-3.7,C.marble,"bima");box(1.6,.3,.5,0,0,-2.75,C.marble,"bima");
  for(const x of[-2.05,2.05])box(.06,.5,1.4,x,.6,-3.7,C.marble,"bima");box(4.2,.5,.06,-0.0,.6,-3.03,C.marble,"bima");
  box(1.4,1.6,.5,0,.6,-4.2,C.lime,"aron");box(.8,1.1,.05,0,.75,-3.94,C.wood,"aron");
  for(const x of[-.6,.6])cyl(.07,1.6,x,.6,-3.9,C.marble,"aron",8);box(1.7,.2,.65,0,2.2,-4.15,C.marble,"aron");
  const gs=new THREE.Shape();gs.moveTo(-.85,0);gs.lineTo(.85,0);gs.lineTo(0,.45);gs.closePath();const gb=extr(gs,.6,C.marble,"aron");gb.position.set(0,2.4,-4.15);
  for(const x of[-1.6,1.6]){cyl(.04,1.1,x,.6,-3.7,C.bronze,"men",8);
    for(const r of[.15,.3,.45]){const tr=new THREE.Mesh(new THREE.TorusGeometry(r,.025,6,20,Math.PI),mat(C.bronze));tr.rotation.z=Math.PI;tr.position.set(x,1.7,-3.7);add(tr,"men")}
    box(1,.05,.06,x,1.7,-3.7,C.bronze,"men")}
  // narthex & propylaea
  box(1.6,.45,9,9.2,0,0,C.lime,"nar");for(const z of[-3.6,-1.6,1.6,3.6])column(9.95,z,.45,2.6,.13,C.lime,"nar");
  box(.9,.15,3,10.45,0,0,C.lime2,"prop");box(.6,.15,3,10.3,.15,0,C.lime2,"prop");box(.3,.15,3,10.15,.3,0,C.lime2,"prop");
  box(6,.06,9,13.9,0,0,C.lime,"atr");for(const x of[11.4,13.4,15.4])for(const z of[-4.2,4.2])column(x,z,0,2.4,.13,C.lime,"atr");
  // miqveh + otzar
  box(3.2,1.2,.25,13,0,6.4,C.lime2,"miq");box(3.2,1.2,.25,13,0,8.6,C.lime2,"miq");box(.25,1.2,2.2,11.45,0,7.5,C.lime2,"miq");
  for(const[x,h]of[[11.8,1.0],[12.2,.75],[12.6,.5]])box(.4,h,2,x,0,7.5,C.lime3,"miq");
  const w1=box(1.8,.05,2,13.6,.48,7.5,C.water,"miq");w1.material.transparent=true;w1.material.opacity=.85;
  box(.25,1.2,2.2,14.6,0,7.5,C.lime2,"miq");box(.3,.25,.3,14.6,.45,7.5,C.dark,"otz");
  box(1.6,1.2,.25,15.5,0,6.4,C.lime2,"otz");box(1.6,1.2,.25,15.5,0,8.6,C.lime2,"otz");box(.25,1.2,2.2,16.3,0,7.5,C.lime2,"otz");
  const w2=box(1.3,.05,2,15.45,.9,7.5,C.water,"otz");w2.material.transparent=true;w2.material.opacity=.85;
},
aqua(){
  const hill=new THREE.Mesh(new THREE.SphereGeometry(6,32,16),mat(C.olive).clone());hill.scale.set(1,.7,1.2);hill.position.set(-26,0,0);add(hill,"src");
  cyl(.6,.2,-26,4.15,0,C.water,"src");
  const L=[[-25,4.05],[-10,3.7]];
  for(let x=-25;x<-10;x+=1){const y=4.05-(x+25)*(.35/15);box(1,y-.3,.8,x+.5,0,0,C.lime2,"chan");box(1,.3,.8,x+.5,y-.3,0,C.lime,"chan")}
  for(let i=0;i<8;i++){const x=-10+i*2+1;const ar=extr(archShape(2,3.4,[{c:0,ow:1.3,sh:1.9}]),.8,C.lime2,"arc");ar.position.set(x,0,0);box(2,.3,.8,x,3.4,0,C.lime,"arc")}
  for(let x=6;x<9.6;x+=.9)box(.9,3.4,.8,x+.45,0,0,C.lime2,"chan");
  const h2=new THREE.Mesh(new THREE.SphereGeometry(6,32,16),mat(C.olive).clone());h2.scale.set(1,.7,1.1);h2.position.set(13,0,0);add(h2);
  box(.3,1,1,9.5,2.8,0,C.dark,"tun");box(.3,1,1,16.5,2.8,0,C.dark,"tun");
  for(const x of[11,13,15]){const y=Math.sqrt(36-(x-13)**2)*.7;cyl(.32,.6,x,y-.1,0,C.lime2,"shaft",12);cyl(.22,.02,x,y+.5,0,C.dark,"shaft",12)}
  box(1.6,3,1.6,18.7,0,0,C.lime2,"sett");box(1.3,.05,1.3,18.7,3.0,0,C.water,"sett");
  const pipe=[[19.6,2.9],[22,2.6],[26,.35],[30,.35],[33.2,2.3]];
  for(let i=0;i<pipe.length-1;i++){const a=pipe[i],b=pipe[i+1];const dx=b[0]-a[0],dy=b[1]-a[1],Ln=Math.hypot(dx,dy);const n=Math.round(Ln/.6);
    for(let k=0;k<n;k++){const t0=k/n,t1=(k+1)/n;const m=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,Ln/n*.96,12),mat(k%2?C.lime3:C.lime2).clone());
      m.position.set(a[0]+dx*(t0+t1)/2,a[1]+dy*(t0+t1)/2,0);m.rotation.z=Math.atan2(dy,dx)-Math.PI/2;add(m,"siph")}}
  for(let x=23;x<33;x+=2.2)box(.4,Math.max(.1,x<26?(2.6-(x-22)*.56):x>30?(x-30)*.6:.1),.4,x,0,0,C.lime3,"siph");
  box(4.4,2.4,3.6,36,0,0,C.lime2,"res");box(3.8,.05,3,36,2.4,0,C.water,"res");
  UPD=flowParticles([[-26,4.4,0],[-25,4.3,0],[-10,3.95,0],[6,3.75,0],[9.6,3.7,0],[16.5,3.4,0],[18.7,3.15,0],[19.6,2.9,0],[22,2.6,0],[26,.35,0],[30,.35,0],[33.2,2.3,0],[36,2.55,0]],46,0x58b4e6,2.2,.12);
},
olive(){
  box(16,.05,10,3,0,1,C.lime3);
  cyl(1.7,.8,-4,0,-1,C.lime2,"yam",32);cyl(1.45,.06,-4,.8,-1,C.mash,"yam",32);cyl(.22,.5,-4,.8,-1,C.lime3,"mamal",12);
  const pv=new THREE.Group();pv.position.set(-4,0,-1);G.add(pv);
  const ms=new THREE.Mesh(new THREE.CylinderGeometry(.75,.75,.45,28),mat(C.lime).clone());ms.rotation.z=Math.PI/2;ms.position.set(.75,1.58,0);add(ms,"mamal",pv);
  const sh=new THREE.Mesh(new THREE.BoxGeometry(2.9,.12,.12),mat(C.wood).clone());sh.position.set(1.25,1.58,0);add(sh,"mamal",pv);
  const post=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,1.4,8),mat(C.wood).clone());post.position.set(0,1.4,0);add(post,"mamal",pv);
  UPD=t=>{pv.rotation.y=t*.5};
  box(.6,3,4.4,1.2,0,2,C.lime2,"niche");box(.06,.55,.55,1.53,1.3,2,C.dark,"niche");
  cyl(1,.3,3.6,0,2,C.lime,"bed",28);const gr=new THREE.Mesh(new THREE.TorusGeometry(.82,.05,6,28),mat(C.oil).clone());gr.rotation.x=Math.PI/2;gr.position.set(3.6,.31,2);add(gr,"bed");
  for(let i=0;i<5;i++)cyl(.58,.19,3.6,.3+i*.21,2,C.straw,"akal",20);
  box(8.6,.36,.38,5.8,1.36,2,C.wood,"beam");
  for(const z of[1.6,2.4]){cyl(.03,.85,9.4,.6,z,C.wood);cyl(.42,.55,9.4,.05,z,C.lime3,"wts",16)}
  box(.22,.04,1.2,3.6,.18,3.3,C.oil,"vat");box(1.5,.3,1.5,3.6,0,4.5,C.lime2,"vat");box(1.2,.03,1.2,3.6,.29,4.5,C.oil,"vat");
},
gat(){
  box(7.4,.9,9.2,0,0,-.9,C.lime2);
  flat(7,7,0,.92,0,texMat(canvasTex((g,s)=>{g.fillStyle="#efe9dc";g.fillRect(0,0,s,s);for(let y=0;y<s;y+=8)for(let x=0;x<s;x+=8){g.fillStyle=`hsl(40,15%,${84+Math.random()*10}%)`;g.fillRect(x+1,y+1,6,6)}},256,[3,3])),"floor");
  for(const[w,d,x,z]of[[7.4,.2,0,3.6],[.2,9.2,-3.7,-.9],[.2,9.2,3.7,-.9]])box(w,.35,d,x,.9,z,C.lime3,"floor");
  for(let i=0;i<4;i++){const x=-2.4+i*1.6;box(.15,.7,1.6,x-.8,.9,-4.5,C.lime3,"cells");for(let k=0;k<6;k++){const s=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),mat(C.grape));s.position.set(x-.4+Math.random()*.8,1.05+Math.random()*.2,-4.5-.5+Math.random());add(s,"cells")}}
  box(.15,.7,1.6,2.4+.8,.9,-4.5,C.lime3,"cells");box(6.6,.7,.15,0,.9,-5.35,C.lime3,"cells");
  box(1.2,.3,1.2,0,.92,0,C.lime3,"screw");const sc=new THREE.Group();sc.position.set(0,0,0);G.add(sc);
  const scr=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,2.4,10),mat(C.wood).clone());scr.position.set(0,2.4,0);add(scr,"screw",sc);
  const bar=new THREE.Mesh(new THREE.BoxGeometry(1.8,.1,.1),mat(C.wood).clone());bar.position.set(0,3.3,0);add(bar,"screw",sc);
  box(1,.12,1,0,1.6,0,C.wood,"screw");box(.8,.35,.8,0,1.22,0,C.grape,"screw");
  UPD=t=>{sc.rotation.y=t*.4};
  const ch=box(.3,.06,1.4,0,.62,4.2,C.must,"chan");ch.rotation.x=.28;
  box(1.5,.5,1.5,0,0,5.25,C.lime3,"sett");box(1.1,.03,1.1,0,.46,5.25,C.must,"sett");
  box(.25,.04,.6,0,.3,6.1,C.must,"vat");
  box(3,.3,2.6,0,0,7.4,C.lime3,"vat");box(2.6,.02,2.2,0,.27,7.4,C.must,"vat");
  for(const[x,h]of[[-1.15,.25],[-.85,.18]])box(.3,h,.6,x,0,8.3,C.lime2,"vat");
  amphora(2.9,0,6.9,"amph");amphora(3.6,0,7.6,"amph");amphora(3.1,0,8.3,"amph");
},
cardo(){
  const pv=texMat(paving());
  const rd=new THREE.Mesh(new THREE.BoxGeometry(24,.15,6),pv);rd.position.set(-2,.075,0);add(rd,"road");
  box(24,.02,.35,-2,.15,0,C.dark,"drain");
  for(const s of[-1,1]){
    box(24,.45,1.2,-2,0,s*3.6,C.lime,"styl");
    for(let x=-13;x<=9;x+=2)column(x,s*3.6,.45,4.6,.25,C.marble,"col");
    box(24,.4,.5,-2,5.05,s*3.6,C.marble);
    box(24,.4,3,-2,0,s*5.7,C.lime2,"port");
    const rf=box(24,.15,3.6,-2,5.35,s*5.5,C.terra,"port");rf.rotation.x=s*-.12;
    box(24,5.4,.4,-2,0,s*7.4,C.lime2,"tab");
    for(let x=-12.5;x<=8.6;x+=2.4)box(1.4,2.4,.06,x,.4,s*7.17,C.dark,"tab");
  }
  const dc=new THREE.Mesh(new THREE.BoxGeometry(6,.15,24),pv);dc.position.set(13,.075,0);add(dc,"dec");
  for(const a of[-1,1])for(const b of[-1,1])box(1.4,6,1.4,13+a*3.4,0,b*3.4,C.lime,"tet");
  box(8.4,1.2,8.4,13,6,0,C.lime2,"tet");
  box(6,.06,7,20,0,8,C.lime,"forum");for(let x=17.4;x<=22.6;x+=1.3)column(x,11.3,0,2.6,.14,C.lime,"forum");for(let z=5;z<=11;z+=1.5)column(22.8,z,0,2.6,.14,C.lime,"forum");
  for(const[w,h,d,x,z]of[[2.6,2.4,2.6,18.4,-10.6],[2.6,1.8,2.6,21.6,-10.6],[2.6,2.1,2.4,18.4,-5.6],[2.6,2.6,2.4,21.6,-5.6]])box(w,h,d,x,0,z,C.lime2,"ins");
  box(6,.04,7.4,20,0,-8.1,C.lime3,"ins");
  const L=16,cx=24;
  box(L,.4,5.2,cx,0,0,0x6f6a62,"lay");box(L,.35,4.8,cx,.4,0,0x9a8467,"lay");box(L,.3,4.6,cx,.75,0,0xC4B38E,"lay");
  const top=new THREE.Mesh(new THREE.BoxGeometry(L,.18,4.4),pv);top.position.set(cx,1.14,0);add(top,"lay");
  box(L,.35,.3,cx,1.05,2.35,C.lime3);box(L,.35,.3,cx,1.05,-2.35,C.lime3);
  const tr=extr(archShape(6.4,4.8,[{c:-2.1,ow:1,sh:1.9},{c:0,ow:1.8,sh:2.4},{c:2.1,ow:1,sh:1.9}]),1,C.lime,"arcT");tr.rotation.y=Math.PI/2;tr.position.set(17.5,0,0);
  box(.9,.4,.9,28,0,3.4,C.lime3,"mil");cyl(.32,2.2,28,.4,3.4,C.lime,"mil");
},
bsh(){
  box(46,.02,1.8,0,0,-17,0x7E8A7A,"harod");
  const tl=new THREE.Mesh(new THREE.CylinderGeometry(3.5,6.5,4,36),mat(0xB8A882).clone());tl.position.set(0,2,-10);add(tl,"tell");
  box(1.6,.9,2.4,0,4,-10,C.lime,"tell");for(const x of[-.6,-.2,.2,.6])cyl(.07,.9,x,4,-8.65,C.marble,"tell",6);
  const J=[0,-4];
  road(J,[-6.5,5.5],"pal",C.basalt,.8,.55,.06,.55);
  for(let i=0;i<5;i++){const t=.45+i*.07,x=J[0]+(-6.5-J[0])*t,z=J[1]+(5.5-J[1])*t;const c=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.6,8),mat(C.marble).clone());c.rotation.z=Math.PI/2;c.rotation.y=.6+i*.1;c.position.set(x+.2,.12,z);add(c,"fall")}
  road(J,[7,3],"sil",C.basalt,.7,.6,.07,.6);
  road(J,[5,-15.6],"val",C.basalt,.6,.7,.05,.45);box(1.1,.55,2.4,5.3,0,-17,C.basalt,"val");for(const z of[-17.7,-17,-16.3])box(1.12,.3,.35,5.3,0,z,C.dark,"val");
  road(J,[-6,-13],"nst",C.basalt,.5,.7,.05,.4);
  box(1.2,1.6,.6,.7,0,-4.7,C.lime,"mon");for(const x of[.25,.55,.85,1.15])cyl(.06,1.9,x,0,-4.25,C.marble,"mon",6);
  const ny=new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,1.6,20,1,true,Math.PI/2,Math.PI),mat(C.lime2).clone());ny.material.side=THREE.DoubleSide;ny.position.set(-2.4,.8,-4.6);add(ny,"nym");box(1.8,.25,.6,-2.4,0,-3.9,C.water,"nym");
  box(2,.5,2.4,2.7,0,-5.8,C.lime2,"rtem");box(1.4,1.1,1.6,2.7,.5,-6,C.lime,"rtem");for(const x of[2.2,2.55,2.85,3.2])cyl(.06,1,x,.5,-4.8,C.marble,"rtem",6);
  const th=lathe([[.9,0]].concat((()=>{const p=[];steps(.9,0,6,.35,.3,p);return p})(),[[3.2,1.8],[3.2,0]]),Math.PI*1.25,Math.PI,C.lime,"th",28);th.position.set(-8.2,0,8.6);
  const st=box(4.4,.5,.9,-8.2+.95,0,8.6-.95,C.lime2,"th");st.rotation.y=-Math.PI/4;const sf=box(4.4,2.2,.3,-8.2+1.45,0,8.6-1.45,C.lime2,"th");sf.rotation.y=-Math.PI/4;
  box(4,1,3.5,-10,0,0,C.lime2,"wbath");for(const[x,z]of[[-11.2,-.8],[-10,-.8],[-8.8,-.8],[-10.6,.9],[-9.2,.9]]){const d=new THREE.Mesh(new THREE.SphereGeometry(.55,16,8,0,Math.PI*2,0,Math.PI/2),mat(C.lime).clone());d.position.set(x,1,z);add(d,"wbath")}
  box(1.6,.6,1,-11.6,0,3.3,C.lime3,"lat");
  box(3.4,.05,3,-1,0,2.5,C.lime,"ag");for(let z=1.2;z<=3.8;z+=.65)cyl(.05,.6,-2.75,0,z,C.marble,"ag",6);
  const sg=lathe([[1.1,0],[1.1,.75],[1.8,.75],[1.8,0]],Math.PI*1.75,Math.PI,C.lime2,"sig",20);sg.position.set(-3.6,0,6.4);
  box(2.6,1,2,4.5,0,1.8,C.lime2,"ebath");const ed=new THREE.Mesh(new THREE.SphereGeometry(.65,16,8,0,Math.PI*2,0,Math.PI/2),mat(C.lime).clone());ed.position.set(4.5,1,1.8);add(ed,"ebath");
  const am=lathe([[1.5,0],[1.5,.4],[2,.4],[2,.8],[2.5,.8],[2.5,1.2],[2.9,1.2],[2.9,0]],0,Math.PI*2,C.lime,"amph",40);am.geometry.scale(1.9,1,1);am.position.set(-4,0,17);
  const an=new THREE.Mesh(new THREE.CircleGeometry(1.5,32),mat(C.sand).clone());an.geometry.scale(1.9,1,1);an.rotation.x=-Math.PI/2;an.position.set(-4,.02,17);G.add(an);T(an,"amph");
  const W=[[-14,-14],[0,-15.6],[9,-15],[13,-4],[11,9],[2,12.5],[-10,12],[-15,2],[-14,-14]];
  for(let i=0;i<W.length-1;i++){seg(W[i],W[i+1],.3,.7,C.lime3,"wall");box(.7,1.1,.7,W[i][0],0,W[i][1],C.lime2,"wall")}
}
,
jer(){
  box(1.6,.02,22,8.8,0,1,0x7E8A7A,"kid");
  box(1.4,.02,9,-6.6,0,5,0x8F8A76);box(11,.02,1.3,-1.2,0,11.2,0x8F8A76);
  const ol=new THREE.Mesh(new THREE.SphereGeometry(5,32,16),mat(C.olive).clone());ol.scale.set(1,.22,1.4);ol.position.set(14.5,0,-1);add(ol);
  const walls={wN:[[-5,-3.5],[-2,-4.5],[0,-5],[3.2,-4.6],[6.8,-3.2]],wE:[[6.8,-3.2],[7.2,3]],wS:[[7.2,3],[5,6],[4.6,9],[3.4,10.6],[1,10],[-2,9.4],[-4.2,8],[-5.6,5]],wW:[[-5.6,5],[-5.6,.6],[-5.4,-2],[-5,-3.5]]};
  for(const[tag,pts]of Object.entries(walls)){for(let i=0;i<pts.length-1;i++)seg(pts[i],pts[i+1],.28,.6,C.lime2,tag);for(const p of pts)box(.5,.85,.5,p[0],0,p[1],C.lime3,tag)}
  const dash=new THREE.Line(new THREE.BufferGeometry().setFromPoints([[-5,-3.5],[0,-5],[6.8,-3.2],[7.2,3],[2,3.6],[-3,3.6],[-5.6,3.2],[-5.6,.6],[-5,-3.5]].map(p=>new THREE.Vector3(p[0],.08,p[1]))),new THREE.LineDashedMaterial({color:0x7B1E3E,dashSize:.35,gapSize:.25}));
  dash.computeLineDistances();G.add(dash);TAGS.today=[];
  const tmS=new THREE.Shape();[[3.4,3.3],[6.8,3.2],[7.2,-3],[3.6,-2.8]].forEach((p,i)=>i?tmS.lineTo(p[0],p[1]):tmS.moveTo(p[0],p[1]));tmS.closePath();
  const tm=new THREE.Mesh(new THREE.ExtrudeGeometry(tmS,{depth:.5,bevelEnabled:false}),mat(C.lime3).clone());tm.rotation.x=-Math.PI/2;add(tm,"tm");
  for(let i=0;i<26;i++)box(.2+Math.random()*.4,.15+Math.random()*.3,.2+Math.random()*.4,4+Math.random()*2.8,.5,-2.6+Math.random()*5.2,C.basalt,"tm");
  box(1.3,1,.6,0,0,-5,C.lime3,"dg");cyl(.9,.04,0,0,-4.2,C.marble,"dg",28);cyl(.1,2,0,.04,-4.2,C.marble,"dg");
  road([0,-4.2],[-.4,.6],"cw");road([-.4,.6],[-.8,5.6],"cws",0xE4D3AE);
  road([0,-4.2],[2.6,2.6],"ce");road([2.6,2.6],[3.2,9.6],"ce");
  seg([-5.6,.6],[3.4,.6],.36,.05,C.lime,"dec");
  box(1.4,.6,.8,-1.3,0,-1,C.lime,"hs");cyl(.45,.9,-2.5,0,-1,C.lime,"hs",20);box(.5,.3,.8,-.6,0,-1,C.lime3,"hs");
  box(1.2,.7,.8,-.9,0,6.2,C.lime,"nea");cyl(.35,.7,-.3,0,6.2,C.lime,"nea",16);
  box(1.2,.6,.7,-3.5,0,6.6,C.lime,"hz");
  box(.9,.05,.6,3.3,0,10,C.water,"sil");box(.6,.5,.5,3.2,0,9.3,C.lime,"sil");
  box(1,.5,.6,.3,0,-6.7,C.lime,"ste");
  box(.7,1.1,.7,-5.3,0,1.2,C.lime3,"cit");box(.6,.9,.6,-5.3,0,2.1,C.lime3,"cit");
  box(1,.5,.6,13.2,1.1,-1.8,C.lime,"olv");cyl(.3,.6,14.3,1.1,-.2,C.lime,"olv",8);
}
};


export function buildScene(id) {
  G = new THREE.Group(); TAGS = {}; UPD = null;
  if (!BUILD[id]) throw new Error('scène inconnue : ' + id);
  BUILD[id]();
  return { group: G, tags: TAGS, update: UPD };
}
export const SCENE_IDS = Object.keys(BUILD);
