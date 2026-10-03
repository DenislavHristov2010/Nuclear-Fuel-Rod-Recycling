import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// This file owns the 3D scene only, same split as the PUREX page's
// three/purex-scene.js. pyroprocessing.js drives it by calling
// updatePyroVisual() every frame with plain numbers - it knows nothing about
// the API or state machine, and (per the project's scope-isolation pass)
// shares no code with purex-scene.js even where the patterns look similar.
//
// Seven pyroprocessing steps (Y1-Y7) in molten-salt media. The palette is
// deliberately warm (amber/orange glowing salts, dark metallics) to read as
// a distinct process from PUREX's cooler aqueous-chemistry colors.

const STATION_IDS = ['chopVolox', 'oxideReduction', 'electrorefining', 'cathodeProcessing', 'coRecovery', 'uZrCasting', 'wasteStreams'];
const STATION_SPACING = 3.4;

let renderer, scene, camera;
let mount;
let onPickCallback = null;
let initialized = false;

let targetActiveIndex = -1;
let targetStageProgress = 0;
let elapsedTime = 0;
let cameraFollowX = 0;

const pickables = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();

let stationUpdaters = [];
let gapUpdaters = [];
let recycleFlow = null;

function stationX(index) {
    return (index - (STATION_IDS.length - 1) / 2) * STATION_SPACING;
}

function buildFloorAndRail() {
    const span = STATION_IDS.length * STATION_SPACING + 1.5;
    const floorGeometry = new THREE.BoxGeometry(span, 0.1, 2.2);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2a221c });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = -1.8;
    scene.add(floor);

    const railGeometry = new THREE.BoxGeometry(span - 1, 0.05, 0.05);
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5a46 });
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.position.y = -0.95;
    scene.add(rail);
}

function makeHousingMaterial(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, emissive: 0xffffff, emissiveIntensity: 0, ...extra });
}

function buildParticleCloud(group, { count, color, size = 0.05 }) {
    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0 });
    const points = new THREE.Points(geo, mat);
    group.add(points);
    return { points, geo, mat, positions };
}

// --- Y1: chopper + voloxidation furnace ------------------------------------
// UO2 pieces chopped from the assembly crumble into tan U3O8 powder as they
// heat in oxygen; hulls route to a metallic waste bin, G1 gas vents off.
function buildChopVolox(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const housingMat = makeHousingMaterial(0x8a5a3a);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), housingMat);
    housing.position.set(-0.9, -0.25, 0);
    housing.userData.infoKey = 'chopVolox';
    group.add(housing);
    pickables.push(housing);

    const rodGroup = new THREE.Group();
    rodGroup.position.set(-0.9, 0.55, 0);
    const rodGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8);
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a });
    for (let i = 0; i < 9; i++) {
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.position.set(((i % 3) - 1) * 0.08, 0, (Math.floor(i / 3) - 1) * 0.08);
        rod.userData.infoKey = 'chopVolox';
        rodGroup.add(rod);
        pickables.push(rod);
    }
    group.add(rodGroup);

    const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.06, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xbfae9a })
    );
    blade.position.set(-0.9, 1.0, 0);
    group.add(blade);

    const furnaceMat = makeHousingMaterial(0x6b4a2a, { transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const furnace = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 18, 1, true), furnaceMat);
    furnace.position.set(0.5, -0.5, 0);
    furnace.userData.infoKey = 'chopVolox';
    group.add(furnace);
    pickables.push(furnace);

    const glow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.06, 18),
        new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0 })
    );
    glow.position.set(0.5, 0.05, 0);
    group.add(glow);

    const powderPile = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.3, 16),
        new THREE.MeshStandardMaterial({ color: 0x8a7a5a })
    );
    powderPile.position.set(0.5, -1.6, 0);
    powderPile.scale.setScalar(0.05);
    group.add(powderPile);

    const gas = buildParticleCloud(group, { count: 8, color: 0xf0d8a0, size: 0.05 });
    for (let i = 0; i < 8; i++) {
        gas.positions[i * 3] = 0.5 + (Math.random() - 0.5) * 0.3;
        gas.positions[i * 3 + 1] = 0.3;
        gas.positions[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    const gasSpeed = Array.from({ length: 8 }, () => 0.3 + Math.random() * 0.3);

    const wasteBin = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.25, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x2a2420, transparent: true, opacity: 0.5 })
    );
    wasteBin.position.set(1.15, -1.0, 0);
    group.add(wasteBin);
    const wasteFill = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 1, 0.22),
        new THREE.MeshStandardMaterial({ color: 0x5a4a3a, transparent: true, opacity: 0.85 })
    );
    wasteFill.position.set(1.15, -1.12, 0);
    wasteFill.scale.y = 0.02;
    group.add(wasteFill);

    return {
        housingMat,
        update(progress, running, delta) {
            rodGroup.visible = progress < 1;
            rodGroup.scale.y = Math.max(1 - progress * 0.7, 0.05);
            rodGroup.position.y = 0.55 - progress * 0.35;
            blade.position.y = running ? 1.0 - (Math.sin(elapsedTime * 12) * 0.5 + 0.5) * 0.55 : 1.0;

            glow.material.opacity = running ? 0.8 : 0;
            gas.mat.opacity = running ? 0.75 : 0;
            if (running) {
                const arr = gas.geo.attributes.position.array;
                for (let i = 0; i < 8; i++) {
                    arr[i * 3 + 1] += gasSpeed[i] * delta;
                    if (arr[i * 3 + 1] > 1.0) arr[i * 3 + 1] = 0.3;
                }
                gas.geo.attributes.position.needsUpdate = true;
            }

            const scale = Math.max(0.05, progress);
            powderPile.scale.setScalar(scale);
            powderPile.position.y = -1.77 + scale * 0.14;

            wasteFill.scale.y = THREE.MathUtils.clamp(0.02 + progress * 0.3, 0.02, 1);
            wasteFill.position.y = -1.12 + wasteFill.scale.y * 0.5;
        },
    };
}

