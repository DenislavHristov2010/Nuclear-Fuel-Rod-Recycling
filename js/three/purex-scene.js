import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const STATION_IDS = ['shearing', 'dissolution', 'extraction', 'stripping', 'conversion', 'pelletizing'];
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
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2d31 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = -1.8;
    scene.add(floor);

    const railGeometry = new THREE.BoxGeometry(span - 1, 0.05, 0.05);
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x5a5f66 });
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.position.y = -0.95;
    scene.add(rail);
}

function makeHousingMaterial(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, emissive: 0xffffff, emissiveIntensity: 0, ...extra });
}

function addStageDisks(group, stageCount, infoKey) {
    const diskGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16);
    const diskMat = new THREE.MeshStandardMaterial({ color: 0x3a3d41 });
    for (let i = 1; i < stageCount; i++) {
        const disk = new THREE.Mesh(diskGeo, diskMat);
        disk.position.y = -1.0 + (i / stageCount) * 2.0;
        disk.userData.infoKey = infoKey;
        group.add(disk);
        pickables.push(disk);
    }
}

function buildStream(group, { radius, direction, startColor, endColor, count = 12, speed = 0.3 }) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const tVals = Array.from({ length: count }, (_, i) => i / count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, opacity: 0 });
    const points = new THREE.Points(geo, mat);
    group.add(points);
    const tmp = new THREE.Color();

    return {
        update(running, delta) {
            mat.opacity = running ? 0.9 : 0;
            if (!running) return;
            const pos = geo.attributes.position.array;
            const col = geo.attributes.color.array;
            for (let i = 0; i < count; i++) {
                tVals[i] = (tVals[i] + delta * speed) % 1;
                const yT = direction === 'up' ? tVals[i] : 1 - tVals[i];
                const angle = tVals[i] * Math.PI * 4;
                pos[i * 3] = Math.cos(angle) * radius;
                pos[i * 3 + 1] = -1.0 + yT * 2.0;
                pos[i * 3 + 2] = Math.sin(angle) * radius;
                tmp.copy(startColor).lerp(endColor, tVals[i]);
                col[i * 3] = tmp.r;
                col[i * 3 + 1] = tmp.g;
                col[i * 3 + 2] = tmp.b;
            }
            geo.attributes.position.needsUpdate = true;
            geo.attributes.color.needsUpdate = true;
        },
    };
}

function buildShearer(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const housingMat = makeHousingMaterial(0x6b7076);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), housingMat);
    housing.position.y = -0.25;
    housing.userData.infoKey = 'shearing';
    group.add(housing);
    pickables.push(housing);

    const rodGroup = new THREE.Group();
    rodGroup.position.set(0, 0.55, 0);
    const rodGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8);
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x9a9ea3 });
    for (let i = 0; i < 9; i++) {
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.position.set(((i % 3) - 1) * 0.08, 0, (Math.floor(i / 3) - 1) * 0.08);
        rod.userData.infoKey = 'shearing';
        rodGroup.add(rod);
        pickables.push(rod);
    }
    group.add(rodGroup);

    const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.06, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xbfc3c7 })
    );
    blade.position.set(0, 1.0, 0);
    group.add(blade);

    const chute = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.04, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x4a4d51 })
    );
    chute.position.set(0.55, -0.35, 0);
    chute.rotation.z = -0.35;
    chute.userData.infoKey = 'shearing';
    group.add(chute);
    pickables.push(chute);

    const fuelMat = new THREE.MeshStandardMaterial({ color: 0x3a3228 });
    const claddingMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2 });
    const pieceGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.18, 8);
    const pieces = [];
    for (let i = 0; i < 6; i++) {
        const piece = new THREE.Mesh(pieceGeo, i % 2 === 0 ? fuelMat : claddingMat);
        const angle = (i / 6) * Math.PI * 2;
        piece.rotation.z = Math.PI / 2;
        piece.position.set(Math.cos(angle) * 0.32, -0.08, 0.55 + Math.sin(angle) * 0.15);
        piece.visible = false;
        group.add(piece);
        pieces.push(piece);
    }

    return {
        housingMat,
        update(progress, running) {
            rodGroup.visible = progress < 1;
            rodGroup.scale.y = Math.max(1 - progress * 0.7, 0.05);
            rodGroup.position.y = 0.55 - progress * 0.35;

            blade.position.y = running ? 1.0 - (Math.sin(elapsedTime * 12) * 0.5 + 0.5) * 0.55 : 1.0;

            const visibleCount = Math.round(progress * pieces.length);
            pieces.forEach((piece, i) => {
                piece.visible = i < visibleCount;
            });
        },
    };
}


