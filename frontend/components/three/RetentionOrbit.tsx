"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

/* Hero scene — every particle is a customer in orbit around your product.
   ~15% are churners: they spiral outward and fade. `retainRef.current`
   (0 → 1, driven by scroll in the hero) pulls them back into orbit, which is
   the whole pitch in one gesture. Pure three.js + a custom shader, no
   post-processing, so it stays cheap on laptops. */

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uRetain;
  uniform float uPixelRatio;
  attribute float aRadius;
  attribute float aAngle;
  attribute float aSpeed;
  attribute float aChurn;
  attribute float aSeed;
  attribute float aSize;
  varying float vEscape;
  varying float vSeed;
  varying float vAlpha;

  void main() {
    float ang = aAngle + uTime * aSpeed;
    // Each churner loops through an escape cycle: leaves orbit, fades, respawns.
    float phase = fract(uTime * 0.045 + aSeed * 7.0);
    float escape = aChurn * (1.0 - uRetain) * smoothstep(0.05, 1.0, phase);
    float r = aRadius + escape * 4.2;
    float wobble = sin(ang * 3.0 + aSeed * 40.0 + uTime * 0.6) * 0.04;
    vec3 pos = vec3(
      cos(ang) * r,
      (aSeed - 0.5) * 0.22 * (1.0 + escape * 6.0) + wobble + escape * (aSeed - 0.5) * 1.6,
      sin(ang) * r
    );
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (26.0 / -mv.z);

    vEscape = escape;
    vSeed = aSeed;
    // fade in at respawn, fade out at the far end of the escape
    float fadeIn = smoothstep(0.0, 0.08, phase);
    float fadeOut = 1.0 - smoothstep(0.55, 1.0, escape);
    vAlpha = mix(1.0, fadeIn * fadeOut, aChurn * (1.0 - uRetain));
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  varying float vEscape;
  varying float vSeed;
  varying float vAlpha;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = smoothstep(0.5, 0.0, d);
    float halo = pow(core, 2.4);
    vec3 base = mix(uColorA, uColorB, smoothstep(0.35, 1.0, vSeed));
    vec3 col = mix(base, uColorC, smoothstep(0.0, 0.35, vEscape));
    gl_FragColor = vec4(col, halo * vAlpha * 0.95);
  }
`;

const GLOW_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.6);
    gl_FragColor = vec4(uColor, fres * uIntensity);
  }
`;

export function RetentionOrbit({
  retainRef,
  className,
}: {
  retainRef?: MutableRefObject<number>;
  className?: string;
}) {
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
      mount.dataset.fallback = "true"; // CSS gradient fallback takes over
      return;
    }
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 2.1, 8.2);
    camera.lookAt(0, 0, 0);

    const world = new THREE.Group();
    world.rotation.x = 0.36;
    world.rotation.z = -0.12;
    scene.add(world);

    // ── particles ───────────────────────────────────────────────
    const COUNT = small ? 3200 : 7000;
    const geo = new THREE.BufferGeometry();
    const radius = new Float32Array(COUNT);
    const angle = new Float32Array(COUNT);
    const speed = new Float32Array(COUNT);
    const churn = new Float32Array(COUNT);
    const seed = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);
    const bands = [1.35, 2.15, 3.0, 3.85];
    for (let i = 0; i < COUNT; i++) {
      const band = bands[Math.floor(Math.random() * bands.length)];
      const r = band + (Math.random() - 0.5) * 0.42 + Math.pow(Math.random(), 4) * 0.6;
      radius[i] = r;
      angle[i] = Math.random() * Math.PI * 2;
      speed[i] = (0.16 + Math.random() * 0.12) / Math.sqrt(r); // inner orbits move faster
      churn[i] = Math.random() < 0.15 ? 1 : 0;
      seed[i] = Math.random();
      size[i] = 0.7 + Math.random() * 1.6 + (churn[i] ? 0.4 : 0);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute("aRadius", new THREE.BufferAttribute(radius, 1));
    geo.setAttribute("aAngle", new THREE.BufferAttribute(angle, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
    geo.setAttribute("aChurn", new THREE.BufferAttribute(churn, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

    const uniforms = {
      uTime: { value: 0 },
      uRetain: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uColorA: { value: new THREE.Color("#5eead4") },
      uColorB: { value: new THREE.Color("#a78bfa") },
      uColorC: { value: new THREE.Color("#fb923c") },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    world.add(new THREE.Points(geo, mat));

    // ── orbit guide rings ───────────────────────────────────────
    const ringMat = new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.07 });
    const ringGeos: THREE.BufferGeometry[] = [];
    for (const r of bands) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 256; i++) {
        const a = (i / 256) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      ringGeos.push(g);
      world.add(new THREE.LineLoop(g, ringMat));
    }

    // ── core: dark sphere + fresnel glow shells ─────────────────
    const coreGeo = new THREE.SphereGeometry(0.62, 64, 64);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x050608 });
    world.add(new THREE.Mesh(coreGeo, coreMat));
    const glowGeo = new THREE.SphereGeometry(0.7, 64, 64);
    const glowMat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
      uniforms: { uColor: { value: new THREE.Color("#5eead4") }, uIntensity: { value: 1.4 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glowInner = new THREE.Mesh(glowGeo, glowMat);
    world.add(glowInner);

    // Soft halo: a camera-facing sprite with a radial gradient texture.
    const haloCanvas = document.createElement("canvas");
    haloCanvas.width = haloCanvas.height = 256;
    const hctx = haloCanvas.getContext("2d")!;
    const grad = hctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(167,139,250,0.55)");
    grad.addColorStop(0.25, "rgba(94,234,212,0.22)");
    grad.addColorStop(0.6, "rgba(94,234,212,0.05)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    hctx.fillStyle = grad;
    hctx.fillRect(0, 0, 256, 256);
    const haloTex = new THREE.CanvasTexture(haloCanvas);
    const haloMat = new THREE.SpriteMaterial({
      map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(5.2);
    scene.add(halo);

    // ── sizing, input, visibility ───────────────────────────────
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // pull the camera back on narrow screens so the outer ring still fits
      camera.position.z = w / h < 0.9 ? 12.5 : 8.2;
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
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0 });
    io.observe(mount);

    // ── loop ────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;
    let retainSmoothed = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const t = clock.getElapsedTime();
      uniforms.uTime.value = reduced ? 12 : t;
      const target = retainRef?.current ?? 0;
      retainSmoothed += (target - retainSmoothed) * 0.08;
      uniforms.uRetain.value = retainSmoothed;

      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      world.rotation.y = (reduced ? 0 : t * 0.035) + pointer.x * 0.25;
      world.rotation.x = 0.36 + pointer.y * 0.12;
      const pulse = 1 + Math.sin(t * 1.4) * 0.03 + retainSmoothed * 0.12;
      glowInner.scale.setScalar(pulse);
      (glowMat.uniforms.uIntensity as { value: number }).value = 1.2 + retainSmoothed * 0.8;
      halo.material.opacity = 0.75 + retainSmoothed * 0.25;
      renderer.render(scene, camera);
    };
    if (reduced) {
      renderer.render(scene, camera);
    }
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      geo.dispose();
      mat.dispose();
      ringMat.dispose();
      ringGeos.forEach((g) => g.dispose());
      coreGeo.dispose();
      coreMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      haloMat.dispose();
      haloTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [retainRef]);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className={
        "pointer-events-none data-[fallback=true]:bg-[radial-gradient(ellipse_at_center,rgba(94,234,212,0.12),transparent_60%)] " +
        (className ?? "")
      }
    />
  );
}