// --- Y2: electrolytic oxide reduction ---------------------------------------
// Glowing LiCl-Li2O salt bath; cathode basket of U3O8 turns to metal; O2
// bubbles off the anode; G2/G3 fission products dissolve into the salt.
function buildOxideReduction(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const shellMat = makeHousingMaterial(0x5a4a3a, { side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 1.3, 20, 1, true), shellMat);
    shell.userData.infoKey = 'oxideReduction';
    group.add(shell);
    pickables.push(shell);

    const saltMat = new THREE.MeshStandardMaterial({
        color: 0xd9651f,
        emissive: 0xd9651f,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0.85,
    });
    const salt = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 1, 20), saltMat);
    salt.position.y = -1.1;
    group.add(salt);

    const basket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.26, 0.5, 14, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x3a322a, wireframe: true })
    );
    basket.position.set(-0.15, -0.95, 0);
    group.add(basket);

    const chargeMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a });
    const charge = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 14), chargeMat);
    charge.position.set(-0.15, -0.95, 0);
    group.add(charge);

    const anode = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.0, 10),
        new THREE.MeshStandardMaterial({ color: 0x8a8f96, emissive: 0xff8a3d, emissiveIntensity: 0 })
    );
    anode.position.set(0.3, -0.6, 0);
    group.add(anode);

    const o2 = buildParticleCloud(group, { count: 8, color: 0xe8e8e0, size: 0.04 });
    for (let i = 0; i < 8; i++) {
        o2.positions[i * 3] = 0.3 + (Math.random() - 0.5) * 0.1;
        o2.positions[i * 3 + 1] = -1.1;
        o2.positions[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
    }
    const o2Speed = Array.from({ length: 8 }, () => 0.25 + Math.random() * 0.25);

    const fpColors = [new THREE.Color(0xb85a3a), new THREE.Color(0xd98a3a)];
    const fp = buildParticleCloud(group, { count: 10, color: 0xb85a3a, size: 0.05 });
    const fpColorArr = new Float32Array(10 * 3);
    fp.geo.setAttribute('color', new THREE.BufferAttribute(fpColorArr, 3));
    fp.mat.vertexColors = true;
    for (let i = 0; i < 10; i++) {
        const c = fpColors[i % 2];
        fpColorArr[i * 3] = c.r;
        fpColorArr[i * 3 + 1] = c.g;
        fpColorArr[i * 3 + 2] = c.b;
        const angle = Math.random() * Math.PI * 2;
        fp.positions[i * 3] = Math.cos(angle) * 0.35;
        fp.positions[i * 3 + 1] = -0.75;
        fp.positions[i * 3 + 2] = Math.sin(angle) * 0.35;
    }

    const metalColor = new THREE.Color(0x8a7a5a);
    const reducedColor = new THREE.Color(0xc8ccd0);

    return {
        housingMat: shellMat,
        update(progress, running, delta) {
            saltMat.emissiveIntensity = running ? 0.55 : 0.15;
            chargeMat.color.copy(metalColor).lerp(reducedColor, progress);
            anode.material.emissiveIntensity = running ? 0.8 : 0;

            o2.mat.opacity = running ? 0.8 : 0;
            if (running) {
                const arr = o2.geo.attributes.position.array;
                for (let i = 0; i < 8; i++) {
                    arr[i * 3 + 1] += o2Speed[i] * delta;
                    if (arr[i * 3 + 1] > -0.4) arr[i * 3 + 1] = -1.1;
                }
                o2.geo.attributes.position.needsUpdate = true;
            }

            fp.mat.opacity = running ? 0.8 : 0;
            if (running) {
                const arr = fp.geo.attributes.position.array;
                for (let i = 0; i < 10; i++) {
                    const r = Math.hypot(arr[i * 3], arr[i * 3 + 2]);
                    const nr = Math.max(r - delta * 0.1, 0.02);
                    const scaleFactor = nr / (r || 1);
                    arr[i * 3] *= scaleFactor;
                    arr[i * 3 + 2] *= scaleFactor;
                    if (nr <= 0.03) {
                        const angle = Math.random() * Math.PI * 2;
                        arr[i * 3] = Math.cos(angle) * 0.35;
                        arr[i * 3 + 2] = Math.sin(angle) * 0.35;
                    }
                }
                fp.geo.attributes.position.needsUpdate = true;
            }
        },
    };
}