function buildDissolver(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const vesselX = -0.75;
    const centrifugeX = 0.85;

    const shellMat = makeHousingMaterial(0x5a5f66, { side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.46, 1.3, 20, 1, true), shellMat);
    shell.position.x = vesselX;
    shell.userData.infoKey = 'dissolution';
    group.add(shell);
    pickables.push(shell);

    const liquid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.44, 0.4, 1, 20),
        new THREE.MeshStandardMaterial({ color: 0xcfd8dc, transparent: true, opacity: 0.8 })
    );
    liquid.position.set(vesselX, -1.15, 0);
    liquid.scale.y = 0.02;
    group.add(liquid);

    const vent = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x5a5f66 })
    );
    vent.position.set(vesselX, 0.35, 0);
    vent.userData.infoKey = 'dissolution';
    group.add(vent);
    pickables.push(vent);

    const noxColor = new THREE.Color(0xcf6a3f);
    const g1Color = new THREE.Color(0xd8e8ea);
    const gasCount = 10;
    const gasPositions = new Float32Array(gasCount * 3);
    const gasColors = new Float32Array(gasCount * 3);
    const gasSpeed = [];
    function resetGas(i) {
        const c = i % 2 === 0 ? noxColor : g1Color;
        gasPositions[i * 3] = vesselX + (Math.random() - 0.5) * 0.15;
        gasPositions[i * 3 + 1] = 0.55;
        gasPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
        gasColors[i * 3] = c.r;
        gasColors[i * 3 + 1] = c.g;
        gasColors[i * 3 + 2] = c.b;
        gasSpeed[i] = 0.35 + Math.random() * 0.3;
    }
    for (let i = 0; i < gasCount; i++) resetGas(i);
    const gasGeo = new THREE.BufferGeometry();
    gasGeo.setAttribute('position', new THREE.BufferAttribute(gasPositions, 3));
    gasGeo.setAttribute('color', new THREE.BufferAttribute(gasColors, 3));
    const gasMat = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0 });
    const gasPoints = new THREE.Points(gasGeo, gasMat);
    group.add(gasPoints);

    const basket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.26, 0.2, 14, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x4a4d51, wireframe: true })
    );
    basket.position.set(vesselX, -1.68, 0);
    group.add(basket);

    const hull = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.08, 0.12),
        new THREE.MeshStandardMaterial({ color: 0xb8bcc2 })
    );
    hull.position.set(vesselX, -1.65, 0);
    hull.scale.setScalar(0.001);
    group.add(hull);

    const pieces = [];
    for (let i = 0; i < 4; i++) {
        const piece = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.1, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x3a3228 })
        );
        const angle = (i / 4) * Math.PI * 2;
        piece.position.set(vesselX + Math.cos(angle) * 0.2, -0.75, Math.sin(angle) * 0.2);
        group.add(piece);
        pieces.push(piece);
    }

    const bubbleCount = 16;
    const bubblePositions = new Float32Array(bubbleCount * 3);
    const bubbleSpeed = [];
    function resetBubble(i) {
        const radius = Math.random() * 0.3;
        const angle = Math.random() * Math.PI * 2;
        bubblePositions[i * 3] = vesselX + Math.cos(angle) * radius;
        bubblePositions[i * 3 + 1] = -1.1 + Math.random() * 0.3;
        bubblePositions[i * 3 + 2] = Math.sin(angle) * radius;
        bubbleSpeed[i] = 0.3 + Math.random() * 0.3;
    }
    for (let i = 0; i < bubbleCount; i++) resetBubble(i);
    const bubbleGeo = new THREE.BufferGeometry();
    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePositions, 3));
    const bubbleMat = new THREE.PointsMaterial({ color: 0xf2d9a0, size: 0.045, transparent: true, opacity: 0 });
    const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
    group.add(bubbles);

    const centrifugeMat = makeHousingMaterial(0x5a5f66);
    const centrifuge = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 20), centrifugeMat);
    centrifuge.position.set(centrifugeX, -0.85, 0);
    centrifuge.userData.infoKey = 'dissolution';
    group.add(centrifuge);
    pickables.push(centrifuge);

    const centrifugeLid = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.02, 8, 20),
        new THREE.MeshStandardMaterial({ color: 0x8a8f96 })
    );
    centrifugeLid.rotation.x = Math.PI / 2;
    centrifugeLid.position.set(centrifugeX, -0.73, 0);
    group.add(centrifugeLid);

    const feedColor = 0xf2a428;
    const feedCount = 8;
    const feedPositions = new Float32Array(feedCount * 3);
    const feedT = Array.from({ length: feedCount }, (_, i) => i / feedCount);
    for (let i = 0; i < feedCount; i++) {
        feedPositions[i * 3] = vesselX;
        feedPositions[i * 3 + 1] = -0.85;
    }
    const feedGeo = new THREE.BufferGeometry();
    feedGeo.setAttribute('position', new THREE.BufferAttribute(feedPositions, 3));
    const feedMat = new THREE.PointsMaterial({ color: feedColor, size: 0.05, transparent: true, opacity: 0 });
    const feedFlow = new THREE.Points(feedGeo, feedMat);
    group.add(feedFlow);

    const finesCollector = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshStandardMaterial({ color: 0x3a3d41, transparent: true, opacity: 0.5 })
    );
    finesCollector.position.set(centrifugeX + 0.45, -1.15, 0);
    group.add(finesCollector);

    const finesFill = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 1, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x8a8f96, transparent: true, opacity: 0.85 })
    );
    finesFill.position.set(centrifugeX + 0.45, -1.25, 0);
    finesFill.scale.y = 0.02;
    group.add(finesFill);

    const clearColor = new THREE.Color(0xcfd8dc);
    const dissolvedColor = new THREE.Color(0xf2a428);

    return {
        housingMat: shellMat,
        update(progress, running, delta) {
            const fillPhase = THREE.MathUtils.clamp(progress / 0.55, 0, 1);
            const clarifyPhase = THREE.MathUtils.clamp((progress - 0.55) / 0.45, 0, 1);
            const runningFill = running && progress < 0.55;
            const runningClarify = running && progress >= 0.55;

            liquid.scale.y = Math.max(fillPhase * 1.1, 0.02);
            liquid.position.y = -1.15 + liquid.scale.y * 0.5;
            liquid.material.color.copy(clearColor).lerp(dissolvedColor, fillPhase);

            pieces.forEach((piece, i) => {
                const localT = THREE.MathUtils.clamp(fillPhase * 1.3 - i * 0.08, 0, 1);
                piece.scale.setScalar(Math.max(1 - localT, 0));
                piece.visible = piece.scale.x > 0.02;
            });
            hull.scale.setScalar(THREE.MathUtils.lerp(0.001, 1, THREE.MathUtils.clamp(fillPhase * 1.5, 0, 1)));

            bubbleMat.opacity = runningFill ? 0.85 : 0;
            gasMat.opacity = runningFill ? 0.8 : 0;
            if (runningFill) {
                const bp = bubbleGeo.attributes.position.array;
                for (let i = 0; i < bubbleCount; i++) {
                    bp[i * 3 + 1] += bubbleSpeed[i] * delta;
                    if (bp[i * 3 + 1] > -0.7) resetBubble(i);
                }
                bubbleGeo.attributes.position.needsUpdate = true;

                const gp = gasGeo.attributes.position.array;
                for (let i = 0; i < gasCount; i++) {
                    gp[i * 3 + 1] += gasSpeed[i] * delta;
                    if (gp[i * 3 + 1] > 1.1) resetGas(i);
                }
                gasGeo.attributes.position.needsUpdate = true;
            }

            centrifugeMat.emissiveIntensity = runningClarify ? 0.4 : 0;
            if (runningClarify) {
                centrifuge.rotation.y += delta * 8;
                centrifugeLid.rotation.z += delta * 8;
            }
            feedMat.opacity = runningClarify ? 0.85 : 0;
            if (runningClarify) {
                const fp = feedGeo.attributes.position.array;
                for (let i = 0; i < feedCount; i++) {
                    feedT[i] = (feedT[i] + delta * 0.7) % 1;
                    fp[i * 3] = THREE.MathUtils.lerp(vesselX, centrifugeX, feedT[i]);
                }
                feedGeo.attributes.position.needsUpdate = true;
            }

            finesFill.scale.y = THREE.MathUtils.clamp(0.02 + clarifyPhase * 0.3, 0.02, 1);
            finesFill.position.y = -1.25 + finesFill.scale.y * 0.5;
        },
    };
}

