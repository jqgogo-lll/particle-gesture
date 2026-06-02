import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Error display
window.onerror = (msg, src, line) => {
  const el = document.getElementById('status');
  if (el) { el.textContent = '❌ ' + msg + ' L' + line; el.style.color = '#f44'; }
};

const statusEl = document.getElementById('status');
const gestureEl = document.getElementById('gesture-label');

statusEl.textContent = '✅ Renderer OK';
statusEl.style.color = '#0f0';

// ── Renderer ───────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000);
document.body.prepend(renderer.domElement);
Object.assign(renderer.domElement.style, {
  position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', zIndex: '0',
});

// ── Scene & Camera ─────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(0, 0, 12);
camera.lookAt(0, 0, 0);

// ── Post Processing ────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.4, 0.15
);
composer.addPass(bloomPass);

statusEl.textContent = '✅ Scene ready — particles loading...';
statusEl.style.color = '#0f0';

// ── Particle Sphere ────────────────────────────
const COUNT = 6000;
const COMPACT_R = 0.4;
const SCATTER_R = 10;

const baseDir = new Float32Array(COUNT * 3);
const baseR = new Float32Array(COUNT);
const posArr = new Float32Array(COUNT * 3);
const velArr = new Float32Array(COUNT * 3); // velocity for spring physics
const colArr = new Float32Array(COUNT * 3);
const sizeArr = new Float32Array(COUNT);

// ── Cosmic color palette ──────────────────────
const cosmicPalette = [
  new THREE.Color('#FF6B35'), // warm orange
  new THREE.Color('#FFD700'), // gold
  new THREE.Color('#FF2D95'), // hot pink
  new THREE.Color('#F72585'), // neon rose
  new THREE.Color('#C73A8A'), // magenta glow
  new THREE.Color('#9B30FF'), // electric purple
  new THREE.Color('#6A0CFF'), // violet
  new THREE.Color('#7B68EE'), // slate blue
  new THREE.Color('#00BFFF'), // deep sky blue
  new THREE.Color('#00DDDD'), // cyan
  new THREE.Color('#00FFAA'), // mint teal
  new THREE.Color('#69F0AE'), // soft green
];

function cosmicColor(r, phi) {
  // Map position to hue: core warm → mid magenta → edge cool
  const t = r; // 0 (center) to 1 (edge)
  const hueShift = phi / (Math.PI * 2); // 0-1 based on angle

  // Pick base color index from position
  let idx;
  if (t < 0.25) {
    // Core: warm golds and oranges
    idx = (hueShift * 3) | 0;
  } else if (t < 0.5) {
    // Inner: pinks and magentas
    idx = 3 + ((hueShift * 4) | 0);
  } else if (t < 0.75) {
    // Outer: purples and violets
    idx = 6 + ((hueShift * 3) | 0);
  } else {
    // Edge: blues and cyans
    idx = 9 + ((hueShift * 3) | 0);
  }
  idx = Math.min(idx, cosmicPalette.length - 1);

  // Add random variation
  const c = cosmicPalette[idx].clone();
  c.r += (Math.random() - 0.5) * 0.2;
  c.g += (Math.random() - 0.5) * 0.2;
  c.b += (Math.random() - 0.5) * 0.2;
  return c;
}