// --- Y3: electrorefining -----------------------------------------------------
// Anode basket of U metal dissolves (shrinks); shiny crystals grow on the
// steel cathode rod; G4 dissolves into the salt, G7 stays as anode sludge.
function buildElectrorefining(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const shellMat = makeHousingMaterial(0x5a4a3a, { side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 1.3, 20, 1, true), shellMat);
    shell.userData.infoKey = 'electrorefining';
    group.add(shell);
    pickables.push(shell);

    const saltMat = new THREE.MeshStandardMaterial({
        color: 0xe08a3a,
        emissive: 0xe08a3a,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.85,
    });
    const salt = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 1, 20), saltMat);
    salt.position.y = -1.1;
    group.add(salt);

    const anodeBasket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.24, 0.45, 14, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x3a322a, wireframe: true })
    );
    anodeBasket.position.set(-0.2, -0.95, 0);
    group.add(anodeBasket);

    const anodeMetal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.4, 14),
        new THREE.MeshStandardMaterial({ color: 0x9a9ea3 })
    );
    anodeMetal.position.set(-0.2, -0.95, 0);
    group.add(anodeMetal);

    const sludge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14),
        new THREE.MeshStandardMaterial({ color: 0x2a241e })
    );
    sludge.position.set(-0.2, -1.2, 0);
    sludge.scale.y = 0.05;
    group.add(sludge);

    const cathodeRod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.1, 12),
        new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 })
    );
    cathodeRod.position.set(0.3, -0.55, 0);
    group.add(cathodeRod);

    const fp = buildParticleCloud(group, { count: 8, color: 0xa83a2a, size: 0.05 });
    for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        fp.positions[i * 3] = Math.cos(angle) * 0.35;
        fp.positions[i * 3 + 1] = -0.75;
        fp.positions[i * 3 + 2] = Math.sin(angle) * 0.35;
    }

    return {
        housingMat: shellMat,
        update(progress, running, delta) {
            saltMat.emissiveIntensity = running ? 0.55 : 0.2;
            const consumedScale = Math.max(1 - progress * 0.85, 0.15);
            anodeMetal.scale.set(consumedScale, 1, consumedScale);
            sludge.scale.y = Math.max(0.05, progress * 0.6);

            cathodeRod.scale.x = 1 + progress * 2.5;
            cathodeRod.scale.z = 1 + progress * 2.5;
            cathodeRod.material.emissiveIntensity = running ? 0.5 : 0.1;

            fp.mat.opacity = running ? 0.8 : 0;
            if (running) {
                const arr = fp.geo.attributes.position.array;
                for (let i = 0; i < 8; i++) {
                    const r = Math.hypot(arr[i * 3], arr[i * 3 + 2]);
                    const nr = Math.max(r - delta * 0.1, 0.02);
                    const scaleFactor = nr / (r || 1);
                    arr[i * 3] *= scaleFactor;
                    arr[i * 3 + 2] *= scaleFactor;
                    if (nr <= 0.03) {
                        const angle = Math.random() * Math.PI * 2;
                        arr[i * 3] = Math.cos(angle) * 0.35;
                        arr[i * 3 + 2] = Math.sin(angle) * 0.35;
                    }
                }
                fp.geo.attributes.position.needsUpdate = true;
            }
        },
    };
}