function buildExtractionColumn(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const shellMat = makeHousingMaterial(0x5a5f66, { side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.2, 16, 1, true), shellMat);
    shell.userData.infoKey = 'extraction';
    group.add(shell);
    pickables.push(shell);

    addStageDisks(group, 4, 'extraction');

    const yellow = new THREE.Color(0xf2a428);
    const raffinate = new THREE.Color(0x6b7a5a);
    const clearSolvent = new THREE.Color(0xd8ddd0);
    const gold = new THREE.Color(0xf0c030);

    const aqueousStream = buildStream(group, { radius: 0.2, direction: 'down', startColor: yellow, endColor: raffinate });
    const organicStream = buildStream(group, { radius: 0.1, direction: 'up', startColor: clearSolvent, endColor: gold });

    const collector = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.25, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x3a3d41, transparent: true, opacity: 0.5 })
    );
    collector.position.set(0.55, -1.0, 0);
    group.add(collector);

    const fill = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 1, 0.22),
        new THREE.MeshStandardMaterial({ color: 0x6b7a5a, transparent: true, opacity: 0.85 })
    );
    fill.position.set(0.55, -1.12, 0);
    fill.scale.y = 0.02;
    group.add(fill);

    return {
        housingMat: shellMat,
        update(progress, running, delta) {
            aqueousStream.update(running, delta);
            organicStream.update(running, delta);
            fill.scale.y = THREE.MathUtils.clamp(0.02 + progress * 0.3, 0.02, 1);
            fill.position.y = -1.12 + fill.scale.y * 0.5;
        },
    };
}