for (let i = 0; i < COUNT; i++) {
  // Uniform volume distribution
  const u = Math.random() * 2 - 1;
  const theta = Math.random() * Math.PI * 2;
  const r = Math.cbrt(Math.random());
  const s = Math.sqrt(1 - u * u);
  const dx = s * Math.cos(theta);
  const dy = s * Math.sin(theta);
  const dz = u;

  baseDir[i * 3] = dx;
  baseDir[i * 3 + 1] = dy;
  baseDir[i * 3 + 2] = dz;
  baseR[i] = r * SCATTER_R;

  // Start at scattered positions
  posArr[i * 3] = dx * r * SCATTER_R;
  posArr[i * 3 + 1] = dy * r * SCATTER_R;
  posArr[i * 3 + 2] = dz * r * SCATTER_R;

  const phi = Math.atan2(dy, dx) + Math.PI;
  const c = cosmicColor(r, phi);
  colArr[i * 3] = c.r;
  colArr[i * 3 + 1] = c.g;
  colArr[i * 3 + 2] = c.b;

  sizeArr[i] = 0.04 + Math.random() * 0.10;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
geo.setAttribute('size', new THREE.BufferAttribute(sizeArr, 1));

const mat = new THREE.ShaderMaterial({
  uniforms: {},
  vertexShader: `
    attribute float size;
    attribute vec3 color;
    varying vec3 vColor;
    void main() {
      vColor = color;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (600.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float a = exp(-d * d * 1.8);
      vec3 c = vColor * (1.5 + exp(-d * d * 3.0));
      gl_FragColor = vec4(c, a * 0.9);
    }
  `,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: true,
  transparent: true,
});

const points = new THREE.Points(geo, mat);
scene.add(points);

statusEl.textContent = '🖐 点击启动手势追踪';
statusEl.style.color = 'rgba(120,200,255,0.9)';

// ── State ──────────────────────────────────────
const hand = { active: false, gesture: 'open', roll: 0, prevRoll: 0, rollDelta: 0, extended: 5, prevExtended: 5 };
const mouse = { active: false, gesture: 'open' };
let curR = SCATTER_R;
let curAngle = 0;

document.addEventListener('mousemove', (e) => {
  mouse.active = true;
});
document.addEventListener('mouseleave', () => { mouse.active = false; });
document.addEventListener('mousedown', () => { mouse.gesture = 'fist'; });
document.addEventListener('mouseup', () => { mouse.gesture = 'open'; });

document.addEventListener('touchstart', () => { mouse.active = true; }, { passive: true });
document.addEventListener('touchend', () => { mouse.active = false; });
document.addEventListener('touchmove', () => { mouse.active = true; }, { passive: true });

// ── Hand Tracking ──────────────────────────────
let handLandmarker = null;
let lastVideoTime = -1;
const videoEl = document.createElement('video');
videoEl.setAttribute('playsinline', '');
videoEl.setAttribute('autoplay', '');

async function initHands() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    videoEl.srcObject = stream;
    await videoEl.play();

    const vision = await FilesetResolver.forVisionTasks(
      '/wasm'
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    statusEl.textContent = '🖐 张开=散开旋转 | ✊ 握拳=聚拢';
    statusEl.style.color = 'rgba(120,200,255,0.9)';
    setTimeout(() => { statusEl.style.opacity = '0'; }, 3000);
  } catch (err) {
    statusEl.textContent = '📷 摄像头未授权 — 鼠标模式';
    statusEl.style.color = 'rgba(255,200,100,0.9)';
  }
}

function countFingers(lm) {
  let n = 0;
  const tips = [4, 8, 12, 16, 20];
  const dips = [3, 6, 10, 14, 18];
  for (let i = 0; i < 5; i++) {
    if (i === 0) { if (Math.abs(lm[tips[i]].x - lm[5].x) > 0.07) n++; }
    else { if (lm[tips[i]].y < lm[dips[i]].y) n++; }
  }
  return n;
}