// --- Y4: cathode processing ---------------------------------------------------
// Vacuum furnace vaporizes adhering salt (recycled back to Y3 above the
// line), melts the clean uranium, and casts it into a solid ingot.
function buildCathodeProcessing(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const housingMat = makeHousingMaterial(0x5a4a3a);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), housingMat);
    housing.position.x = -0.6;
    housing.userData.infoKey = 'cathodeProcessing';
    group.add(housing);
    pickables.push(housing);

    const condenser = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.03, 8, 20),
        new THREE.MeshStandardMaterial({ color: 0x9a9ea3 })
    );
    condenser.position.set(-0.6, 0.75, 0);
    condenser.rotation.x = Math.PI / 2;
    group.add(condenser);

    const pool = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.1, 18),
        new THREE.MeshStandardMaterial({ color: 0xc8ccd0, emissive: 0xffb366, emissiveIntensity: 0 })
    );
    pool.position.set(-0.6, -0.3, 0);
    group.add(pool);

    const ingot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.5, 16),
        new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.6 })
    );
    ingot.position.set(0.6, -1.4, 0);
    ingot.userData.infoKey = 'cathodeProcessing';
    ingot.scale.setScalar(0.05);
    group.add(ingot);
    pickables.push(ingot);

    return {
        housingMat,
        update(progress, running) {
            pool.material.emissiveIntensity = running && progress < 0.6 ? 0.8 : 0;
            const scale = Math.max(0.05, progress);
            ingot.scale.setScalar(scale);
            ingot.position.y = -1.65 + scale * 0.25;
        },
    };
}

// --- Y5: U/TRU co-recovery - bypassed stub -----------------------------------
function buildCoRecoveryStub(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const housingMat = new THREE.MeshStandardMaterial({
        color: 0x4a443c,
        wireframe: true,
        emissive: 0xffffff,
        emissiveIntensity: 0,
    });
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), housingMat);
    housing.userData.infoKey = 'coRecovery';
    group.add(housing);
    pickables.push(housing);

    const bypassBar = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.04, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x8a8378 })
    );
    bypassBar.position.y = -0.4;
    group.add(bypassBar);

    return {
        housingMat,
        update() {
            // Intentionally static - Y5 is a bypassed stub, nothing to animate.
        },
    };
}

// --- Y6: U-Zr alloying furnace + pin-casting mold array -----------------------
function buildUZrCasting(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const housingMat = makeHousingMaterial(0x8a5a3a);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.9), housingMat);
    housing.position.x = -0.9;
    housing.userData.infoKey = 'uZrCasting';
    group.add(housing);
    pickables.push(housing);

    const glow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16),
        new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0 })
    );
    glow.position.set(-0.9, 0.54, 0);
    group.add(glow);

    const zrChunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 0.16),
        new THREE.MeshStandardMaterial({ color: 0xd8dadc, metalness: 0.5 })
    );
    zrChunk.position.set(-1.3, 0.2, 0);
    group.add(zrChunk);

    const moldX = 0.6;
    const pinCount = 6;
    const pinGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10);
    const pins = [];
    for (let i = 0; i < pinCount; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.5 });
        const pin = new THREE.Mesh(pinGeo, mat);
        const col = i % 3;
        const row = Math.floor(i / 3);
        pin.position.set(moldX + (col - 1) * 0.2, -0.3, (row - 0.5) * 0.25);
        pin.scale.y = 0.05;
        pin.userData.infoKey = 'uZrCasting';
        group.add(pin);
        pickables.push(pin);
        pins.push(pin);
    }

    return {
        housingMat,
        update(progress, running, delta, elapsed) {
            glow.material.opacity = running ? 0.85 : 0;
            zrChunk.position.x = THREE.MathUtils.lerp(-1.3, -0.9, Math.min(1, progress * 3));
            zrChunk.visible = progress < 0.4;

            pins.forEach((pin, i) => {
                const cue = (i / pinCount) * 0.6 + 0.3;
                const t = THREE.MathUtils.clamp((progress - cue) / 0.15, 0, 1);
                pin.scale.y = Math.max(0.05, t);
                pin.position.y = -0.6 + pin.scale.y * 0.3;
            });
        },
    };
}

