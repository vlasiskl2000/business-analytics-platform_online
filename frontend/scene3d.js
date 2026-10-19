/* =========================================================
   scene3d.js  (ES module, Three.js from CDN via importmap)

   1. initBackground()  fixed WebGL scene behind every page:
        - a field of animated data towers
        - a wireframe "data core" with orbiting rings
        - drifting particles
        - mouse + scroll parallax, per-page accent colours
   The interactive 3D charts live in charts3d.js.

   If Three.js can not be loaded (offline, blocked CDN) the page
   keeps working: the CSS gradient background stays and nothing
   else is affected.
   ========================================================= */

let THREE = null;
try {
    THREE = await import("three");
} catch (error) {
    console.warn("[scene3d] Three.js could not be loaded - running without 3D.", error);
}

/* ---------------------------------------------------------
   Shared helpers
   --------------------------------------------------------- */
const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const smallScreen = () => window.innerWidth < 800;
const lowPower = () => (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
                       (navigator.deviceMemory && navigator.deviceMemory <= 2);

const THEMES = {
    overview:  [0x7c6cf0, 0x22d3ee, 0xf472b6],
    sales:     [0xfbbf24, 0xf97316, 0xfb7185],
    forecast:  [0x6366f1, 0x8b5cf6, 0x06b6d4],
    anomalies: [0xef4444, 0xf97316, 0xfbbf24],
    alerts:    [0xf59e0b, 0xef4444, 0xfb7185],
    data:      [0x14b8a6, 0x06b6d4, 0x34d399],
    analyst:   [0x8b5cf6, 0x6366f1, 0x22d3ee],
    simulator: [0x22d3ee, 0x6366f1, 0xf472b6],
    goals:     [0x34d399, 0x22d3ee, 0xfbbf24],
    reports:   [0x60a5fa, 0x7c6cf0, 0x22d3ee]
};

function pageColors() {
    const page = document.body.dataset.page || "overview";
    return (THEMES[page] || THEMES.overview).map((hex) => new THREE.Color(hex));
}

function glowTexture() {
    const size = 64;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    return tex;
}

/* =========================================================
   1. BACKGROUND SCENE
   ========================================================= */
function initBackground() {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (error) {
        console.warn("[scene3d] WebGL not available", error);
        return;
    }

    const [c1, c2, c3] = pageColors();
    const maxDpr = lowPower() ? 1 : 1.75;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setClearColor(0x000000, 0);

    const canvas = renderer.domElement;
    canvas.id = "bg3d";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070b1f, 0.030);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
    camera.position.set(0, 2.5, 14);

    /* ---- lights ---- */
    scene.add(new THREE.AmbientLight(0x8a93ff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(5, 10, 7);
    scene.add(sun);
    const lightA = new THREE.PointLight(c1, 90, 40, 2);
    const lightB = new THREE.PointLight(c2, 90, 40, 2);
    scene.add(lightA, lightB);

    /* ---- data towers ---- */
    const compact = smallScreen() || lowPower();
    const cols = compact ? 8 : 13;
    const rows = compact ? 5 : 8;
    const count = cols * rows;
    const spacing = 1.35;

    const towerGeo = new THREE.BoxGeometry(0.9, 1, 0.9);
    const towerMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, metalness: 0.45, roughness: 0.28, transparent: true, opacity: 0.88
    });
    const towers = new THREE.InstancedMesh(towerGeo, towerMat, count);
    towers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const city = new THREE.Group();
    city.position.set(0, -4.6, -7);
    city.add(towers);

    const base = [];
    const tmpColor = new THREE.Color();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i = r * cols + c;
            const x = (c - (cols - 1) / 2) * spacing;
            const z = (r - (rows - 1) / 2) * spacing;
            const dist = Math.hypot(x, z * 1.3);
            const h = 0.5 + Math.random() * 2.4 + Math.max(0, 3.2 - dist * 0.32) * Math.random();
            base.push({ x, z, h, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.7 });
            const t = Math.min(1, h / 5);
            tmpColor.copy(c1).lerp(c2, t);
            if (Math.random() < 0.08) tmpColor.copy(c3);
            towers.setColorAt(i, tmpColor);
        }
    }
    towers.instanceColor.needsUpdate = true;

    const grid = new THREE.GridHelper(cols * spacing + 10, cols * 2 + 8, c2, c1);
    grid.position.y = -0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.16;
    city.add(grid);
    scene.add(city);

    const dummy = new THREE.Object3D();
    function updateTowers(t) {
        for (let i = 0; i < count; i++) {
            const b = base[i];
            const h = b.h * (0.72 + 0.28 * Math.sin(t * b.speed + b.phase));
            dummy.position.set(b.x, h / 2, b.z);
            dummy.scale.set(1, h, 1);
            dummy.updateMatrix();
            towers.setMatrixAt(i, dummy.matrix);
        }
        towers.instanceMatrix.needsUpdate = true;
    }

    /* ---- data core ---- */
    const core = new THREE.Group();
    scene.add(core);

    const wire = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2.1, 1),
        new THREE.MeshBasicMaterial({ color: c2, wireframe: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const solid = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.35, 2),
        new THREE.MeshStandardMaterial({ color: c1, emissive: c1, emissiveIntensity: 0.55, metalness: 0.5, roughness: 0.25, flatShading: true, transparent: true, opacity: 0.92 })
    );
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: c1, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.scale.set(9, 9, 1);
    core.add(halo, solid, wire);

    const rings = [];
    const satellites = [];
    [[3.0, 0.9, 0.3, c2], [3.7, -0.6, 1.1, c3], [4.4, 0.2, -0.7, c1]].forEach(([radius, rx, rz, color], idx) => {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(radius, 0.016, 8, 160),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        ring.rotation.set(rx, 0, rz);
        core.add(ring);
        rings.push(ring);

        const sat = new THREE.Mesh(
            new THREE.SphereGeometry(0.11, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        ring.add(sat);
        satellites.push({ mesh: sat, radius, speed: 0.4 + idx * 0.18, offset: idx * 2.1 });
    });

    /* ---- particles ---- */
    const pCount = compact ? 260 : 620;
    const pPos = new Float32Array(pCount * 3);
    const pCol = new Float32Array(pCount * 3);
    const pSpeed = new Float32Array(pCount);
    const palette = [c1, c2, c3, new THREE.Color(0xffffff)];
    for (let i = 0; i < pCount; i++) {
        pPos[i * 3]     = (Math.random() - 0.5) * 44;
        pPos[i * 3 + 1] = (Math.random() - 0.5) * 26;
        pPos[i * 3 + 2] = (Math.random() - 0.5) * 30 - 4;
        pSpeed[i] = 0.12 + Math.random() * 0.4;
        const col = palette[Math.floor(Math.random() * palette.length)];
        pCol[i * 3] = col.r; pCol[i * 3 + 1] = col.g; pCol[i * 3 + 2] = col.b;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
        size: 0.22, map: glowTexture(), vertexColors: true, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    scene.add(particles);

    /* ---- sizing / responsive placement ---- */
    let aspect = 1;
    function resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        aspect = w / Math.max(h, 1);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    const coreTarget = { x: 8, y: 3, z: -5, s: 0.8 };
    let authFlag = false;
    function authActive() {
        const a = document.getElementById("authScreen");
        return !!a && a.classList.contains("auth-visible");
    }
    function updateCoreTarget() {
        authFlag = authActive();
        const wide = aspect > 1.1;
        if (authFlag) {
            coreTarget.x = wide ? 2.4 : 0;
            coreTarget.y = wide ? 0.4 : 3.2;
            coreTarget.z = -1.5;
            coreTarget.s = wide ? 1.5 : 0.9;
        } else {
            coreTarget.x = wide ? 9 : 0;
            coreTarget.y = wide ? 3.4 : 6.2;
            coreTarget.z = -6;
            coreTarget.s = wide ? 0.85 : 0.55;
        }
    }
    updateCoreTarget();
    core.position.set(coreTarget.x, coreTarget.y, coreTarget.z);
    core.scale.setScalar(coreTarget.s);

    /* ---- pointer + scroll parallax ---- */
    const pointer = { x: 0, y: 0 };
    window.addEventListener("pointermove", (e) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    let scrollY = window.scrollY || 0;
    window.addEventListener("scroll", () => { scrollY = window.scrollY || 0; }, { passive: true });

    /* ---- render loop ---- */
    const clock = new THREE.Clock();
    let running = !document.hidden;
    document.addEventListener("visibilitychange", () => {
        running = !document.hidden;
        if (running) clock.getDelta();
    });

    let frames = 0;
    let slowTime = 0;
    let degraded = false;

    function frame() {
        if (running) {
            const dt = Math.min(clock.getDelta(), 0.1);
            const t = clock.elapsedTime;

            updateTowers(t);

            city.rotation.y = t * 0.05 + scrollY * 0.0005;
            city.position.y = -4.6 + Math.min(scrollY, 1400) * 0.0012;

            core.rotation.y += dt * 0.16;
            core.rotation.x = Math.sin(t * 0.3) * 0.18 + pointer.y * 0.2;
            solid.rotation.y -= dt * 0.35;
            solid.rotation.x += dt * 0.12;
            wire.rotation.y += dt * 0.12;
            rings.forEach((ring, i) => { ring.rotation.z += dt * (0.1 + i * 0.05); });
            satellites.forEach((s) => {
                const a = t * s.speed + s.offset;
                s.mesh.position.set(Math.cos(a) * s.radius, Math.sin(a) * s.radius, 0);
            });
            halo.material.opacity = 0.45 + Math.sin(t * 1.4) * 0.1;

            if (frames % 20 === 0) updateCoreTarget();
            const k = 1 - Math.pow(0.001, dt); // smooth, frame-rate independent
            core.position.x += (coreTarget.x - core.position.x) * k * 0.9;
            core.position.y += (coreTarget.y + Math.sin(t * 0.8) * 0.25 - core.position.y) * k * 0.9;
            core.position.z += (coreTarget.z - core.position.z) * k * 0.9;
            const s = core.scale.x + (coreTarget.s - core.scale.x) * k * 0.9;
            core.scale.setScalar(s);

            const pos = pGeo.attributes.position;
            for (let i = 0; i < pCount; i++) {
                let y = pos.getY(i) + pSpeed[i] * dt;
                if (y > 13) y = -13;
                pos.setY(i, y);
            }
            pos.needsUpdate = true;
            particles.rotation.y = t * 0.012;

            lightA.position.set(Math.sin(t * 0.4) * 9, 3 + Math.cos(t * 0.3) * 2, 4);
            lightB.position.set(Math.cos(t * 0.35) * 10, -1 + Math.sin(t * 0.5) * 2, 3);

            camera.position.x += (pointer.x * 1.4 - camera.position.x) * 0.04;
            camera.position.y += (2.5 - pointer.y * 0.8 - camera.position.y) * 0.04;
            camera.lookAt(0, 0.6, 0);

            renderer.render(scene, camera);

            // Adaptive quality: if the first seconds are slow, lighten up once.
            frames++;
            if (!degraded && frames > 30 && frames <= 150) {
                slowTime += dt;
                if (frames === 150 && slowTime / 120 > 0.034) {
                    degraded = true;
                    renderer.setPixelRatio(1);
                    renderer.setSize(window.innerWidth, window.innerHeight, false);
                    particles.visible = false;
                }
            }
        }
        requestAnimationFrame(frame);
    }

    if (reduceMotion) {
        // single static frame, re-rendered on resize
        updateTowers(1.2);
        camera.lookAt(0, 0.6, 0);
        renderer.render(scene, camera);
        window.addEventListener("resize", () => renderer.render(scene, camera));
    } else {
        requestAnimationFrame(frame);
    }
}

/* =========================================================
   Boot (kept at the bottom so every const above is initialised)
   ========================================================= */
if (THREE) {
    try { initBackground(); } catch (error) { console.warn("[scene3d] background failed", error); }
}
