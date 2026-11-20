// The Plotlet card plotter as a small embeddable scene for the portfolio.
// Same model and logic as voice/sound-states-demo/plotter-3d/index.html (the full page with controls).
// Machine: Plotlet by Lingdong Huang, MIT — github.com/LingDong-/plotlet
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// role = "<what moves it>:<what it looks like>", node names from plotter-standard.step
const ROLE = {
  'Rack (67 teeth)': 'bed:printed', 'Part 4_1': 'body:printed', 'Rack (67 teeth)_1': 'x:printed', 'Part 1_2': 'x:printed',
  'Part 4': 'z:printed', 'Servo-sg90-final': 'x:servo', 'Servo-sg90-final_1': 'x:servo', 'Base (coxa) Joint v10': 'x:printed',
  'Part 1': 'body:stepper', 'Part 1_3': 'body:stepper', 'Part 1_1': 'body:stepper',
  'Spur gear (20 teeth)': 'gx:gear', 'Spur gear (20 teeth)_1': 'gy:gear', 'Spur gear (20 teeth)_2': 'gy:gear',
  'Part 9': 'body:printed', 'Part 13': 'body:printed',
};

export async function createPlotter({ glbUrl, speed = 3 }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio)); renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1.6, 1, 4000);
  camera.position.set(-270, 250, 320);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enableZoom = false; controls.target.set(0, -12, 18);
  scene.add(new THREE.HemisphereLight(0xf4efe4, 0x1a1c24, .35));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-160, 280, 200); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 50, far: 800 });
  key.shadow.bias = -.0004; key.shadow.normalBias = .4; scene.add(key);
  const rim = new THREE.DirectionalLight(0xb9a16b, .7); rim.position.set(220, 90, -200); scene.add(rim);

  const MAT = {
    printed: new THREE.MeshStandardMaterial({ color: 0x8b9097, roughness: .72 }),
    stepper: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .38, metalness: .55 }),
    servo: new THREE.MeshStandardMaterial({ color: 0x2b2a2e, roughness: .45 }),
    gear: new THREE.MeshStandardMaterial({ color: 0x8b9097, roughness: .6 }),
    pen: new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: .35, metalness: .4 }),
    tip: new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: .3 }),
    tape: new THREE.MeshStandardMaterial({ color: 0x2f5fd0, roughness: .8 }),
  };

  const j = await fetch(glbUrl).then(r => r.json());
  const bytes = Uint8Array.from(atob(j.glb), c => c.charCodeAt(0));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
  const model = gltf.scene; model.scale.setScalar(1000); scene.add(model); model.updateMatrixWorld(true);

  const groups = { bed: new THREE.Group(), x: new THREE.Group(), z: new THREE.Group() };
  scene.add(groups.bed, groups.x); groups.x.add(groups.z);
  const gears = [], meshes = [];
  model.traverse(o => { if (o.isMesh) meshes.push(o); });

  // 28BYJ-48: silver can, blue connector cap on the side away from the offset output shaft
  function tintCap(m) {
    const g = m.geometry, pos = g.attributes.position, n = pos.count, v = new THREE.Vector3();
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const [ax, capDim, ears] = ['x', 'y', 'z'].sort((p, q) => size[p] - size[q]);
    const ends = ['min', 'max'].map(end => { let sum = 0, cnt = 0;
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); if (Math.abs(v[ax] - box[end][ax]) < 3) { sum += v[capDim] - c[capDim]; cnt++; } }
      return { cnt, off: sum / Math.max(1, cnt) }; });
    const shaft = ends[0].cnt < ends[1].cnt ? ends[0] : ends[1];
    const sign = shaft.off < 0 ? 1 : -1, canC = sign > 0 ? box.min[capDim] + 14 : box.max[capDim] - 14;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const isCap = sign * (v[capDim] - canC) > 12.5 && Math.abs(v[ears] - c[ears]) < 9.5;
      col.set(isCap ? [.12, .32, .80] : [.80, .81, .83], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const san = n => THREE.PropertyBinding.sanitizeNodeName(n || '').replace(/_c[0-9a-f]{6}$/, '');
  const ROLE_S = Object.fromEntries(Object.entries(ROLE).map(([k, v]) => [san(k), v]));
  for (const m of meshes) {
    const [mover, look] = (ROLE_S[san(m.name)] ?? ROLE_S[san(m.parent?.name)] ?? 'body:printed').split(':');
    m.material = MAT[look]; m.castShadow = m.receiveShadow = true;
    if (look === 'stepper') tintCap(m);
    if (mover === 'bed' || mover === 'x' || mover === 'z') groups[mover].attach(m);
    if (mover === 'gx' || mover === 'gy') {
      const box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3());
      const pivot = new THREE.Group(); pivot.position.copy(box.getCenter(new THREE.Vector3())); scene.add(pivot); pivot.attach(m);
      gears.push({ pivot, role: mover, axis: sz.z < sz.x && sz.z < sz.y ? 'z' : sz.x < sz.y ? 'x' : 'y' });
    }
  }

  const holder = new THREE.Box3(); groups.z.children.forEach(c => holder.expandByObject(c));
  const bedBox = new THREE.Box3(); groups.bed.children.forEach(c => bedBox.expandByObject(c));
  const penX = (holder.min.x + holder.max.x) / 2, penZ = (holder.min.z + holder.max.z) / 2, bedTop = bedBox.max.y;
  const pen = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 130, 32), MAT.pen); barrel.position.y = 71; barrel.castShadow = true;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 1, 6, 32), MAT.tip); tip.position.y = 3;
  pen.add(barrel, tip); pen.position.set(penX, bedTop + .3, penZ); groups.z.attach(pen);

  const CARD_W = 152, CARD_H = 102, PX = 6;
  const cv = document.createElement('canvas'); cv.width = CARD_W * PX; cv.height = CARD_H * PX;
  const ctx = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshStandardMaterial({ map: tex, roughness: .95 }));
  card.rotation.x = -Math.PI / 2; card.receiveShadow = true;
  const bedCx = (bedBox.min.x + bedBox.max.x) / 2, bedCz = (bedBox.min.z + bedBox.max.z) / 2;
  card.position.set(bedCx, bedTop + .15, bedCz); groups.bed.attach(card);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(22, .3, 8), MAT.tape);
    t.position.set(bedCx + sx * (CARD_W / 2 - 4), bedTop + .4, bedCz + sz * (CARD_H / 2 - 2)); t.rotation.y = sx * sz * .65; groups.bed.attach(t);
  }
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.ShadowMaterial({ opacity: .35 }));
  shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.position.y = bedBox.min.y - .2; shadowCatcher.receiveShadow = true; scene.add(shadowCatcher);

  // simulated heartbeat card: row 1 = just listening, rows 2–3 = guided at 6 breaths a minute
  const ROW_Y = [30, 56, 82], U0 = 10, U1 = CARD_W - 10, N = 56, SPEED = 24, INK = { false: '#a8432f', true: '#2d4f7a' };
  function program() {
    const steps = []; let t = 0;
    ROW_Y.forEach((rowY, r) => {
      const guided = r > 0; steps.push({ up: true, u: U0, v: rowY, guided });
      for (let b = 0; b <= N; b++) {
        let ibi;
        if (!guided) ibi = .84 + .045 * Math.sin(t * 1.9) + .035 * Math.sin(t * 4.3 + 1) + (Math.random() - .5) * .07;
        else { const k = r === 1 ? clamp(b / N * 1.4, 0, 1) : 1;
          ibi = .86 + k * .085 * Math.sin(2 * Math.PI * .1 * t) + (1 - k) * (Math.random() - .5) * .06 + (Math.random() - .5) * .012; }
        t += ibi; steps.push({ up: false, u: U0 + (U1 - U0) * b / N, v: rowY - (ibi - .86) * 120, guided });
      }
    });
    steps.push({ up: true, u: CARD_W / 2, v: 4, done: true });
    return steps;
  }
  function clearCard() {
    ctx.fillStyle = '#f4efe4'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = 'rgba(40,38,48,.45)'; ctx.font = `${3.2 * PX}px Georgia, serif`;
    ctx.fillText('listen', U0 * PX, (ROW_Y[0] - 14) * PX); ctx.fillText('guided · 6 breaths / min', U0 * PX, (ROW_Y[1] - 14) * PX);
    tex.needsUpdate = true;
  }
  let prog, idx, pos, penDown, lift, doneAt = 0, host = null, last = performance.now();
  const restart = () => { prog = program(); idx = 0; pos = { u: U0, v: ROW_Y[0] }; penDown = false; lift = 1; clearCard(); };
  restart();

  function fit() { if (!host) return; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = (w / h < 1.1 ? 46 : w / h < 1.6 ? 36 : 30) * (h < 330 ? 1.3 : 1); camera.updateProjectionMatrix(); }   // a short frame (the home cover's small cell) needs a wider view so the base isn't cut
  new ResizeObserver(fit).observe(document.body);

  // hover: the machine turns a little toward the mouse; drag still orbits freely
  const look = { y: 0, x: 0 };
  renderer.domElement.addEventListener('pointermove', e => { if (e.buttons) return;
    const r = renderer.domElement.getBoundingClientRect();
    look.y = ((e.clientX - r.left) / r.width * 2 - 1) * .55; look.x = ((e.clientY - r.top) / r.height * 2 - 1) * .12; });
  renderer.domElement.addEventListener('pointerleave', () => { look.y = 0; look.x = 0; });

  renderer.setAnimationLoop(now => {
    if (!host || !host.isConnected || document.hidden || (window.__seen && host.dataset.vis !== '1')) return;   // paused off screen
    if (now - last < 31) return;                                       // 30 frames a second
    const rdt = Math.min(.1, (now - last) / 1000); last = now;
    scene.rotation.y += (look.y - scene.rotation.y) * .08; scene.rotation.x += (look.x - scene.rotation.x) * .08;
    let budget = rdt * speed;
    while (budget > 0 && idx < prog.length) {
      const s = prog[idx], wantDown = !s.up;
      if (wantDown !== penDown) { lift += (wantDown ? -1 : 1) * budget / .3; budget = 0;
        if (lift <= 0) { lift = 0; penDown = true; } else if (lift >= 1) { lift = 1; penDown = false; } break; }
      const du = s.u - pos.u, dv = s.v - pos.v, d = Math.hypot(du, dv), step = SPEED * budget;
      const nu = d <= step ? s.u : pos.u + du / d * step, nv = d <= step ? s.v : pos.v + dv / d * step;
      if (penDown) { ctx.strokeStyle = INK[!!s.guided]; ctx.lineWidth = .45 * PX; ctx.lineCap = ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(pos.u * PX, pos.v * PX); ctx.lineTo(nu * PX, nv * PX); ctx.stroke(); tex.needsUpdate = true; }
      for (const g of gears) g.pivot.rotation[g.axis] += (g.role === 'gx' ? -(nu - pos.u) : (nv - pos.v)) / 7;
      pos = { u: nu, v: nv };
      if (d <= step) { budget -= d / SPEED; idx++; } else budget = 0;
    }
    if (idx >= prog.length) { if (!doneAt) doneAt = now; if (now - doneAt > 5000) { doneAt = 0; restart(); } }
    groups.x.position.x = pos.u - CARD_W / 2 + (bedCx - penX);
    groups.bed.position.z = penZ - (bedCz - CARD_H / 2 + pos.v);
    groups.z.position.y = lift * 4;
    controls.update(); renderer.render(scene, camera);
  });

  return {
    mount(el) {
      host = el; if (!el) return; window.__seen?.observe(el);
      el.querySelector('.loading')?.remove(); el.appendChild(renderer.domElement);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y';
      fit();
    },
  };
}
