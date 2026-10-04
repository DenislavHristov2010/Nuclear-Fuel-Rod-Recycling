import { initPurexScene, updatePurexVisual, resizePurexScene } from './three/purex-scene.js';
import { sizeCanvasForDisplay, drawAxisCaptions } from './chart-utils.js';
import { setupWeightControl, scalePurexData } from './weight-control.js';

const API_BASE = '';
const PUREX_ENDPOINT = `${API_BASE}/api/purex`;

const STAGE_MS = 1800;

const INFO_TEXT = {
    shearing:
        'P1 - Shearing: the fuel assembly is fed into a mechanical shear that chops the rods into short ' +
        'segments, dropping a mix of dark fuel pieces and metallic zircaloy cladding fragments down a ' +
        'chute into the dissolver.',
    dissolution:
        'P2 - Dissolution & clarification: the pieces dissolve in hot nitric acid, venting off-gas (NOx ' +
        'and other light gases) while the liquid turns into a bright yellow/orange uranyl nitrate ' +
        'solution. Undissolved cladding hulls stay behind in a basket at the bottom, and a centrifuge ' +
        'spins out fine insoluble solids into a separate waste stream.',
    extraction:
        'P3 - Solvent extraction: clear organic solvent (TBP in dodecane) and the yellow aqueous uranyl ' +
        'nitrate liquor flow counter-current through a mixer-settler column. Uranium moves into the ' +
        'organic phase, which exits bright gold; the aqueous phase leaves as a waste-tinted "raffinate" ' +
        'carrying most fission products.',
    stripping:
        'P4 - Stripping: the gold, uranium-loaded solvent meets a fresh, warm, dilute nitric acid stream. ' +
        'Uranium moves back out of the solvent into this new aqueous stream, which exits as a rich yellow ' +
        'product solution. The now-clear solvent loops back to be reused in extraction.',
    conversion:
        'P5 - Conversion: the purified uranyl nitrate solution is thermally denitrated, releasing NO2 and ' +
        'O2 gas and leaving orange UO3 powder. A reduction furnace then reacts the powder with hydrogen ' +
        'gas, turning it into fine, dark black UO2 powder.',
    pelletizing:
        'P6 - Pellet fabrication: black UO2 powder is pressed into soft "green" pellets, which shrink by ' +
        'about 5% and darken into dense ceramic pellets as they pass through a sintering furnace near ' +
        '1700 C, then are packed sequentially into fuel rod tubes.',
};

const els = {
    mount: document.getElementById('purex-visual'),
    start: document.getElementById('purex-start'),
    pause: document.getElementById('purex-pause'),
    status: document.getElementById('purex-status'),
    progress: document.getElementById('purex-progress'),
    progressLabel: document.getElementById('purex-progress-label'),
    chart: document.getElementById('purex-chart'),
    statStage: document.getElementById('purex-stat-stage'),
    statUranium: document.getElementById('purex-stat-uranium'),
    statFp: document.getElementById('purex-stat-fp'),
    infoText: document.getElementById('purex-info-text'),
    weightSlider: document.getElementById('purex-weight'),
    weightLabel: document.getElementById('purex-weight-value'),
};

if (els.mount && els.start && els.pause && els.chart) {
    runPurexPage();
}