// --- Y7: waste streams - salt ceramic blocks + metallic waste ingot ----------
function buildWasteStreams(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const saltHousingMat = makeHousingMaterial(0x5a4a3a);
    const saltHousing = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), saltHousingMat);
    saltHousing.position.set(-0.8, -0.2, 0);
    saltHousing.userData.infoKey = 'wasteStreams';
    group.add(saltHousing);
    pickables.push(saltHousing);

    const blockGeo = new THREE.BoxGeometry(0.22, 0.14, 0.22);
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x3a2a22 });
    const blocks = [];
    for (let i = 0; i < 5; i++) {
        const block = new THREE.Mesh(blockGeo, blockMat);
        block.position.set(-0.8 + (i % 3 - 1) * 0.26, -1.55 + Math.floor(i / 3) * 0.16, 0.1);
        block.visible = false;
        group.add(block);
        blocks.push(block);
    }

    const metalHousingMat = makeHousingMaterial(0x6b4a2a);
    const metalHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 16, 1, true), metalHousingMat);
    metalHousing.position.set(0.9, -0.5, 0);
    metalHousing.userData.infoKey = 'wasteStreams';
    group.add(metalHousing);
    pickables.push(metalHousing);

    const metalGlow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.06, 16),
        new THREE.MeshBasicMaterial({ color: 0xff6a3f, transparent: true, opacity: 0 })
    );
    metalGlow.position.set(0.9, -0.1, 0);
    group.add(metalGlow);

    const metalIngot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 0.3, 16),
        new THREE.MeshStandardMaterial({ color: 0x3a342c })
    );
    metalIngot.position.set(0.9, -1.6, 0);
    metalIngot.scale.setScalar(0.05);
    group.add(metalIngot);

    return {
        housingMat: saltHousingMat,
        update(progress, running) {
            const salted = running && progress < 0.5;
            const metaled = running && progress >= 0.5;

            const visibleCount = Math.round(THREE.MathUtils.clamp(progress / 0.5, 0, 1) * blocks.length);
            blocks.forEach((block, i) => {
                block.visible = i < visibleCount;
            });
            void salted;

            metalGlow.material.opacity = metaled ? 0.8 : 0;
            const metalScale = Math.max(0.05, THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1));
            metalIngot.scale.setScalar(metalScale);
            metalIngot.position.y = -1.75 + metalScale * 0.15;
        },
    };
}

// A short colored particle flow between two world-space x positions, active
// only while material is actually moving between the two stations it links.
function buildFlowBetween(fromX, toX, colors, options = {}) {
    const count = options.count || 8;
    const y = options.y !== undefined ? options.y : -0.9;
    const speed = options.speed || 0.6;
    const positions = new Float32Array(count * 3);
    const colorsArr = new Float32Array(count * 3);
    const tVals = Array.from({ length: count }, (_, i) => i / count);
    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
        positions[i * 3] = fromX;
        positions[i * 3 + 1] = y;
        tmp.set(colors[i % colors.length]);
        colorsArr[i * 3] = tmp.r;
        colorsArr[i * 3 + 1] = tmp.g;
        colorsArr[i * 3 + 2] = tmp.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));
    const mat = new THREE.PointsMaterial({ size: options.size || 0.08, vertexColors: true, transparent: true, opacity: 0 });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    return {
        update(active, delta) {
            mat.opacity = active ? 0.9 : 0;
            if (!active) return;
            const pos = geo.attributes.position.array;
            for (let i = 0; i < count; i++) {
                tVals[i] = (tVals[i] + delta * speed) % 1;
                pos[i * 3] = THREE.MathUtils.lerp(fromX, toX, tVals[i]);
            }
            geo.attributes.position.needsUpdate = true;
        },
    };
}

