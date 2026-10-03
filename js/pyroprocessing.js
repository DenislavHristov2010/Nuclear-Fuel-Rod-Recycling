import { initPyroScene, updatePyroVisual, resizePyroScene } from './three/pyroprocessing-scene.js';

// Same-origin by default - change if the API is served from elsewhere.
const API_BASE = '';
const PYRO_ENDPOINT = `${API_BASE}/api/pyroprocessing`;

// How long each stage stays on screen while playing (ms). Purely an
// animation-pacing choice, not data from the backend.
const STAGE_MS = 1800;

const INFO_TEXT = {
    chopVolox:
        'Y1 - Chopping & Voloxidation: intact fuel assemblies are chopped into segments, then heated in ' +
        'oxygen at about 500 C. Dark UO2 crumbles into dry U3O8 powder; zircaloy cladding hulls are routed ' +
        'to a metallic waste bin, and volatile fission gases (G1) vent off.',
    oxideReduction:
        'Y2 - Electrolytic Oxide Reduction: U3O8 powder sits in a cathode basket submerged in molten ' +
        'LiCl-Li2O salt at about 650 C. Electric current reduces it to metallic uranium while oxygen ' +
        'bubbles off the anode; alkali and alkaline-earth fission products (G2, G3) dissolve into the ' +
        'glowing salt.',
    electrorefining:
        'Y3 - Electrorefining: in a roughly 500 C LiCl-KCl salt bath, uranium metal dissolves from an ' +
        'anode basket as U3+ ions and deposits as pure metal crystals on a steel cathode rod. Rare-earth ' +
        'fission products (G4) dissolve into the salt; noble metal fines (G7) stay behind as sludge.',
    cathodeProcessing:
        'Y4 - Cathode Processing: the salt-laden cathode deposit is loaded into a vacuum furnace. Heat ' +
        'vaporizes the adhering salt, which condenses and returns to the electrorefiner; the clean ' +
        'uranium melts and is cast into a solid ingot.',
    coRecovery:
        'Y5 - U/TRU Co-Recovery (bypassed): this step would normally co-recover plutonium and other ' +
        'transuranics alongside uranium. It is out of scope for this uranium-only demo, so the ingot ' +
        'simply passes through unchanged.',
    uZrCasting:
        'Y6 - U-Zr Fuel Casting: 10 wt% zirconium metal is alloyed into the uranium ingot in a molten ' +
        'pool, then cast into solid U-10Zr metallic fuel pins.',
    wasteStreams:
        'Y7 - Waste Streams: spent carrier salt loaded with fission-product chlorides is solidified into ' +
        'ceramic waste blocks, while hulls, anode sludge, unreduced oxide, and crucible heel are melted ' +
        'into a dense metallic waste ingot.',
};

const els = {
    mount: document.getElementById('pyro-visual'),
    start: document.getElementById('pyro-start'),
    pause: document.getElementById('pyro-pause'),
    next: document.getElementById('pyro-next'),
    status: document.getElementById('pyro-status'),
    progress: document.getElementById('pyro-progress'),
    progressLabel: document.getElementById('pyro-progress-label'),
    chart: document.getElementById('pyro-chart'),
    statStage: document.getElementById('pyro-stat-stage'),
    statMass: document.getElementById('pyro-stat-mass'),
    statFp: document.getElementById('pyro-stat-fp'),
    infoText: document.getElementById('pyro-info-text'),
};

if (els.mount && els.start && els.pause && els.chart) {
    runPyroPage();
}

