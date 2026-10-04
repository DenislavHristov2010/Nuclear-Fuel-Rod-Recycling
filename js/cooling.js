import { initCoolingScene, updateCoolingVisual, resizeCoolingScene } from './three/three.js';
import { sizeCanvasForDisplay, drawAxisCaptions } from './chart-utils.js';
import { setupWeightControl, scaleCoolingData } from './weight-control.js';

const API_BASE = '';
const COOLING_ENDPOINT = `${API_BASE}/api/cooling`;

const STEP_MS = 150;

const INFO_TEXT = {
    fuel:
        'This is a spent fuel assembly: a bundle of fuel rods removed from the reactor. ' +
        'The chain reaction has stopped, but the rods still produce "decay heat" from the ' +
        'ongoing radioactive decay of fission products inside them.',
    water:
        'Pool water does two jobs at once: it carries decay heat away from the fuel by ' +
        'natural circulation, and its depth provides shielding that blocks radiation from ' +
        'reaching workers above the pool.',
    cooling:
        'Pool water is continuously pumped through a heat exchanger here, which removes the ' +
        'decay heat so the pool stays within a safe temperature range as the fuel cools.',
    cherenkov:
        'The blue glow is Cherenkov radiation: light emitted when fast charged particles from ' +
        'the fuel travel through water faster than light travels in water. It is a visible sign ' +
        'of radioactivity, not a hazard by itself at this depth.',
};

const els = {
    mount: document.getElementById('cooling-visual'),
    start: document.getElementById('cooling-start'),
    pause: document.getElementById('cooling-pause'),
    next: document.getElementById('cooling-next'),
    status: document.getElementById('cooling-status'),
    progress: document.getElementById('cooling-progress'),
    progressLabel: document.getElementById('cooling-progress-label'),
    chart: document.getElementById('cooling-chart'),
    statTime: document.getElementById('stat-time'),
    statTemp: document.getElementById('stat-temp'),
    statHeat: document.getElementById('stat-heat'),
    infoText: document.getElementById('cooling-info-text'),
    weightSlider: document.getElementById('cooling-weight'),
    weightLabel: document.getElementById('cooling-weight-value'),
};

if (els.mount && els.start && els.pause && els.chart) {
    runCoolingPage();
}