function shortAngle(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function detectHands() {
  if (!handLandmarker || videoEl.readyState < 2) return;
  const now = performance.now();
  if (videoEl.currentTime === lastVideoTime) return;
  lastVideoTime = videoEl.currentTime;

  const r = handLandmarker.detectForVideo(videoEl, now);
  if (!r.landmarks?.length) { hand.active = false; return; }

  const lm = r.landmarks[0];
  const rawRoll = Math.atan2(lm[17].y - lm[5].y, lm[17].x - lm[5].x);

  if (hand.active) {
    hand.rollDelta = shortAngle(rawRoll, hand.prevRoll);
    hand.roll += hand.rollDelta * 3;
  } else {
    hand.roll = rawRoll;
    hand.rollDelta = 0;
  }
  hand.prevRoll = rawRoll;
  hand.prevExtended = hand.extended;
  hand.extended = countFingers(lm);
  hand.gesture = hand.extended <= 1 ? 'fist' : hand.extended === 2 ? 'pinch' : 'open';
  hand.active = true;
}

// ── Animation ──────────────────────────────────
const labels = { open: '🖐 散开', fist: '✊ 聚拢', pinch: '🤏' };
let lastG = '';

function animate(ts) {
  requestAnimationFrame(animate);

  const t = ts * 0.001;
  const src = hand.active ? hand : mouse;
  const g = src.gesture;
  const ha = src.active;

  // Speed from movement velocity
  const fd = ha ? Math.abs(hand.extended - hand.prevExtended) : 0;
  const rd = ha ? Math.abs(hand.rollDelta) : 0;
  const expandSpd = Math.min(0.05 + fd * 0.08, 0.22);
  const rotSpd = Math.min(0.12 + (fd + rd * 2) * 0.15, 0.35);

  // Radius
  const tr = g === 'fist' ? COMPACT_R : g === 'pinch' ? 1.8 : SCATTER_R;
  curR += (tr - curR) * expandSpd;

  // Z-axis rotation (palm roll when open)
  const ta = (ha && g === 'open') ? hand.roll : curAngle;
  curAngle += (ta - curAngle) * rotSpd;

  // Label
  if (ha && g !== lastG) {
    lastG = g;
    gestureEl.textContent = labels[g] || '';
    gestureEl.style.opacity = '1';
    clearTimeout(gestureEl._to);
    gestureEl._to = setTimeout(() => { gestureEl.style.opacity = '0'; }, 1500);
  }

  // Update particles
  const cr = curR;
  const cosA = Math.cos(curAngle);
  const sinA = Math.sin(curAngle);
  const stiffness = 35;
  const damping = 12;

  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    const bx = baseDir[i3];
    const by = baseDir[i3 + 1];
    const bz = baseDir[i3 + 2];
    const br = baseR[i];

    const tr2 = br * (cr / SCATTER_R);
    let tx = bx * tr2;
    let ty = by * tr2;
    let tz = bz * tr2;

    // Z-axis rotation (palm roll)
    const rx = tx * cosA - ty * sinA;
    const ry = tx * sinA + ty * cosA;

    // Spring-damper
    velArr[i3] += ((rx - posArr[i3]) * stiffness - velArr[i3] * damping) * 0.016;
    velArr[i3 + 1] += ((ry - posArr[i3 + 1]) * stiffness - velArr[i3 + 1] * damping) * 0.016;
    velArr[i3 + 2] += ((tz - posArr[i3 + 2]) * stiffness - velArr[i3 + 2] * damping) * 0.016;

    posArr[i3] += velArr[i3] * 0.016;
    posArr[i3 + 1] += velArr[i3 + 1] * 0.016;
    posArr[i3 + 2] += velArr[i3 + 2] * 0.016;

    // Micro-wobble
    posArr[i3] += Math.sin(t * 3 + i * 0.01) * 0.002;
    posArr[i3 + 1] += Math.cos(t * 3 + i * 0.01) * 0.002;
    posArr[i3 + 2] += Math.sin(t * 2.7 + i * 0.013) * 0.002;

    sizeArr[i] = 0.02 + 0.12 * (cr / SCATTER_R) + Math.random() * 0.01;
  }

  geo.attributes.position.needsUpdate = true;
  geo.attributes.size.needsUpdate = true;

  camera.lookAt(0, 0, 0);
  composer.render();
}

// ── Start ──────────────────────────────────────
const startBtn = document.getElementById('start-btn');
let started = false;

function trackLoop() {
  detectHands();
  requestAnimationFrame(trackLoop);
}

async function onStart() {
  if (started) return;
  started = true;
  startBtn.classList.add('hidden');
  statusEl.textContent = '初始化摄像头...';
  await initHands();
  trackLoop();
  statusEl.textContent = '';
  setTimeout(() => startBtn.remove(), 500);
}

startBtn.addEventListener('click', onStart);
startBtn.addEventListener('touchend', (e) => { e.preventDefault(); onStart(); });

// Kick off animation immediately
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
});