function runPyroPage() {
    let sceneReady = false;
    let data = null;
    let stageIndex = -1;
    let stageElapsed = 0;
    let state = 'ready'; // ready | loading | running | paused | complete | error

    const pyroSection = document.getElementById('pyroprocessing');
    const repackagingNavButton = document.querySelector('.nav-links button[data-page="repackaging"]');

    function ensureSceneInitialized() {
        if (sceneReady) return;
        sceneReady = true;
        initPyroScene(els.mount, handlePick);
    }

    if (pyroSection) {
        if (pyroSection.classList.contains('active')) {
            ensureSceneInitialized();
        }
        const observer = new MutationObserver(() => {
            if (pyroSection.classList.contains('active')) {
                ensureSceneInitialized();
                resizePyroScene();
            }
        });
        observer.observe(pyroSection, { attributes: true, attributeFilter: ['class'] });
    }

    function handlePick(key) {
        if (els.infoText && INFO_TEXT[key]) {
            els.infoText.textContent = INFO_TEXT[key];
        }
    }

    function setState(next) {
        state = next;
        els.status.classList.remove('is-active', 'is-complete', 'is-error');

        if (state === 'ready') {
            els.status.textContent = 'READY';
            els.start.disabled = false;
            els.start.textContent = 'Start Process';
            els.pause.disabled = true;
            els.pause.textContent = 'Pause';
            els.next.hidden = true;
        } else if (state === 'loading') {
            els.status.textContent = 'LOADING';
            els.start.disabled = true;
            els.pause.disabled = true;
            els.next.hidden = true;
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
            els.status.textContent = 'COMPLETE — NEXT STAGE';
            els.status.classList.add('is-complete');
            els.start.disabled = false;
            els.start.textContent = 'Restart';
            els.pause.disabled = true;
            els.pause.textContent = 'Pause';
            els.next.hidden = false;
        } else if (state === 'error') {
            els.status.textContent = 'ERROR';
            els.status.classList.add('is-error');
            els.start.disabled = false;
            els.start.textContent = 'Retry';
            els.pause.disabled = true;
            els.next.hidden = true;
        }
    }

    async function startProcess() {
        if (state === 'loading' || state === 'running' || state === 'paused') return;

        setState('loading');
        try {
            const response = await fetch(PYRO_ENDPOINT);
            if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
            const json = await response.json();

            if (!json || !Array.isArray(json.stages) || json.stages.length === 0) {
                throw new Error('Unexpected response shape from /api/pyroprocessing');
            }

            data = json;
            stageIndex = 0;
            stageElapsed = 0;
            setState('running');
        } catch (err) {
            console.error('Could not load pyroprocessing data from', PYRO_ENDPOINT, err);
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
        if (!stage) return null;
        switch (stage.id) {
            case 'chopVolox':
                return stage.massUraniumPowderKg ?? null;
            case 'oxideReduction':
                return stage.massUraniumMetalKg ?? null;
            case 'electrorefining':
                return stage.massUraniumDepositedOnCathodeKg ?? null;
            case 'cathodeProcessing':
                return stage.massUraniumIngotKg ?? null;
            case 'coRecovery':
                return stage.massUraniumKg ?? null;
            case 'uZrCasting':
                return stage.massFinalMetalFuelAlloyKg ?? null;
            case 'wasteStreams': {
                const cast = data.stages.find((s) => s.id === 'uZrCasting');
                return cast ? cast.massFinalMetalFuelAlloyKg ?? null : null;
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
        els.statMass.textContent = formatKg(mainstreamKgForStage(stageIndex));

        const fp = data.fissionProducts || {};
        const fpTotal = Object.values(fp).reduce((sum, v) => sum + v, 0);
        els.statFp.textContent = formatKg(fpTotal);

        const fraction = total > 0 ? (stageIndex + (state === 'complete' ? 1 : stageElapsed / STAGE_MS)) / total : 0;
        const pct = Math.min(100, Math.round(fraction * 100));
        els.progress.value = pct;
        els.progressLabel.textContent = state === 'complete' ? `Stage ${total} of ${total}` : `Stage ${stageIndex + 1} of ${total}`;
    }

    function drawChart() {
        const ctx = els.chart.getContext('2d');
        const width = els.chart.width;
        const height = els.chart.height;
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

        if (!data) {
            ctx.fillStyle = mutedColor;
            ctx.font = '12px Arial';
            ctx.fillText('Mass in stream will appear here once the process starts.', pad + 8, height / 2);
            return;
        }

        const n = data.stages.length;
        const values = [];
        for (let i = 0; i < n; i++) values.push(mainstreamKgForStage(i));

        // Auto-scale to the actual value range (same approach as the other
        // pages' charts) - the Zr addition at Y6 means this isn't a purely
        // decreasing series, so a zero-based axis would be misleading here.
        const validValues = values.filter((v) => v !== null && v !== undefined);
        const maxKg = validValues.length ? Math.max(...validValues) : 1;
        const minKg = validValues.length ? Math.min(...validValues) : 0;
        const range = maxKg - minKg || 1;
        const floor = minKg - range * 0.15;
        const ceil = maxKg + range * 0.1;

        const barAreaWidth = width - 2 * pad;
        const slot = barAreaWidth / n;
        const barWidth = slot * 0.55;

        for (let i = 0; i < n; i++) {
            const kg = values[i];
            const barHeight = kg !== null ? ((kg - floor) / (ceil - floor)) * (height - 2 * pad) : 0;
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
        ctx.fillText(`${Math.round(ceil * 10) / 10} kg`, 4, pad + 4);
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
            drawChart();
        }

        const stageProgress = state === 'complete' ? 1 : stageElapsed / STAGE_MS;
        updatePyroVisual({ activeIndex: stageIndex, stageProgress });
    }

    els.start.addEventListener('click', startProcess);
    els.pause.addEventListener('click', togglePause);
    els.next.addEventListener('click', () => {
        if (typeof window.showPage === 'function') {
            window.showPage('repackaging', repackagingNavButton || undefined);
        }
    });

    setState('ready');
    drawChart();
    requestAnimationFrame(tick);
}