function runCoolingPage() {
    let sceneReady = false;
    let data = null;
    let index = 0;
    let accumulator = 0;
    let state = 'ready';

    const weightControl = els.weightSlider
        ? setupWeightControl(els.weightSlider, els.weightLabel)
        : null;

    const coolingSection = document.getElementById('cooling');
    const purexNavButton = document.querySelector('.nav-links button[data-page="purex"]');

    function ensureSceneInitialized() {
        if (sceneReady) return;
        sceneReady = true;
        initCoolingScene(els.mount, handlePick);
    }

    if (coolingSection) {
        if (coolingSection.classList.contains('active')) {
            ensureSceneInitialized();
        }
        const observer = new MutationObserver(() => {
            if (coolingSection.classList.contains('active')) {
                ensureSceneInitialized();
                resizeCoolingScene();
            }
        });
        observer.observe(coolingSection, { attributes: true, attributeFilter: ['class'] });
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
            weightControl.setLocked(state === 'loading' || state === 'cooling' || state === 'paused');
        }

        if (state === 'ready') {
            els.status.textContent = 'READY';
            els.start.disabled = false;
            els.start.textContent = 'Start Cooling';
            els.pause.disabled = true;
            els.pause.textContent = 'Pause';
            els.next.hidden = true;
        } else if (state === 'loading') {
            els.status.textContent = 'LOADING';
            els.start.disabled = true;
            els.pause.disabled = true;
            els.next.hidden = true;
        } else if (state === 'cooling') {
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

    async function startCooling() {
        if (state === 'loading' || state === 'cooling' || state === 'paused') return;

        setState('loading');
        try {
            const response = await fetch(COOLING_ENDPOINT);
            if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
            const json = await response.json();

            if (!json || !Array.isArray(json.time) || !json.results) {
                throw new Error('Unexpected response shape from /api/cooling');
            }

            data = weightControl ? scaleCoolingData(json, weightControl.getWeightKg()) : json;
            index = 0;
            accumulator = 0;
            setState('cooling');
        } catch (err) {
            console.error('Could not load cooling simulation data from', COOLING_ENDPOINT, err);
            data = null;
            setState('error');
        }
    }

    function togglePause() {
        if (state === 'cooling') setState('paused');
        else if (state === 'paused') setState('cooling');
    }

    function finishCooling() {
        const temps = data.results.temperature || [];
        const heats = data.results.decayHeat || [];
        index = Math.max(temps.length, heats.length, data.time.length) - 1;
        setState('complete');
    }

    function fieldAt(array, i, fallback = null) {
        if (!Array.isArray(array) || array[i] === undefined || array[i] === null) return fallback;
        return array[i];
    }

    function formatValue(value, unit) {
        if (value === null || value === undefined || Number.isNaN(value)) return '—';
        const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
        return unit ? `${rounded} ${unit}` : `${rounded}`;
    }

    function updateReadouts() {
        if (!data) return;
        const meta = data.metadata || {};
        const timeUnit = meta.timeUnit || meta.time_unit || '';
        const tempUnit = meta.temperatureUnit || meta.temperature_unit || '';
        const heatUnit = meta.decayHeatUnit || meta.decay_heat_unit || '';

        const time = fieldAt(data.time, index);
        const temp = fieldAt(data.results.temperature, index);
        const heat = fieldAt(data.results.decayHeat, index);

        els.statTime.textContent = formatValue(time, timeUnit);
        els.statTemp.textContent = formatValue(temp, tempUnit);
        els.statHeat.textContent = formatValue(heat, heatUnit);

        const lastIndex = data.time.length - 1;
        const pct = lastIndex > 0 ? Math.round((index / lastIndex) * 100) : 0;
        els.progress.value = pct;
        els.progressLabel.textContent = `${pct}%`;
    }

    function computeHeatFraction() {
        if (!data || !Array.isArray(data.results.decayHeat) || data.results.decayHeat.length === 0) return 0;
        const first = data.results.decayHeat[0];
        const current = fieldAt(data.results.decayHeat, index, first);
        if (!first) return 0;
        const fraction = current / first;
        return Math.min(1, Math.max(0, fraction));
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

        drawAxisCaptions(ctx, { width, height, pad, color: mutedColor, yLabel: 'Temperature (C)', xLabel: 'Time (days)' });

        if (!data || !Array.isArray(data.results.temperature) || data.results.temperature.length === 0) {
            ctx.fillStyle = mutedColor;
            ctx.font = '12px Arial';
            ctx.fillText('Temperature data will appear here once cooling starts.', pad + 8, height / 2);
            return;
        }

        const temps = data.results.temperature;
        const n = temps.length;
        const maxT = Math.max(...temps);
        const minT = Math.min(...temps);
        const range = maxT - minT || 1;

        const toX = (i) => pad + (i / Math.max(1, n - 1)) * (width - 2 * pad);
        const toY = (t) => height - pad - ((t - minT) / range) * (height - 2 * pad);

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= index && i < n; i++) {
            const x = toX(i);
            const y = toY(temps[i]);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        const curX = toX(Math.min(index, n - 1));
        const curY = toY(temps[Math.min(index, n - 1)]);
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(curX, curY, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = mutedColor;
        ctx.font = '11px Arial';
        ctx.fillText(`${Math.round(maxT)}C`, 4, pad + 4);
        ctx.fillText(`${Math.round(minT)}C`, 4, height - pad);
    }

    let lastFrame = performance.now();
    function tick(now) {
        requestAnimationFrame(tick);
        const delta = now - lastFrame;
        lastFrame = now;

        if (state === 'cooling' && data) {
            accumulator += delta;
            const lastIndex = data.time.length - 1;
            while (accumulator >= STEP_MS && index < lastIndex) {
                accumulator -= STEP_MS;
                index++;
            }
            if (index >= lastIndex) {
                finishCooling();
            }
        }

        if (data) {
            updateReadouts();
        }
        drawChart();

        updateCoolingVisual({
            heatFraction: computeHeatFraction(),
            flowActive: state === 'cooling',
        });
    }

    els.start.addEventListener('click', startCooling);
    els.pause.addEventListener('click', togglePause);
    els.next.addEventListener('click', () => {
        if (typeof window.showPage === 'function') {
            window.showPage('purex', purexNavButton || undefined);
        }
    });

    setState('ready');
    drawChart();
    requestAnimationFrame(tick);
}
