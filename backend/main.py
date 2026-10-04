import math
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import PUREX as purex
from . import pyroprocessing as pyro

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_INDEX = os.path.join(BASE_DIR, "frontend", "index.html")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

START_TEMPERATURE_C = 85.0
POOL_TEMPERATURE_C = 32.0
START_DECAY_HEAT_KW = 12.0
RESIDUAL_HEAT_KW = 1.0
# Tuned so the curve reaches ~97% cooled by the end of DURATION_DAYS, same
# target fraction the old 20-day/0.18 pair used - just stretched to fit a
# 5-year window instead of flattening out in the first month of it.
DECAY_RATE_PER_DAY = 0.002
DURATION_DAYS = 5 * 365  # 5 years, expressed in days
STEPS = 40


@app.get("/api/cooling")
def get_cooling_data():
    dt = DURATION_DAYS / (STEPS - 1)
    time = [round(i * dt, 2) for i in range(STEPS)]

    temperature = [
        round(POOL_TEMPERATURE_C + (START_TEMPERATURE_C - POOL_TEMPERATURE_C) * math.exp(-DECAY_RATE_PER_DAY * t), 2)
        for t in time
    ]
    decay_heat = [
        round(RESIDUAL_HEAT_KW + (START_DECAY_HEAT_KW - RESIDUAL_HEAT_KW) * math.exp(-DECAY_RATE_PER_DAY * t), 3)
        for t in time
    ]

    return {
        "time": time,
        "results": {
            "temperature": temperature,
            "decayHeat": decay_heat,
        },
        "final": {
            "time": time[-1],
            "temperature": temperature[-1],
            "decayHeat": decay_heat[-1],
        },
        "metadata": {
            "timeUnit": "days",
            "temperatureUnit": "C",
            "decayHeatUnit": "kW",
            "note": "Illustrative educational values only, not real operating data.",
        },
    }


@app.get("/api/purex")
def get_purex_data():
    """Packages the PUREX numbers already computed in PUREX.py into the
    stage-by-stage shape the frontend's PUREX page expects. No new
    calculations happen here - this only reads values that module already
    computed at import time.
    """
    return {
        "input": {
            "heavyMetalMassStartingKG": purex.heavyMetalMassStartingKG,
            "burnupGWDpMTHM": purex.burnupGWDpMTHM,
        },
        "stages": [
            {
                "id": "shearing",
                "label": "Shearing",
                "durationHours": round(purex.shearingTimeHours, 3),
                "throughputKgPerDay": purex.shearingThroughputKgPerDay,
            },
            {
                "id": "dissolution",
                "label": "Dissolution",
                "durationHours": purex.dissolutionTimeHours,
                "fractionDissolved": round(purex.fractionUraniumDissolved, 4),
                "uraniumDissolvedKg": round(purex.massUraniumDissolvedKg, 3),
                "uraniumUndissolvedHullKg": round(purex.massUraniumUndissolvedhullKg, 3),
                "nitricAcidConsumedMol": round(purex.molesNitricAcidConsumed, 1),
            },
            {
                "id": "extraction",
                "label": "Solvent Extraction",
                "uraniumToSolventKg": round(purex.massUraniumToSolventKg, 3),
                "uraniumLostToRaffinateKg": round(purex.massUraniumLostToRaffinateKg, 4),
                "fractionLeftInRaffinate": purex.fractionUraniumLeftInRaffinate,
            },
            {
                "id": "stripping",
                "label": "Stripping",
                "uraniumFinalProductSolutionKg": round(purex.massUraniumFinalProductSolutionKg, 3),
                "uraniumInventoryInSolventKg": round(purex.massUraniumInventoryInSolventKg, 5),
                "fractionLeftInSolvent": purex.fractionUraniumLeftInSolvent,
            },
            {
                "id": "conversion",
                "label": "Conversion to UO2",
                "massUO2PowderKg": round(purex.massUO2PowderKg, 3),
                "massUraniumInUO2Kg": round(purex.massUraniumInUO2Kg, 3),
                "massUraniumLostInConversionKg": round(purex.massUraniumLostInConversion, 4),
            },
            {
                "id": "pelletizing",
                "label": "Pelletizing",
                "singlePelletMassGrams": round(purex.singlePelletMassGrams, 3),
                "totalNumberOfPellets": purex.totalNumberOfPellets,
                "pelletDiameterCm": purex.pelletDiameterCm,
                "pelletHeightCm": purex.pelletHeightCm,
            },
        ],
        "massBalance": {
            "startingUraniumKg": round(purex.totalUraniumMassKG, 3),
            "uraniumInUO2Kg": round(purex.massUraniumInUO2Kg, 3),
            "uraniumUndissolvedHullKg": round(purex.massUraniumUndissolvedhullKg, 3),
            "uraniumLostToRaffinateKg": round(purex.massUraniumLostToRaffinateKg, 4),
            "uraniumInventoryInSolventKg": round(purex.massUraniumInventoryInSolventKg, 5),
            "uraniumLostInConversionKg": round(purex.massUraniumLostInConversion, 4),
            "totalCheckKg": round(purex.PUREXUraniumBalance, 3),
        },
        "fissionProducts": {key: round(value, 3) for key, value in purex.fp_masses_kg.items()},
        "metadata": {
            "massUnit": "kg",
            "timeUnit": "hours",
            "note": "Illustrative educational PUREX process values only, not real plant operating data.",
        },
    }


