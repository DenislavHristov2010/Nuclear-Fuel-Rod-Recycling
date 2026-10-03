import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// This file owns the 3D scene only. It knows nothing about the simulation
// state machine, the API, or the chart — cooling.js drives it by calling
// updateCoolingVisual() every frame with plain numbers/booleans.

let renderer, scene, camera;
let mount;
let rodMaterial;
let cherenkovMaterial;
let heatPoints, heatParticles;
let flowPoints, flowOffsets;
let flowCurve;
let flowSpeed = 0;
let currentHeatFraction = 0;
let targetHeatFraction = 0;
let flowActive = false;
let onPickCallback = null;
let initialized = false;

const pickables = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();

function buildPool() {
    const wallsGeometry = new THREE.BoxGeometry(6.6, 4.3, 4.6);
    const wallsMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4e53, side: THREE.BackSide });
    const walls = new THREE.Mesh(wallsGeometry, wallsMaterial);
    walls.position.y = -0.1;
    scene.add(walls);

    const waterGeometry = new THREE.BoxGeometry(6, 4, 4);
    const waterMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x226688,
        transparent: true,
        opacity: 0.45,
        roughness: 0.2,
    });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.position.y = -0.1;
    water.userData.infoKey = 'water';
    scene.add(water);
    pickables.push(water);

    return water;
}

function buildAssembly() {
    const assembly = new THREE.Group();

    const rows = 5;
    const spacing = 0.3;
    const rodLength = 2.6;
    const rodY = -0.6;
    const offset = (-(rows - 1) * spacing) / 2;

    const rodGeometry = new THREE.CylinderGeometry(0.08, 0.08, rodLength, 12);
    rodMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        emissive: 0xff4500,
        emissiveIntensity: 0,
    });

    for (let xi = 0; xi < rows; xi++) {
        for (let zi = 0; zi < rows; zi++) {
            const rod = new THREE.Mesh(rodGeometry, rodMaterial);
            rod.position.set(offset + xi * spacing, rodY, offset + zi * spacing);
            rod.userData.infoKey = 'fuel';
            assembly.add(rod);
            pickables.push(rod);
        }
    }

    scene.add(assembly);

    // Storage rack: a wireframe box around the rods plus top/bottom plates.
    const rackSpan = rows * spacing + 0.3;
    const rackGeometry = new THREE.BoxGeometry(rackSpan, rodLength + 0.3, rackSpan);
    const rackEdges = new THREE.EdgesGeometry(rackGeometry);
    const rackMaterial = new THREE.LineBasicMaterial({ color: 0x5a5f66 });
    const rack = new THREE.LineSegments(rackEdges, rackMaterial);
    rack.position.y = rodY;
    scene.add(rack);

    const plateGeometry = new THREE.BoxGeometry(rackSpan, 0.06, rackSpan);
    const plateMaterial = new THREE.MeshStandardMaterial({ color: 0x5a5f66 });
    const topPlate = new THREE.Mesh(plateGeometry, plateMaterial);
    topPlate.position.y = rodY + rodLength / 2 + 0.15;
    scene.add(topPlate);
    const bottomPlate = new THREE.Mesh(plateGeometry, plateMaterial);
    bottomPlate.position.y = rodY - rodLength / 2 - 0.15;
    scene.add(bottomPlate);

    return { rodY, rodLength, offset, rows, spacing };
}

