"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

/* Hero scene — the agent graph as a living network.
   Nodes sit on a jittered sphere and connect to their nearest neighbours.
   "Signals" random-walk the edges as comet-tailed pulses; a node flashes
   when a signal reaches it (an agent firing). A disc of data dust streams
   inward around it. `progressRef` (0 → 1, scroll) tightens the network and
   brightens it — the analysis converging. Plain three.js + small shaders. */

const NODE_VERT = /* glsl */ `
  attribute float aActive;
  attribute float aSize;
  attribute float aHue;
  uniform float uPixelRatio;
  uniform float uBoost;
  varying float vActive;
  varying float vHue;
  varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float s = aSize * (1.0 + aActive * 1.8 + uBoost * 0.3);
    gl_PointSize = s * uPixelRatio * (30.0 / -mv.z);
    vActive = aActive;
    vHue = aHue;
    vDepth = clamp((-mv.z - 4.0) / 6.0, 0.0, 1.0);
  }
`;

const NODE_FRAG = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  varying float vActive;
  varying float vHue;
  varying float vDepth;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    float glow = pow(core, 2.2);
    vec3 col = mix(uA, uB, smoothstep(0.0, 0.6, vHue));
    col = mix(col, uC, smoothstep(0.6, 1.0, vHue));
    col = mix(col, vec3(1.0), vActive * 0.65);
    float alpha = glow * mix(1.0, 0.45, vDepth) * (0.8 + vActive * 0.8);
    gl_FragColor = vec4(col, alpha);
  }
`;

const PULSE_VERT = /* glsl */ `
  attribute float aFade;
  uniform float uPixelRatio;
  varying float vFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.2 + aFade * 3.2) * uPixelRatio * (30.0 / -mv.z);
    vFade = aFade;
  }
`;

const PULSE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float g = pow(smoothstep(0.5, 0.0, d), 1.8);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), vFade * 0.25), g * vFade * 0.85);
  }
`;

const DUST_VERT = /* glsl */ `
  attribute float aR;
  attribute float aA;
  attribute float aSpeed;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    // spiral inward, respawn at the rim
    float t = fract(uTime * aSpeed + aSeed);
    float r = mix(aR, 2.2, t);
    float a = aA + t * 2.2 + uTime * 0.05;
    vec3 p = vec3(cos(a) * r, (aSeed - 0.5) * 0.35 * (1.0 - t), sin(a) * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.0 + aSeed * 1.6) * uPixelRatio * (24.0 / -mv.z);
    vAlpha = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.75, 1.0, t));
  }
`;

const DUST_FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(0.55, 0.9, 0.95), smoothstep(0.5, 0.0, d) * vAlpha * 0.55);
  }