function runPurexPage() {
    let sceneReady = false;
    let data = null;
    let stageIndex = -1;
    let stageElapsed = 0;
    let state = 'ready';

    const weightControl = els.weightSlider
        ? setupWeightControl(els.weightSlider, els.weightLabel)
        : null;

    const purexSection = document.getElementById('purex');

    function ensureSceneInitialized() {
        if (sceneReady) return;
        sceneReady = true;
        initPurexScene(els.mount, handlePick);
    }

    if (purexSection) {
        if (purexSection.classList.contains('active')) {
            ensureSceneInitialized();
        }
        const observer = new MutationObserver(() => {
            if (purexSection.classList.contains('active')) {
                ensureSceneInitialized();
                resizePurexScene();
            }
        });
        observer.observe(purexSection, { attributes: true, attributeFilter: ['class'] });
    }

    function handlePick(key) {
        if (els.infoText && INFO_TEXT[key]) {
            els.infoText.textContent = INFO_TEXT[key];
        }
    }

    function setState(next) {
        state = next;
        els.status.classList.remove('is-active', 'is-complete', 'is-error');

        if (weightControl) {
            weightControl.setLocked(state === 'loading' || state === 'running' || state === 'paused');
        }

        if (state === 'ready') {
            els.status.textContent = 'READY';
            els.start.disabled = false;
            els.start.textContent = 'Start Process';
            els.pause.disabled = true;
            els.pause.textContent = 'Pause';
        } else if (state === 'loading') {
            els.status.textContent = 'LOADING';
            els.start.disabled = true;
            els.pause.disabled = true;
        } else if (state === 'running') {
            els.status.textContent = 'ACTIVE';
            els.status.classList.add('is-active');
            els.start.disabled = true;
            els.pause.disabled = false;
            els.pause.textContent = 'Pause';
        } else if (state === 'paused') {
            els.status.textContent = 'PAUSED';
            els.start.disabled = true;
            els.pause.disabled = false;
            els.pause.textContent = 'Resume';
        } else if (state === 'complete') {
            els.status.textContent = 'COMPLETE';
            els.status.classList.add('is-complete');
            els.start.disabled = false;
            els.start.textContent = 'Restart';
            els.pause.disabled = true;
            els.pause.textContent = 'Pause';
        } else if (state === 'error') {
            els.status.textContent = 'ERROR';
            els.status.classList.add('is-error');
            els.start.disabled = false;
            els.start.textContent = 'Retry';
            els.pause.disabled = true;
        }
    }

    async function startProcess() {
        if (state === 'loading' || state === 'running' || state === 'paused') return;

        setState('loading');
        try {
            const response = await fetch(PUREX_ENDPOINT);
            if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
            const json = await response.json();

            if (!json || !Array.isArray(json.stages) || json.stages.length === 0) {
                throw new Error('Unexpected response shape from /api/purex');
            }

            data = weightControl ? scalePurexData(json, weightControl.getWeightKg()) : json;
            stageIndex = 0;
            stageElapsed = 0;
            setState('running');
        } catch (err) {
            console.error('Could not load PUREX data from', PUREX_ENDPOINT, err);
            data = null;
            setState('error');
        }
    }

    function togglePause() {
        if (state === 'running') setState('paused');
        else if (state === 'paused') setState('running');
    }

    function mainstreamKgForStage(index) {
        if (!data) return null;
        const stage = data.stages[index];
        const mb = data.massBalance || {};
        if (!stage) return null;
        switch (stage.id) {
            case 'shearing':
                return mb.startingUraniumKg ?? null;
            case 'dissolution':
                return stage.uraniumDissolvedKg ?? null;
            case 'extraction':
                return stage.uraniumToSolventKg ?? null;
            case 'stripping':
                return stage.uraniumFinalProductSolutionKg ?? null;
            case 'conversion':
                return stage.massUraniumInUO2Kg ?? null;
            case 'pelletizing': {
                const conv = data.stages.find((s) => s.id === 'conversion');
                return conv ? conv.massUraniumInUO2Kg ?? null : null;
            }
            default:
                return null;
        }
    }

    function formatKg(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '—';
        return `${Math.round(value * 10) / 10} kg`;
    }

    function updateReadouts() {
        if (!data || stageIndex < 0) return;
        const stage = data.stages[stageIndex];
        const total = data.stages.length;
        const suffix = state === 'complete' ? ' (complete)' : '';
        els.statStage.textContent = `${stageIndex + 1} / ${total} — ${stage.label}${suffix}`;
        els.statUranium.textContent = formatKg(mainstreamKgForStage(stageIndex));

        const fp = data.fissionProducts || {};
        const fpTotal = Object.values(fp).reduce((sum, v) => sum + v, 0);
        els.statFp.textContent = formatKg(fpTotal);

        const total1 = data.stages.length - 1;
        const fraction = total1 > 0 ? (stageIndex + (state === 'complete' ? 1 : stageElapsed / STAGE_MS)) / total : 0;
        const pct = Math.min(100, Math.round(fraction * 100));
        els.progress.value = pct;
        els.progressLabel.textContent = state === 'complete' ? `Stage ${total} of ${total}` : `Stage ${stageIndex + 1} of ${total}`;
    }

    function drawChart() {
        const ctx = els.chart.getContext('2d');
        const { width, height } = sizeCanvasForDisplay(els.chart);
        if (width === 0 || height === 0) return;
        const pad = 28;

        ctx.clearRect(0, 0, width, height);

        const styles = getComputedStyle(document.documentElement);
        const borderColor = styles.getPropertyValue('--border').trim() || '#2a2d31';
        const mutedColor = styles.getPropertyValue('--text-muted').trim() || '#9a9ea3';
        const accentColor = styles.getPropertyValue('--accent').trim() || '#c08a46';

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, pad);
        ctx.lineTo(pad, height - pad);
        ctx.lineTo(width - pad, height - pad);
        ctx.stroke();

        drawAxisCaptions(ctx, { width, height, pad, color: mutedColor, yLabel: 'Uranium mass (kg)', xLabel: 'Process stage' });

        if (!data) {
            ctx.fillStyle = mutedColor;
            ctx.font = '12px Arial';
            ctx.fillText('Uranium mass balance will appear here once the process starts.', pad + 8, height / 2);
            return;
        }

        const n = data.stages.length;
        const values = [];
        for (let i = 0; i < n; i++) values.push(mainstreamKgForStage(i));

        const validValues = values.filter((v) => v !== null && v !== undefined);
        const maxKg = validValues.length ? Math.max(...validValues) : 1;
        const minKg = validValues.length ? Math.min(...validValues) : 0;
        const range = maxKg - minKg || 1;
        const floor = minKg - range * 0.15;

        const barAreaWidth = width - 2 * pad;
        const slot = barAreaWidth / n;
        const barWidth = slot * 0.55;

        for (let i = 0; i < n; i++) {
            const kg = values[i];
            const barHeight = kg !== null ? ((kg - floor) / (maxKg - floor)) * (height - 2 * pad) : 0;
            const x = pad + i * slot + (slot - barWidth) / 2;
            const y = height - pad - barHeight;

            if (i <= stageIndex || state === 'complete') {
                ctx.fillStyle = accentColor;
                ctx.fillRect(x, y, barWidth, barHeight);
            } else {
                ctx.strokeStyle = borderColor;
                ctx.strokeRect(x, y, barWidth, barHeight);
            }
        }

        ctx.fillStyle = mutedColor;
        ctx.font = '11px Arial';
        ctx.fillText(`${Math.round(maxKg * 10) / 10} kg`, 4, pad + 4);
        ctx.fillText(`${Math.round(floor * 10) / 10} kg`, 4, height - pad);
    }

    let lastFrame = performance.now();
    function tick(now) {
        requestAnimationFrame(tick);
        const delta = now - lastFrame;
        lastFrame = now;

        if (state === 'running' && data) {
            stageElapsed += delta;
            if (stageElapsed >= STAGE_MS) {
                if (stageIndex < data.stages.length - 1) {
                    stageIndex++;
                    stageElapsed = 0;
                } else {
                    stageElapsed = STAGE_MS;
                    setState('complete');
                }
            }
        }

        if (data) {
            updateReadouts();
        }
        drawChart();

        const stageProgress = state === 'complete' ? 1 : stageElapsed / STAGE_MS;
        updatePurexVisual({ activeIndex: stageIndex, stageProgress });
    }

    els.start.addEventListener('click', startProcess);
    els.pause.addEventListener('click', togglePause);

    setState('ready');
    drawChart();
    requestAnimationFrame(tick);
}