function buildStrippingColumn(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const shellMat = makeHousingMaterial(0x5a5f66, { side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.2, 16, 1, true), shellMat);
    shell.userData.infoKey = 'stripping';
    group.add(shell);
    pickables.push(shell);

    addStageDisks(group, 4, 'stripping');

    const gold = new THREE.Color(0xf0c030);
    const clearSolvent = new THREE.Color(0xd8ddd0);
    const stripAcid = new THREE.Color(0xcfe0e8);
    const product = new THREE.Color(0xf2b33c);

    const organicStream = buildStream(group, { radius: 0.1, direction: 'up', startColor: gold, endColor: clearSolvent });
    const aqueousStream = buildStream(group, { radius: 0.2, direction: 'down', startColor: stripAcid, endColor: product });

    return {
        housingMat: shellMat,
        update(progress, running, delta) {
            organicStream.update(running, delta);
            aqueousStream.update(running, delta);
        },
    };
}

function buildConversion(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const denitrationX = -0.9;
    const furnaceX = 0.8;

    const housingMat = makeHousingMaterial(0x6b4a3a);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.9), housingMat);
    housing.position.x = denitrationX;
    housing.userData.infoKey = 'conversion';
    group.add(housing);
    pickables.push(housing);

    const glow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16),
        new THREE.MeshBasicMaterial({ color: 0xff6a3f, transparent: true, opacity: 0 })
    );
    glow.position.set(denitrationX, 0.54, 0);
    group.add(glow);

    const no2Color = new THREE.Color(0xcf6a3f);
    const o2Color = new THREE.Color(0xd8e8f0);
    const gasCount = 8;
    const gasPositions = new Float32Array(gasCount * 3);
    const gasColors = new Float32Array(gasCount * 3);
    const gasSpeed = [];
    function resetGas(i) {
        const c = i % 2 === 0 ? no2Color : o2Color;
        gasPositions[i * 3] = denitrationX + (Math.random() - 0.5) * 0.3;
        gasPositions[i * 3 + 1] = 0.6;
        gasPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        gasColors[i * 3] = c.r;
        gasColors[i * 3 + 1] = c.g;
        gasColors[i * 3 + 2] = c.b;
        gasSpeed[i] = 0.3 + Math.random() * 0.3;
    }
    for (let i = 0; i < gasCount; i++) resetGas(i);
    const gasGeo = new THREE.BufferGeometry();
    gasGeo.setAttribute('position', new THREE.BufferAttribute(gasPositions, 3));
    gasGeo.setAttribute('color', new THREE.BufferAttribute(gasColors, 3));
    const gasMat = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0 });
    group.add(new THREE.Points(gasGeo, gasMat));

    const orangePowderPile = new THREE.Mesh(
        new THREE.ConeGeometry(0.26, 0.28, 16),
        new THREE.MeshStandardMaterial({ color: 0xd9772c })
    );
    orangePowderPile.position.set(denitrationX, -1.6, 0);
    orangePowderPile.scale.setScalar(0.05);
    group.add(orangePowderPile);

    const tubeMat = makeHousingMaterial(0x4a4d51, { emissive: 0xff8f4d });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 16, 1, true), tubeMat);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(furnaceX, -0.5, 0);
    tube.userData.infoKey = 'conversion';
    group.add(tube);
    pickables.push(tube);

    const h2Count = 8;
    const h2Positions = new Float32Array(h2Count * 3);
    const h2T = Array.from({ length: h2Count }, (_, i) => i / h2Count);
    for (let i = 0; i < h2Count; i++) {
        h2Positions[i * 3] = furnaceX - 0.65;
        h2Positions[i * 3 + 1] = -0.5;
    }
    const h2Geo = new THREE.BufferGeometry();
    h2Geo.setAttribute('position', new THREE.BufferAttribute(h2Positions, 3));
    const h2Mat = new THREE.PointsMaterial({ color: 0xe8f2ff, size: 0.04, transparent: true, opacity: 0 });
    group.add(new THREE.Points(h2Geo, h2Mat));

    const orangeC = new THREE.Color(0xd9772c);
    const blackC = new THREE.Color(0x1c1c1c);
    const powderCount = 6;
    const powderPositions = new Float32Array(powderCount * 3);
    const powderColors = new Float32Array(powderCount * 3);
    const powderT = Array.from({ length: powderCount }, (_, i) => i / powderCount);
    for (let i = 0; i < powderCount; i++) {
        powderPositions[i * 3] = furnaceX - 0.65;
        powderPositions[i * 3 + 1] = -0.5;
    }
    const powderGeo = new THREE.BufferGeometry();
    powderGeo.setAttribute('position', new THREE.BufferAttribute(powderPositions, 3));
    powderGeo.setAttribute('color', new THREE.BufferAttribute(powderColors, 3));
    const powderMat = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0 });
    const powderPoints = new THREE.Points(powderGeo, powderMat);
    group.add(powderPoints);
    const powderTmp = new THREE.Color();

    const blackPowderPile = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.3, 16),
        new THREE.MeshStandardMaterial({ color: 0x1c1c1c })
    );
    blackPowderPile.position.set(furnaceX + 0.75, -1.6, 0);
    blackPowderPile.scale.setScalar(0.05);
    group.add(blackPowderPile);

    return {
        housingMat,
        update(progress, running, delta) {
            const denitPhase = THREE.MathUtils.clamp(progress / 0.5, 0, 1);
            const reducePhase = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1);
            const runningDenit = running && progress < 0.5;
            const runningReduce = running && progress >= 0.5;

            glow.material.opacity = runningDenit ? 0.85 : 0;
            gasMat.opacity = runningDenit ? 0.8 : 0;
            if (runningDenit) {
                const gp = gasGeo.attributes.position.array;
                for (let i = 0; i < gasCount; i++) {
                    gp[i * 3 + 1] += gasSpeed[i] * delta;
                    if (gp[i * 3 + 1] > 1.1) resetGas(i);
                }
                gasGeo.attributes.position.needsUpdate = true;
            }
            const denitScale = Math.max(0.05, denitPhase);
            orangePowderPile.scale.setScalar(denitScale);
            orangePowderPile.position.y = -1.77 + denitScale * 0.14;

            tubeMat.emissiveIntensity = runningReduce ? 0.6 : 0;
            h2Mat.opacity = runningReduce ? 0.8 : 0;
            powderMat.opacity = runningReduce ? 0.9 : 0;
            if (runningReduce) {
                const hp = h2Geo.attributes.position.array;
                for (let i = 0; i < h2Count; i++) {
                    h2T[i] = (h2T[i] + delta * 0.8) % 1;
                    hp[i * 3] = THREE.MathUtils.lerp(furnaceX - 0.65, furnaceX + 0.65, h2T[i]);
                }
                h2Geo.attributes.position.needsUpdate = true;

                const pp = powderGeo.attributes.position.array;
                const pc = powderGeo.attributes.color.array;
                for (let i = 0; i < powderCount; i++) {
                    powderT[i] = (powderT[i] + delta * 0.3) % 1;
                    pp[i * 3] = THREE.MathUtils.lerp(furnaceX - 0.65, furnaceX + 0.65, powderT[i]);
                    powderTmp.copy(orangeC).lerp(blackC, powderT[i]);
                    pc[i * 3] = powderTmp.r;
                    pc[i * 3 + 1] = powderTmp.g;
                    pc[i * 3 + 2] = powderTmp.b;
                }
                powderGeo.attributes.position.needsUpdate = true;
                powderGeo.attributes.color.needsUpdate = true;
            }
            const blackScale = Math.max(0.05, reducePhase);
            blackPowderPile.scale.setScalar(blackScale);
            blackPowderPile.position.y = -1.77 + blackScale * 0.15;
        },
    };
}