`;

const TRAIL = 6; // points per comet

export function NeuralScene({ progressRef, className }: { progressRef?: MutableRefObject<number>; className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.innerWidth < 768;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      mount.dataset.fallback = "true";
      return;
    }
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0.4, 8.6);
    const brain = new THREE.Group();
    scene.add(brain);

    // ── nodes: fibonacci sphere + inner shell for depth ──────────────
    const N = small ? 110 : 170;
    const base: THREE.Vector3[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = golden * i;
      const shell = i % 5 === 0 ? 1.15 + Math.random() * 0.6 : 2.25 + (Math.random() - 0.5) * 0.35;
      base.push(new THREE.Vector3(Math.cos(th) * rad * shell, y * shell * 0.92, Math.sin(th) * rad * shell));
    }

    // k-nearest edges, deduplicated
    const K = 3;
    const edgeSet = new Set<string>();
    const edges: [number, number][] = [];
    const neighbours: number[][] = base.map(() => []);
    base.forEach((p, i) => {
      const d = base.map((q, j) => [j, p.distanceToSquared(q)] as const).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
      for (let k = 0; k < K; k++) {
        const j = d[k][0];
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push([i, j]);
          neighbours[i].push(j);
          neighbours[j].push(i);
        }
      }
    });

    const nodePos = new Float32Array(N * 3);
    const nodeActive = new Float32Array(N);
    const nodeSize = new Float32Array(N);
    const nodeHue = new Float32Array(N);
    base.forEach((p, i) => {
      nodePos.set([p.x, p.y, p.z], i * 3);
      nodeSize[i] = 2.4 + Math.random() * 2.2 + (i % 5 === 0 ? 1.6 : 0);
      nodeHue[i] = (p.y + 2.5) / 5 + (Math.random() - 0.5) * 0.2;
    });
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(nodePos, 3));
    const activeAttr = new THREE.BufferAttribute(nodeActive, 1);
    activeAttr.setUsage(THREE.DynamicDrawUsage);
    nodeGeo.setAttribute("aActive", activeAttr);
    nodeGeo.setAttribute("aSize", new THREE.BufferAttribute(nodeSize, 1));
    nodeGeo.setAttribute("aHue", new THREE.BufferAttribute(nodeHue, 1));
    const colors = {
      uA: { value: new THREE.Color("#5eead4") },
      uB: { value: new THREE.Color("#818cf8") },
      uC: { value: new THREE.Color("#e879f9") },
    };
    const nodeUniforms = { ...colors, uPixelRatio: { value: pixelRatio }, uBoost: { value: 0 } };
    const nodeMat = new THREE.ShaderMaterial({
      vertexShader: NODE_VERT, fragmentShader: NODE_FRAG, uniforms: nodeUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    brain.add(new THREE.Points(nodeGeo, nodeMat));

    // ── edges with vertex colors ───────────────────────────────────
    const edgePos = new Float32Array(edges.length * 6);
    const edgeCol = new Float32Array(edges.length * 6);
    const cA = new THREE.Color("#5eead4"), cB = new THREE.Color("#818cf8"), cC = new THREE.Color("#e879f9");
    const hueColor = (h: number) => (h < 0.6 ? cA.clone().lerp(cB, h / 0.6) : cB.clone().lerp(cC, (h - 0.6) / 0.4));
    edges.forEach(([a, b], e) => {
      edgePos.set([base[a].x, base[a].y, base[a].z, base[b].x, base[b].y, base[b].z], e * 6);
      const ca = hueColor(Math.min(1, Math.max(0, nodeHue[a])));
      const cb = hueColor(Math.min(1, Math.max(0, nodeHue[b])));
      edgeCol.set([ca.r, ca.g, ca.b, cb.r, cb.g, cb.b], e * 6);
    });
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
    edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeCol, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    brain.add(new THREE.LineSegments(edgeGeo, edgeMat));

    // ── signals: comets random-walking the edges ────────────────────
    const P = small ? 45 : 80;
    type Pulse = { from: number; to: number; t: number; speed: number };
    const pulses: Pulse[] = Array.from({ length: P }, () => {
      const from = Math.floor(Math.random() * N);
      const nb = neighbours[from];
      return { from, to: nb[Math.floor(Math.random() * nb.length)], t: Math.random(), speed: 0.5 + Math.random() * 0.9 };
    });
    const pulsePos = new Float32Array(P * TRAIL * 3);
    const pulseFade = new Float32Array(P * TRAIL);
    for (let p = 0; p < P; p++) for (let k = 0; k < TRAIL; k++) pulseFade[p * TRAIL + k] = 1 - k / TRAIL;
    const pulseGeo = new THREE.BufferGeometry();
    const pulseAttr = new THREE.BufferAttribute(pulsePos, 3);
    pulseAttr.setUsage(THREE.DynamicDrawUsage);
    pulseGeo.setAttribute("position", pulseAttr);
    pulseGeo.setAttribute("aFade", new THREE.BufferAttribute(pulseFade, 1));
    pulseGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    const pulseMat = new THREE.ShaderMaterial({
      vertexShader: PULSE_VERT, fragmentShader: PULSE_FRAG,
      uniforms: { uPixelRatio: { value: pixelRatio }, uColor: { value: new THREE.Color("#c4b5fd") } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    brain.add(new THREE.Points(pulseGeo, pulseMat));

    // ── data dust streaming in ──────────────────────────────────────
    const D = small ? 900 : 1800;
    const dustGeo = new THREE.BufferGeometry();
    const dr = new Float32Array(D), da = new Float32Array(D), ds = new Float32Array(D), dseed = new Float32Array(D);
    for (let i = 0; i < D; i++) {
      dr[i] = 4.2 + Math.random() * 3.2;
      da[i] = Math.random() * Math.PI * 2;
      ds[i] = 0.025 + Math.random() * 0.05;
      dseed[i] = Math.random();
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(D * 3), 3));
    dustGeo.setAttribute("aR", new THREE.BufferAttribute(dr, 1));
    dustGeo.setAttribute("aA", new THREE.BufferAttribute(da, 1));
    dustGeo.setAttribute("aSpeed", new THREE.BufferAttribute(ds, 1));
    dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(dseed, 1));
    dustGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
    const dustUniforms = { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } };
    const dustMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: dustUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.rotation.x = 0.42;
    scene.add(dust);

    // ── core glow sprite ────────────────────────────────────────────
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const g = cv.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(232,121,249,0.55)");
    grad.addColorStop(0.2, "rgba(129,140,248,0.32)");
    grad.addColorStop(0.5, "rgba(94,234,212,0.08)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(cv);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(5.5);
    scene.add(glow);

    // ── layout / input / visibility ─────────────────────────────────
    const resize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = w / h < 0.9 ? 13 : 8.6;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
    io.observe(mount);

    // ── loop ────────────────────────────────────────────────────────
    const tmp = new THREE.Vector3();
    let last = performance.now();
    let elapsed = 0;
    let prog = 0;
    let raf = 0;

    const step = (dt: number) => {
      elapsed += dt;
      const target = progressRef?.current ?? 0;
      prog += (target - prog) * 0.06;
      const speedMul = 1 + prog * 1.5;

      // node activation decay
      for (let i = 0; i < N; i++) nodeActive[i] *= Math.exp(-dt * 3.2);

      for (let p = 0; p < P; p++) {
        const s = pulses[p];
        s.t += dt * s.speed * speedMul;
        if (s.t >= 1) {
          nodeActive[s.to] = 1;
          const nb = neighbours[s.to];
          const next = nb[Math.floor(Math.random() * nb.length)];
          s.from = s.to;
          s.to = next === s.from ? nb[0] : next;
          s.t = 0;
        }
        const a = base[s.from], b = base[s.to];
        for (let k = 0; k < TRAIL; k++) {
          const tt = Math.max(0, s.t - k * 0.03);
          tmp.copy(a).lerp(b, tt);
          pulsePos.set([tmp.x, tmp.y, tmp.z], (p * TRAIL + k) * 3);
        }
      }
      activeAttr.needsUpdate = true;
      pulseAttr.needsUpdate = true;

      dustUniforms.uTime.value = elapsed;
      nodeUniforms.uBoost.value = prog;
      edgeMat.opacity = 0.28 + prog * 0.18;

      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      brain.rotation.y = elapsed * (0.08 + prog * 0.05) + pointer.x * 0.35;
      brain.rotation.x = 0.15 + pointer.y * 0.18;
      const sc = 1 - prog * 0.12;
      brain.scale.setScalar(sc);
      dust.rotation.y = elapsed * 0.02;
      glow.material.opacity = 0.75 + Math.sin(elapsed * 1.3) * 0.12 + prog * 0.2;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      step(reduced ? 0 : dt);
      renderer.render(scene, camera);
    };
    if (reduced) {
      // settle into a still frame with a few lit nodes
      for (let i = 0; i < 40; i++) step(0.03);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      [nodeGeo, edgeGeo, pulseGeo, dustGeo].forEach((x) => x.dispose());
      [nodeMat, edgeMat, pulseMat, dustMat, glowMat].forEach((x) => x.dispose());
      glowTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [progressRef]);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className={"pointer-events-none data-[fallback=true]:bg-[radial-gradient(circle_at_center,rgba(129,140,248,0.18),transparent_60%)] " + (className ?? "")}
    />
  );
}
