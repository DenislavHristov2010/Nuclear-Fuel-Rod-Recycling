export const MIN_WEIGHT_KG = 1;
export const MAX_WEIGHT_KG = 2000;
export const DEFAULT_WEIGHT_KG = 1000;

const POOL_TEMPERATURE_C = 32.0;

export function clampWeightKg(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_WEIGHT_KG;
    return Math.min(MAX_WEIGHT_KG, Math.max(MIN_WEIGHT_KG, n));
}

function roundTo(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

export function setupWeightControl(sliderEl, labelEl) {
    function render() {
        if (labelEl) labelEl.textContent = `${sliderEl.value} kg`;
    }

    sliderEl.min = String(MIN_WEIGHT_KG);
    sliderEl.max = String(MAX_WEIGHT_KG);
    if (!sliderEl.value) sliderEl.value = String(DEFAULT_WEIGHT_KG);
    sliderEl.addEventListener('input', render);
    render();

    return {
        getWeightKg: () => clampWeightKg(sliderEl.value),
        setLocked: (locked) => {
            sliderEl.disabled = locked;
        },
    };
}

export function scaleCoolingData(json, weightKg) {
    const ratio = clampWeightKg(weightKg) / DEFAULT_WEIGHT_KG;

    const scaleTemp = (t) => roundTo(POOL_TEMPERATURE_C + ratio * (t - POOL_TEMPERATURE_C), 2);
    const scaleHeat = (h) => roundTo(h * ratio, 4);

    const temperature = (json.results.temperature || []).map(scaleTemp);
    const decayHeat = (json.results.decayHeat || []).map(scaleHeat);

    return {
        ...json,
        results: { ...json.results, temperature, decayHeat },
        final: json.final && {
            ...json.final,
            temperature: scaleTemp(json.final.temperature),
            decayHeat: scaleHeat(json.final.decayHeat),
        },
    };
}

export function scalePurexData(json, weightKg) {
    const baseKg = (json.input && json.input.heavyMetalMassStartingKG) || DEFAULT_WEIGHT_KG;
    const ratio = clampWeightKg(weightKg) / baseKg;
    const kg = (v) => roundTo(v * ratio, 4);

    const stages = json.stages.map((stage) => {
        switch (stage.id) {
            case 'shearing':
                return { ...stage, durationHours: roundTo(stage.durationHours * ratio, 3) };
            case 'dissolution':
                return {
                    ...stage,
                    uraniumDissolvedKg: kg(stage.uraniumDissolvedKg),
                    uraniumUndissolvedHullKg: kg(stage.uraniumUndissolvedHullKg),
                    nitricAcidConsumedMol: roundTo(stage.nitricAcidConsumedMol * ratio, 1),
                };
            case 'extraction':
                return {
                    ...stage,
                    uraniumToSolventKg: kg(stage.uraniumToSolventKg),
                    uraniumLostToRaffinateKg: kg(stage.uraniumLostToRaffinateKg),
                };
            case 'stripping':
                return {
                    ...stage,
                    uraniumFinalProductSolutionKg: kg(stage.uraniumFinalProductSolutionKg),
                    uraniumInventoryInSolventKg: roundTo(stage.uraniumInventoryInSolventKg * ratio, 5),
                };
            case 'conversion':
                return {
                    ...stage,
                    massUO2PowderKg: kg(stage.massUO2PowderKg),
                    massUraniumInUO2Kg: kg(stage.massUraniumInUO2Kg),
                    massUraniumLostInConversionKg: kg(stage.massUraniumLostInConversionKg),
                };
            case 'pelletizing':
                return { ...stage, totalNumberOfPellets: Math.floor(stage.totalNumberOfPellets * ratio) };
            default:
                return stage;
        }
    });

    const mb = json.massBalance;
    const massBalance = {
        ...mb,
        startingUraniumKg: kg(mb.startingUraniumKg),
        uraniumInUO2Kg: kg(mb.uraniumInUO2Kg),
        uraniumUndissolvedHullKg: kg(mb.uraniumUndissolvedHullKg),
        uraniumLostToRaffinateKg: kg(mb.uraniumLostToRaffinateKg),
        uraniumInventoryInSolventKg: roundTo(mb.uraniumInventoryInSolventKg * ratio, 5),
        uraniumLostInConversionKg: kg(mb.uraniumLostInConversionKg),
        totalCheckKg: kg(mb.totalCheckKg),
    };

    const fissionProducts = Object.fromEntries(
        Object.entries(json.fissionProducts).map(([k, v]) => [k, kg(v)])
    );

    return {
        ...json,
        input: { ...json.input, heavyMetalMassStartingKG: clampWeightKg(weightKg) },
        stages,
        massBalance,
        fissionProducts,
    };
}

export function scalePyroData(json, weightKg) {
    const baseKg = (json.input && json.input.heavyMetalMassStartingKG) || DEFAULT_WEIGHT_KG;
    const ratio = clampWeightKg(weightKg) / baseKg;
    const kg = (v) => roundTo(v * ratio, 4);

    const stages = json.stages.map((stage) => {
        switch (stage.id) {
            case 'chopVolox':
                return {
                    ...stage,
                    massUraniumPowderKg: kg(stage.massUraniumPowderKg),
                    massUraniumLeftOnHullsKg: kg(stage.massUraniumLeftOnHullsKg),
                    molesU3O8Powder: roundTo(stage.molesU3O8Powder * ratio, 1),
                };
            case 'oxideReduction':
                return {
                    ...stage,
                    massUraniumMetalKg: kg(stage.massUraniumMetalKg),
                    massUraniumUnreducedKg: kg(stage.massUraniumUnreducedKg),
                    chargeNeededCoulombs: roundTo(stage.chargeNeededCoulombs * ratio, 0),
                };
            case 'electrorefining':
                return {
                    ...stage,
                    massUraniumDissolvedAtAnodeKg: kg(stage.massUraniumDissolvedAtAnodeKg),
                    massUraniumLeftInAnodeBasketKg: kg(stage.massUraniumLeftInAnodeBasketKg),
                    massUraniumDepositedOnCathodeKg: kg(stage.massUraniumDepositedOnCathodeKg),
                    massUraniumHeldInSaltInventoryKg: kg(stage.massUraniumHeldInSaltInventoryKg),
                };
            case 'cathodeProcessing':
                return {
                    ...stage,
                    massUraniumIngotKg: kg(stage.massUraniumIngotKg),
                    massUraniumLeftInCrucibleHeelKg: kg(stage.massUraniumLeftInCrucibleHeelKg),
                };
            case 'coRecovery':
                return { ...stage, massUraniumKg: kg(stage.massUraniumKg) };
            case 'uZrCasting':
                return {
                    ...stage,
                    massZirconiumAddedKg: kg(stage.massZirconiumAddedKg),
                    massFinalMetalFuelAlloyKg: kg(stage.massFinalMetalFuelAlloyKg),
                };
            case 'wasteStreams':
                return { ...stage, totalUraniumWasteKg: kg(stage.totalUraniumWasteKg) };
            default:
                return stage;
        }
    });

    const mb = json.massBalance;
    const massBalance = {
        ...mb,
        startingUraniumKg: kg(mb.startingUraniumKg),
        finalAlloyIngotKg: kg(mb.finalAlloyIngotKg),
        hullsWasteKg: kg(mb.hullsWasteKg),
        unreducedOxideWasteKg: kg(mb.unreducedOxideWasteKg),
        anodeBasketWasteKg: kg(mb.anodeBasketWasteKg),
        saltInventoryKg: kg(mb.saltInventoryKg),
        crucibleHeelWasteKg: kg(mb.crucibleHeelWasteKg),
        totalCheckKg: kg(mb.totalCheckKg),
    };

    const fissionProducts = Object.fromEntries(
        Object.entries(json.fissionProducts).map(([k, v]) => [k, kg(v)])
    );

    return {
        ...json,
        input: { ...json.input, heavyMetalMassStartingKG: clampWeightKg(weightKg) },
        stages,
        massBalance,
        fissionProducts,
    };
}