function buildPelletizer(index) {
    const group = new THREE.Group();
    group.position.set(stationX(index), 0, 0);
    scene.add(group);

    const pressX = -1.0;
    const furnaceX = 0.1;
    const tubeX = 1.1;

    const housingMat = makeHousingMaterial(0x6b7076);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), housingMat);
    base.position.set(pressX, -0.25, 0);
    base.userData.infoKey = 'pelletizing';
    group.add(base);
    pickables.push(base);

    const ram = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.5, 0.26),
        new THREE.MeshStandardMaterial({ color: 0xbfc3c7 })
    );
    ram.position.set(pressX, 0.6, 0);
    group.add(ram);

    const furnaceMat = new THREE.MeshStandardMaterial({ color: 0x3a1a12, emissive: 0xffb366, emissiveIntensity: 0 });
    const furnace = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 16, 1, true), furnaceMat);
    furnace.rotation.z = Math.PI / 2;
    furnace.position.set(furnaceX, -0.42, 0);
    furnace.userData.infoKey = 'pelletizing';
    group.add(furnace);
    pickables.push(furnace);

    const rodTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 1.1, 16, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xaab0b6, transparent: true, opacity: 0.35 })
    );
    rodTube.position.set(tubeX, -0.1, 0);
    rodTube.userData.infoKey = 'pelletizing';
    group.add(rodTube);
    pickables.push(rodTube);

    const greenColor = new THREE.Color(0x4a4a4a);
    const ceramicColor = new THREE.Color(0x232323);
    const tmp = new THREE.Color();

    const count = 8;
    const pelletGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12);
    const pellets = [];
    for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: greenColor.clone() });
        const pellet = new THREE.Mesh(pelletGeo, mat);
        pellet.position.set(pressX, -0.42, 0);
        pellet.visible = false;
        group.add(pellet);
        pellets.push({ mesh: pellet, mat, slot: i });
    }

    return {
        housingMat,
        update(progress, running, delta, elapsed) {
            const runningPress = running && progress < 0.3;
            ram.position.y = runningPress ? 0.6 - (Math.sin(elapsed * 10) * 0.5 + 0.5) * 0.35 : 0.6;
            furnaceMat.emissiveIntensity = running && progress >= 0.3 ? 0.9 : 0;

            pellets.forEach(({ mesh, mat, slot }) => {
                const pressCue = (slot / count) * 0.3;
                const travelStart = 0.3 + (slot / count) * 0.7;
                const travelEnd = 0.3 + ((slot + 1) / count) * 0.7;

                mesh.visible = progress >= pressCue;
                if (!mesh.visible) return;

                const travelT = THREE.MathUtils.clamp((progress - travelStart) / (travelEnd - travelStart), 0, 1);
                mesh.position.x = THREE.MathUtils.lerp(pressX, tubeX, travelT);
                mesh.position.y = THREE.MathUtils.lerp(-0.42, -0.5 + slot * 0.13, travelT);
                mesh.scale.setScalar(THREE.MathUtils.lerp(1, 0.95, travelT));
                tmp.copy(greenColor).lerp(ceramicColor, travelT);
                mat.color.copy(tmp);
            });
        },
    };
}

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