function buildCherenkovGlow(rodY, rodLength) {
    const geometry = new THREE.CylinderGeometry(0.5, 0.9, rodLength + 0.6, 24, 1, true);
    cherenkovMaterial = new THREE.MeshBasicMaterial({
        color: 0x3fa9f5,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(geometry, cherenkovMaterial);
    glow.position.y = rodY;
    glow.userData.infoKey = 'cherenkov';
    scene.add(glow);
    pickables.push(glow);

    const count = 60;
    const positions = new Float32Array(count * 3);
    heatParticles = [];
    for (let i = 0; i < count; i++) {
        resetHeatParticle(i, positions, rodY, rodLength);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xff7b3f,
        size: 0.07,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    heatPoints = new THREE.Points(geo, material);
    scene.add(heatPoints);
}

function resetHeatParticle(i, positions, rodY, rodLength) {
    const radius = Math.random() * 0.7;
    const angle = Math.random() * Math.PI * 2;
    const startY = rodY - rodLength / 2 + Math.random() * rodLength;
    heatParticles[i] = {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        y: startY,
        speed: 0.3 + Math.random() * 0.4,
    };
    positions[i * 3] = heatParticles[i].x;
    positions[i * 3 + 1] = heatParticles[i].y;
    positions[i * 3 + 2] = heatParticles[i].z;
}

function buildCoolingSystem() {
    const points = [
        new THREE.Vector3(2.6, 0.6, 1.2),
        new THREE.Vector3(3.4, 0.9, 1.2),
        new THREE.Vector3(4.1, 0.9, 0.5),
        new THREE.Vector3(4.4, 0.85, 0),
        new THREE.Vector3(4.4, -0.6, 0),
        new THREE.Vector3(4.1, -0.6, -0.5),
        new THREE.Vector3(3.4, -0.3, -1.2),
        new THREE.Vector3(2.6, -0.3, -1.2),
        new THREE.Vector3(2.2, -1.1, -0.4),
        new THREE.Vector3(2.2, -1.1, 0.4),
    ];
    flowCurve = new THREE.CatmullRomCurve3(points, true);

    const tubeGeometry = new THREE.TubeGeometry(flowCurve, 120, 0.06, 8, true);
    const tubeMaterial = new THREE.MeshStandardMaterial({ color: 0x8a8f96 });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tube.userData.infoKey = 'cooling';
    scene.add(tube);
    pickables.push(tube);

    const exchangerGeometry = new THREE.BoxGeometry(1, 1.6, 1);
    const exchangerMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4e53 });
    const exchanger = new THREE.Mesh(exchangerGeometry, exchangerMaterial);
    exchanger.position.set(4.6, 0.1, 0);
    exchanger.userData.infoKey = 'cooling';
    scene.add(exchanger);
    pickables.push(exchanger);

    const finsGeometry = new THREE.PlaneGeometry(0.8, 1.3, 6, 1);
    const finsMaterial = new THREE.LineBasicMaterial({ color: 0x6b7076 });
    const fins = new THREE.LineSegments(new THREE.EdgesGeometry(finsGeometry), finsMaterial);
    fins.position.set(5.12, 0.1, 0);
    fins.rotation.y = Math.PI / 2;
    scene.add(fins);

    const flowCount = 14;
    flowOffsets = [];
    const positions = new Float32Array(flowCount * 3);
    for (let i = 0; i < flowCount; i++) {
        flowOffsets[i] = i / flowCount;
        const p = flowCurve.getPointAt(flowOffsets[i]);
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0x8fd0ff,
        size: 0.1,
        transparent: true,
        opacity: 0.9,
    });
    flowPoints = new THREE.Points(geo, material);
    scene.add(flowPoints);
}

function findInfoKey(object) {
    let node = object;
    while (node) {
        if (node.userData && node.userData.infoKey) return node.userData.infoKey;
        node = node.parent;
    }
    return null;
}

function onPointerClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (hits.length > 0 && onPickCallback) {
        // Water is a transparent box that visually surrounds the fuel/pipes,
        // so it is almost always the nearest raycast hit. Prefer whatever
        // solid object sits behind it and only fall back to water itself.
        const preferred = hits.find((hit) => findInfoKey(hit.object) !== 'water') || hits[0];
        const key = findInfoKey(preferred.object);
        if (key) onPickCallback(key);
    }
}

export function initCoolingScene(mountEl, onPick) {
    if (initialized) return;
    initialized = true;
    mount = mountEl;
    onPickCallback = onPick || null;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(6.5, 3.5, 7.5);
    camera.lookAt(0, -0.3, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x404050, 1.4));
    const light = new THREE.DirectionalLight(0xffffff, 1.8);
    light.position.set(5, 10, 5);
    scene.add(light);

    buildPool();
    const { rodY, rodLength } = buildAssembly();
    buildCherenkovGlow(rodY, rodLength);
    buildCoolingSystem();

    renderer.domElement.addEventListener('click', onPointerClick);
    window.addEventListener('resize', resizeCoolingScene);

    resizeCoolingScene();
    animate();
}

export function updateCoolingVisual({ heatFraction = 0, flowActive: active = false } = {}) {
    targetHeatFraction = THREE.MathUtils.clamp(heatFraction, 0, 1);
    flowActive = active;
}

export function resizeCoolingScene() {
    if (!mount || !renderer || !camera) return;
    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    currentHeatFraction += (targetHeatFraction - currentHeatFraction) * Math.min(1, delta * 2);

    rodMaterial.emissiveIntensity = currentHeatFraction * 1.6;
    cherenkovMaterial.opacity = 0.05 + currentHeatFraction * 0.35;

    const heatPositions = heatPoints.geometry.attributes.position.array;
    heatPoints.material.opacity = currentHeatFraction * 0.9;
    heatPoints.visible = currentHeatFraction > 0.02;
    if (heatPoints.visible) {
        for (let i = 0; i < heatParticles.length; i++) {
            const p = heatParticles[i];
            p.y += p.speed * currentHeatFraction * delta;
            if (p.y > 1.6) {
                resetHeatParticle(i, heatPositions, -0.6, 2.6);
            } else {
                heatPositions[i * 3 + 1] = p.y;
            }
        }
        heatPoints.geometry.attributes.position.needsUpdate = true;
    }

    if (flowActive) {
        flowSpeed = Math.min(flowSpeed + delta * 0.3, 0.08);
    } else {
        flowSpeed = Math.max(flowSpeed - delta * 0.3, 0);
    }
    if (flowSpeed > 0) {
        const flowPositions = flowPoints.geometry.attributes.position.array;
        for (let i = 0; i < flowOffsets.length; i++) {
            flowOffsets[i] = (flowOffsets[i] + flowSpeed * delta) % 1;
            const p = flowCurve.getPointAt(flowOffsets[i]);
            flowPositions[i * 3] = p.x;
            flowPositions[i * 3 + 1] = p.y;
            flowPositions[i * 3 + 2] = p.z;
        }
        flowPoints.geometry.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
}
