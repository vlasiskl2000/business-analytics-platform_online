/* =========================================================
   scene3d.js  (ES module, Three.js from CDN via importmap)

   1. initBackground()  fixed WebGL scene behind every page:
        - a field of animated data towers
        - a wireframe "data core" with orbiting rings
        - drifting particles
        - mouse + scroll parallax, per-page accent colours
   2. initSkyline()     interactive 3D bar chart of the monthly
        revenue / profit (index.html, element #skyline3d).
        Data comes from app.js through the `ba:monthly` event
        (and window.__baMonthly if it arrived first).

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
   2. 3D DATA SKYLINE (monthly revenue + profit)
   ========================================================= */
function initSkyline() {
    const stage = document.getElementById("skyline3d");
    if (!stage) return;

    const emptyEl = document.getElementById("skyEmpty");
    const tooltip = document.createElement("div");
    tooltip.className = "sky-tooltip";
    stage.appendChild(tooltip);

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
        if (emptyEl) emptyEl.textContent = "3D view needs WebGL, which is not available in this browser.";
        return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    stage.insertBefore(renderer.domElement, stage.firstChild);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    scene.add(new THREE.AmbientLight(0x9aa4ff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(6, 12, 8);
    scene.add(key);
    const rim = new THREE.PointLight(0x22d3ee, 70, 40, 2);
    rim.position.set(-10, 6, -6);
    scene.add(rim);
    const rim2 = new THREE.PointLight(0x7c6cf0, 70, 40, 2);
    rim2.position.set(10, 5, 8);
    scene.add(rim2);

    const world = new THREE.Group();
    scene.add(world);

    const MAX_H = 5.2;
    const violet = new THREE.Color(0x7c6cf0);
    const cyan = new THREE.Color(0x22d3ee);
    const green = new THREE.Color(0x34d399);
    const rose = new THREE.Color(0xfb7185);

    let data = [];
    let revMesh = null;
    let proMesh = null;
    let revBase = [];
    let proBase = [];
    let layout = { spacing: 1, bw: 0.6, span: 10 };
    let growStart = 0;
    let hovered = -1;
    let dispose = [];

    const dummy = new THREE.Object3D();
    const tmp = new THREE.Color();

    const fmtEUR = (v) => "€" + Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

    function makeLabel(text) {
        const c = document.createElement("canvas");
        c.width = 256; c.height = 64;
        const ctx = c.getContext("2d");
        ctx.font = "600 30px Inter, -apple-system, Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#9aa6d6";
        ctx.fillText(text, 128, 32);
        const tex = new THREE.CanvasTexture(c);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        sprite.scale.set(2.2, 0.55, 1);
        dispose.push(tex, sprite.material);
        return sprite;
    }

    function clearWorld() {
        while (world.children.length) {
            const child = world.children[0];
            world.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material && child.material.dispose) child.material.dispose();
        }
        dispose.forEach((d) => d.dispose && d.dispose());
        dispose = [];
        revMesh = proMesh = null;
        revBase = []; proBase = [];
    }

    function build(rows) {
        clearWorld();
        data = rows;
        hovered = -1;
        tooltip.classList.remove("show");

        const n = rows.length;
        const maxRev = rows.reduce((m, r) => Math.max(m, Number(r.revenue) || 0), 0);
        if (!n || maxRev <= 0) {
            if (emptyEl) { emptyEl.textContent = "No monthly data to display yet."; emptyEl.style.display = "grid"; }
            return;
        }
        if (emptyEl) emptyEl.style.display = "none";

        const spacing = Math.min(1.35, 16 / n);
        const bw = spacing * 0.62;
        const span = (n - 1) * spacing + bw * 2;
        layout = { spacing, bw, span };

        /* floor + grid */
        const floorW = span + 5;
        const floorD = bw * 6 + 4;
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(floorW, floorD),
            new THREE.MeshBasicMaterial({ color: 0x151b4a, transparent: true, opacity: 0.55 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.02;
        world.add(floor);

        const grid = new THREE.GridHelper(floorW, Math.max(8, Math.round(floorW)), 0x3a4690, 0x28316d);
        grid.scale.z = floorD / floorW;
        grid.material.transparent = true;
        grid.material.opacity = 0.45;
        world.add(grid);

        /* bars */
        const barGeo = new THREE.BoxGeometry(1, 1, 1);
        const revMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.28 });
        const proMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.3 });
        revMesh = new THREE.InstancedMesh(barGeo, revMat, n);
        proMesh = new THREE.InstancedMesh(barGeo, proMat, n);
        revMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        proMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        for (let i = 0; i < n; i++) {
            const r = rows[i];
            const rev = Math.max(0, Number(r.revenue) || 0);
            const pro = Number(r.profit) || 0;
            const x = (i - (n - 1) / 2) * spacing;
            const hRev = Math.max(0.06, (rev / maxRev) * MAX_H);
            const hPro = Math.max(0.05, (Math.abs(pro) / maxRev) * MAX_H);

            revBase.push({ x, z: -bw * 0.25, h: hRev, w: bw, d: bw, color: new THREE.Color().copy(violet).lerp(cyan, rev / maxRev) });
            proBase.push({ x, z: bw * 0.78, h: hPro, w: bw * 0.62, d: bw * 0.62, color: pro >= 0 ? green.clone() : rose.clone() });

            revMesh.setColorAt(i, revBase[i].color);
            proMesh.setColorAt(i, proBase[i].color);
        }
        revMesh.instanceColor.needsUpdate = true;
        proMesh.instanceColor.needsUpdate = true;
        world.add(revMesh, proMesh);
        dispose.push(barGeo, revMat, proMat);

        /* month labels */
        const step = Math.max(1, Math.ceil(n / 8));
        for (let i = 0; i < n; i += step) {
            const label = makeLabel(String(rows[i].date));
            label.position.set((i - (n - 1) / 2) * spacing, -0.1, bw * 2.2);
            world.add(label);
        }

        growStart = performance.now();
        applyMatrices(0);
        fitCamera();
        needsRender = true;
    }

    function ease(t) { return 1 - Math.pow(1 - t, 3); }

    function applyMatrices(now) {
        if (!revMesh) return true;
        const n = revBase.length;
        let done = true;
        for (let i = 0; i < n; i++) {
            const delay = i * 28;
            const t = now === 0 ? 0 : Math.min(1, Math.max(0, (now - growStart - delay) / 900));
            if (t < 1) done = false;
            const e = ease(t);
            const lift = i === hovered ? 1.0 : 0;

            const rb = revBase[i];
            const hR = Math.max(0.001, rb.h * e);
            dummy.position.set(rb.x, hR / 2, rb.z);
            dummy.scale.set(rb.w * (1 + lift * 0.12), hR, rb.d * (1 + lift * 0.12));
            dummy.updateMatrix();
            revMesh.setMatrixAt(i, dummy.matrix);

            const pb = proBase[i];
            const hP = Math.max(0.001, pb.h * e);
            dummy.position.set(pb.x, hP / 2, pb.z);
            dummy.scale.set(pb.w * (1 + lift * 0.12), hP, pb.d * (1 + lift * 0.12));
            dummy.updateMatrix();
            proMesh.setMatrixAt(i, dummy.matrix);
        }
        revMesh.instanceMatrix.needsUpdate = true;
        proMesh.instanceMatrix.needsUpdate = true;
        return done;
    }

    function paintHover() {
        if (!revMesh) return;
        for (let i = 0; i < revBase.length; i++) {
            tmp.copy(revBase[i].color);
            if (i === hovered) tmp.lerp(new THREE.Color(0xffffff), 0.35);
            revMesh.setColorAt(i, tmp);
            tmp.copy(proBase[i].color);
            if (i === hovered) tmp.lerp(new THREE.Color(0xffffff), 0.35);
            proMesh.setColorAt(i, tmp);
        }
        revMesh.instanceColor.needsUpdate = true;
        proMesh.instanceColor.needsUpdate = true;
    }

    /* ---- camera orbit ---- */
    const orbit = { yaw: -0.55, pitch: 0.62, dist: 16 };
    const target = new THREE.Vector3(0, MAX_H * 0.32, 0);

    function fitCamera() {
        const w = stage.clientWidth || 1;
        const h = stage.clientHeight || 1;
        const aspect = w / h;
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
        const needW = (layout.span + 3) / 2 / Math.tan(hFov / 2);
        const needH = (MAX_H + 4) / 2 / Math.tan(vFov / 2);
        orbit.dist = Math.max(11, Math.min(needW * 0.92, 60), needH * 0.8);
    }

    function placeCamera() {
        const cp = Math.cos(orbit.pitch);
        camera.position.set(
            target.x + orbit.dist * Math.sin(orbit.yaw) * cp,
            target.y + orbit.dist * Math.sin(orbit.pitch),
            target.z + orbit.dist * Math.cos(orbit.yaw) * cp
        );
        camera.lookAt(target);
    }

    function resize() {
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        fitCamera();
        needsRender = true;
    }

    /* ---- interaction ---- */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let moved = 0;
    let pointerInside = false;
    let needsRender = true;

    function pick(clientX, clientY) {
        if (!revMesh) return -1;
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObjects([revMesh, proMesh], false)[0];
        return hit && hit.instanceId !== undefined ? hit.instanceId : -1;
    }

    function showTooltip(index, clientX, clientY) {
        if (index < 0 || !data[index]) {
            tooltip.classList.remove("show");
            return;
        }
        const r = data[index];
        const growth = Number(r.growth_percent) || 0;
        const cls = growth >= 0 ? "up" : "down";
        const arrow = growth >= 0 ? "▲" : "▼";
        tooltip.innerHTML =
            "<b>" + r.date + "</b>" +
            "Revenue: " + fmtEUR(r.revenue) + "<br>" +
            "Profit: " + fmtEUR(r.profit) + "<br>" +
            "<span class=\"" + cls + "\">" + arrow + " " + Math.abs(growth).toFixed(1) + "% vs prev. month</span>";
        const rect = stage.getBoundingClientRect();
        let x = clientX - rect.left + 16;
        let y = clientY - rect.top + 16;
        const tw = tooltip.offsetWidth || 170;
        const th = tooltip.offsetHeight || 90;
        if (x + tw > rect.width - 8) x = clientX - rect.left - tw - 16;
        if (y + th > rect.height - 8) y = clientY - rect.top - th - 16;
        tooltip.style.left = Math.max(8, x) + "px";
        tooltip.style.top = Math.max(8, y) + "px";
        tooltip.classList.add("show");
    }

    stage.addEventListener("pointerdown", (e) => {
        dragging = true;
        moved = 0;
        lastX = e.clientX;
        lastY = e.clientY;
        stage.classList.add("is-dragging");
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });

    stage.addEventListener("pointermove", (e) => {
        pointerInside = true;
        if (dragging) {
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            moved += Math.abs(dx) + Math.abs(dy);
            orbit.yaw -= dx * 0.008;
            orbit.pitch = Math.min(1.25, Math.max(0.12, orbit.pitch + dy * 0.006));
            tooltip.classList.remove("show");
            needsRender = true;
            return;
        }
        const idx = pick(e.clientX, e.clientY);
        if (idx !== hovered) {
            hovered = idx;
            paintHover();
            applyMatrices(performance.now() + 10000);
            needsRender = true;
        }
        showTooltip(idx, e.clientX, e.clientY);
    });

    function endDrag(e) {
        dragging = false;
        stage.classList.remove("is-dragging");
        try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("pointerleave", () => {
        pointerInside = false;
        if (hovered !== -1) {
            hovered = -1;
            paintHover();
            applyMatrices(performance.now() + 10000);
            needsRender = true;
        }
        tooltip.classList.remove("show");
    });

    /* ---- visibility + loop ---- */
    let visible = false;
    if ("IntersectionObserver" in window) {
        new IntersectionObserver((entries) => {
            visible = entries.some((en) => en.isIntersecting);
            if (visible) { resize(); needsRender = true; }
        }, { threshold: 0.05 }).observe(stage);
    } else {
        visible = true;
    }
    if ("ResizeObserver" in window) {
        new ResizeObserver(resize).observe(stage);
    } else {
        window.addEventListener("resize", resize);
    }

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;

        if (visible && !document.hidden && stage.clientWidth > 0) {
            const growing = revMesh ? !applyMatrices(now) : false;
            const autoRotate = !reduceMotion && !dragging && !pointerInside;
            if (autoRotate) orbit.yaw += dt * 0.16;

            if (growing || autoRotate || dragging || needsRender) {
                placeCamera();
                renderer.render(scene, camera);
                needsRender = false;
            }
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    /* ---- data hook ---- */
    function apply(rows) {
        if (!Array.isArray(rows)) return;
        build(rows);
        resize();
    }
    window.addEventListener("ba:monthly", (e) => apply(e.detail));
    if (window.__baMonthly) apply(window.__baMonthly);
}

/* =========================================================
   Boot (kept at the bottom so every const above is initialised)
   ========================================================= */
if (THREE) {
    try { initBackground(); } catch (error) { console.warn("[scene3d] background failed", error); }
    try { initSkyline(); } catch (error) { console.warn("[scene3d] skyline failed", error); }
}