@app.get("/api/pyroprocessing")
def get_pyroprocessing_data():
    """Packages the pyroprocessing numbers already computed in
    pyroprocessing.py into the stage-by-stage shape the frontend's
    Pyroprocessing page expects. No new calculations happen here - this
    only reads values that module already computed at import time.
    """
    total_waste_kg = (
        pyro.massUraniumLeftOnHullsKg
        + pyro.massUraniumUnreducedKg
        + pyro.massUraniumLeftInAnodeBasketKg
        + pyro.massUraniumHeldInSaltInventoryKg
        + pyro.massUraniumLeftInCrucibleHeelKg
    )

    return {
        "input": {
            "heavyMetalMassStartingKG": pyro.heavyMetalMassStartingKG,
            "burnupGWDpMTHM": pyro.burnupGWDpMTHM,
        },
        "stages": [
            {
                "id": "chopVolox",
                "label": "Chopping & Voloxidation",
                "massUraniumPowderKg": round(pyro.massUraniumPowderKg, 3),
                "massUraniumLeftOnHullsKg": round(pyro.massUraniumLeftOnHullsKg, 4),
                "molesU3O8Powder": round(pyro.molesU3O8Powder, 1),
            },
            {
                "id": "oxideReduction",
                "label": "Electrolytic Oxide Reduction",
                "massUraniumMetalKg": round(pyro.massUraniumMetalKg, 3),
                "massUraniumUnreducedKg": round(pyro.massUraniumUnreducedKg, 4),
                "chargeNeededCoulombs": round(pyro.chargeNeededCoulombs, 0),
            },
            {
                "id": "electrorefining",
                "label": "Electrorefining",
                "massUraniumDissolvedAtAnodeKg": round(pyro.massUraniumDissolvedAtAnodeKg, 3),
                "massUraniumLeftInAnodeBasketKg": round(pyro.massUraniumLeftInAnodeBasketKg, 4),
                "massUraniumDepositedOnCathodeKg": round(pyro.massUraniumDepositedOnCathodeKg, 3),
                "massUraniumHeldInSaltInventoryKg": round(pyro.massUraniumHeldInSaltInventoryKg, 4),
            },
            {
                "id": "cathodeProcessing",
                "label": "Cathode Processing",
                "massUraniumIngotKg": round(pyro.massUraniumIngotKg, 3),
                "massUraniumLeftInCrucibleHeelKg": round(pyro.massUraniumLeftInCrucibleHeelKg, 4),
            },
            {
                "id": "coRecovery",
                "label": "U/TRU Co-Recovery",
                "status": "bypassed",
                "note": "Pu/TRU co-recovery is out of scope for this uranium-only demo; the ingot passes through unchanged.",
                "massUraniumKg": round(pyro.massUraniumIngotKg, 3),
            },
            {
                "id": "uZrCasting",
                "label": "U-Zr Fuel Casting",
                "zirconiumMassFraction": pyro.zirconiumMassFraction,
                "massZirconiumAddedKg": round(pyro.massZirconiumAddedKg, 3),
                "massFinalMetalFuelAlloyKg": round(pyro.massFinalMetalFuelAlloyKg, 3),
            },
            {
                "id": "wasteStreams",
                "label": "Waste Streams",
                "totalUraniumWasteKg": round(total_waste_kg, 4),
            },
        ],
        "massBalance": {
            "startingUraniumKg": round(pyro.totalUraniumMassKG, 3),
            "finalAlloyIngotKg": round(pyro.massFinalMetalFuelAlloyKg, 3),
            "hullsWasteKg": round(pyro.massUraniumLeftOnHullsKg, 4),
            "unreducedOxideWasteKg": round(pyro.massUraniumUnreducedKg, 4),
            "anodeBasketWasteKg": round(pyro.massUraniumLeftInAnodeBasketKg, 4),
            "saltInventoryKg": round(pyro.massUraniumHeldInSaltInventoryKg, 4),
            "crucibleHeelWasteKg": round(pyro.massUraniumLeftInCrucibleHeelKg, 4),
            "totalCheckKg": round(pyro.pyroUraniumBalance, 3),
            "pyroRecoveryPercentage": round(pyro.pyroprocessingUraniumRecoveryPercentage, 2),
            "purexRecoveryPercentage": round(pyro.PUREXUraniumRecoveryPercentage, 2),
        },
        "fissionProducts": {key: round(value, 3) for key, value in pyro.fp_masses_kg.items()},
        "metadata": {
            "massUnit": "kg",
            "note": "Illustrative educational pyroprocessing values only, not real plant operating data.",
        },
    }

SPA_ROUTES = ["/", "/cooling", "/purex", "/pyroprocessing"]


def serve_spa_index():
    return FileResponse(FRONTEND_INDEX)


for route in SPA_ROUTES:
    app.get(route, include_in_schema=False)(serve_spa_index)


app.mount("/frontend", StaticFiles(directory=os.path.join(BASE_DIR, "frontend"), html=True), name="frontend")
app.mount("/css", StaticFiles(directory=os.path.join(BASE_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(BASE_DIR, "js")), name="js")