function buildGapFlow(fromIndex, colors, options) {
    return buildFlowBetween(stationX(fromIndex), stationX(fromIndex + 1), colors, options);
}

function onPointerClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (hits.length > 0 && onPickCallback) {
        const key = hits[0].object.userData.infoKey;
        if (key) onPickCallback(key);
    }
}

export function initPyroScene(mountEl, onPick) {
    if (initialized) return;
    initialized = true;
    mount = mountEl;
    onPickCallback = onPick || null;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(2, 6.5, 14.5);
    camera.lookAt(0, -0.8, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x504030, 1.4));
    const light = new THREE.DirectionalLight(0xffd9a0, 1.8);
    light.position.set(5, 10, 5);
    scene.add(light);

    buildFloorAndRail();

    stationUpdaters = [
        buildChopVolox(0),
        buildOxideReduction(1),
        buildElectrorefining(2),
        buildCathodeProcessing(3),
        buildCoRecoveryStub(4),
        buildUZrCasting(5),
        buildWasteStreams(6),
    ];

    gapUpdaters = [
        buildGapFlow(0, [0x8a7a5a]), // tan U3O8 powder
        buildGapFlow(1, [0xc8ccd0]), // reduced uranium metal
        buildGapFlow(2, [0xc8ccd0]), // refined uranium on the cathode
        buildGapFlow(3, [0xc8ccd0]), // clean cast uranium ingot
        buildGapFlow(4, [0xc8ccd0]), // ingot bypassing co-recovery unchanged
        buildGapFlow(5, [0xc8ccd0, 0x3a342c]), // alloy pins and waste routed onward
    ];

    // Adhering salt vaporized off the cathode deposit in Y4 recycles back to
    // the Y3 electrorefiner, shown above the line like PUREX's solvent loop.
    recycleFlow = buildFlowBetween(stationX(3), stationX(2), [0xe08a3a], { y: 1.3, speed: 0.5, count: 6 });

    renderer.domElement.addEventListener('click', onPointerClick);
    window.addEventListener('resize', resizePyroScene);

    resizePyroScene();
    animate();
}

// activeIndex: -1 before the process starts, 0-6 for the stage currently
// running/just finished, stageProgress: 0..1 fraction through that stage.
export function updatePyroVisual({ activeIndex = -1, stageProgress = 0 } = {}) {
    targetActiveIndex = activeIndex;
    targetStageProgress = THREE.MathUtils.clamp(stageProgress, 0, 1);
}

export function resizePyroScene() {
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
    elapsedTime += delta;

    stationUpdaters.forEach((station, index) => {
        const progress = index < targetActiveIndex ? 1 : index === targetActiveIndex ? targetStageProgress : 0;
        const running = index === targetActiveIndex && targetStageProgress < 1;
        station.update(progress, running, delta, elapsedTime);

        let targetEmissive = 0;
        if (index === targetActiveIndex) targetEmissive = 0.9;
        else if (index < targetActiveIndex) targetEmissive = 0.15;
        station.housingMat.emissiveIntensity += (targetEmissive - station.housingMat.emissiveIntensity) * Math.min(1, delta * 4);
    });

    gapUpdaters.forEach((gap, index) => {
        gap.update(targetActiveIndex === index + 1, delta);
    });
    if (recycleFlow) {
        recycleFlow.update(targetActiveIndex === 3 && targetStageProgress < 1, delta);
    }

    const clampedIndex = Math.max(0, Math.min(targetActiveIndex, STATION_IDS.length - 1));
    const targetFollowX = targetActiveIndex >= 0 ? stationX(clampedIndex) : 0;
    cameraFollowX += (targetFollowX - cameraFollowX) * Math.min(1, delta * 1.2);
    camera.position.x = 2 + cameraFollowX * 0.6;
    camera.lookAt(cameraFollowX * 0.6, -0.8, 0);

    renderer.render(scene, camera);
}