export function initPurexScene(mountEl, onPick) {
    if (initialized) return;
    initialized = true;
    mount = mountEl;
    onPickCallback = onPick || null;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(2, 6.5, 13.5);
    camera.lookAt(0, -0.8, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x404050, 1.4));
    const light = new THREE.DirectionalLight(0xffffff, 1.8);
    light.position.set(5, 10, 5);
    scene.add(light);

    buildFloorAndRail();

    stationUpdaters = [
        buildShearer(0),
        buildDissolver(1),
        buildExtractionColumn(2),
        buildStrippingColumn(3),
        buildConversion(4),
        buildPelletizer(5),
    ];

    gapUpdaters = [
        buildGapFlow(0, [0x3a3228, 0xb8bcc2]),
        buildGapFlow(1, [0xf2a428]),
        buildGapFlow(2, [0xf0c030]),
        buildGapFlow(3, [0xf2b33c]),
        buildGapFlow(4, [0x1c1c1c]),
    ];

    recycleFlow = buildFlowBetween(stationX(3), stationX(2), [0xd8ddd0], { y: 1.3, speed: 0.5, count: 6 });

    renderer.domElement.addEventListener('click', onPointerClick);
    window.addEventListener('resize', resizePurexScene);

    resizePurexScene();
    animate();
}


export function updatePurexVisual({ activeIndex = -1, stageProgress = 0 } = {}) {
    targetActiveIndex = activeIndex;
    targetStageProgress = THREE.MathUtils.clamp(stageProgress, 0, 1);
}

export function resizePurexScene() {
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
