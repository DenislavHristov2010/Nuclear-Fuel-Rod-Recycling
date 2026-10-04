from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import math
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
heavyMetalMassStartingKG = 1000.0
burnupGWDpMTHM = 45.0 #brunup = termalna energiq izdadena ot kolichestvo metal ili neshto takova. Polzva se v
fissionProductYieldPerBurnup = 1.05e-3
claddingMassF = 0.22
molarMassUranium = 238.03

fissionProductMassFraction = fissionProductYieldPerBurnup * burnupGWDpMTHM
uraniumMassFraction = 1-fissionProductMassFraction

totalFissionProductMassKG = fissionProductMassFraction * heavyMetalMassStartingKG
totalUraniumMassKG = uraniumMassFraction * heavyMetalMassStartingKG
molesUranium = 1000.0 * totalUraniumMassKG / molarMassUranium
totalCladdingMassKG = claddingMassF * heavyMetalMassStartingKG
fissionProductGroupFractions = {
    'G1_volatiles': 0.15,
    'G2_alkali_metals': 0.10,
    'G3_alkaline_earths': 0.07,
    'G4_lanthanides': 0.34,
    'G5_zirconium': 0.10,
    'G6_molybdenum': 0.12,
    'G7_noble_metals': 0.12
}
fp_masses_kg = {group: fraction * totalFissionProductMassKG for group, fraction in fissionProductGroupFractions.items()}

shearingThroughputKgPerDay = 200.0
shearingTimeHours = heavyMetalMassStartingKG / shearingThroughputKgPerDay
dissolutionRateConstant = 1.7
dissolutionTimeHours = 4
shareUraniumInterractingR1Formula = 0.5 #tova opredelq kolko uran pravi NO i kolko pravi NO2. R1 e NO

fractionUraniumDissolved = 1.0 - math.exp(-dissolutionRateConstant * dissolutionTimeHours)
molesUraniumDissolved = fractionUraniumDissolved * molesUranium
massUraniumDissolvedKg = molesUraniumDissolved * molarMassUranium/1000.0
massUraniumUndissolvedhullKg = totalUraniumMassKG - massUraniumDissolvedKg
molesNitricAcidConsumed = molesUraniumDissolved * (shareUraniumInterractingR1Formula * (8/3) + (1- shareUraniumInterractingR1Formula) * 4)

organicToAqueousFlowRatio = 3.0
effectiveUraniumDistributionRatio = 1.5
effectiveExtractionStages = 4
stripAqueousToOrganicRatio = 0.8
stripUraniumDistributionRatio = 0.02

extractionFactor = effectiveUraniumDistributionRatio * organicToAqueousFlowRatio
if extractionFactor == 1.0:
    fractionUraniumLeftInRaffinate = 1.0 / (effectiveExtractionStages + 1)
else:
    fractionUraniumLeftInRaffinate = (extractionFactor - 1.0) / (extractionFactor**(effectiveExtractionStages + 1) - 1.0)

massUraniumToSolventKg = (1.0-fractionUraniumLeftInRaffinate) * massUraniumDissolvedKg
massUraniumLostToRaffinateKg = fractionUraniumLeftInRaffinate * massUraniumDissolvedKg

strippingFactor = stripAqueousToOrganicRatio / stripUraniumDistributionRatio
if strippingFactor == 1.0:
    fractionUraniumLeftInSolvent = 1.0 / (effectiveExtractionStages + 1)
else:
    fractionUraniumLeftInSolvent = (strippingFactor - 1.0) / (strippingFactor**(effectiveExtractionStages + 1) -1.0)
massUraniumFinalProductSolutionKg = (1.0 - fractionUraniumLeftInSolvent) * massUraniumToSolventKg
massUraniumInventoryInSolventKg = fractionUraniumLeftInSolvent * massUraniumToSolventKg

denitrationYield = 0.998
reducuctionYield = 0.998
molarMassUraniumdioxide = 270.03
theoreticalDensityUO2 = 10.96 #g/cm^3
sinteredDensityFracction = 0.95
pelletDiameterCm = 0.82
pelletHeightCm = 1.35
fabricationLoss = 0.002

molesUraniumProduct = 1000 * massUraniumFinalProductSolutionKg / molarMassUranium
molesUO3Powder = denitrationYield * molesUraniumProduct
molesUO2Powder = reducuctionYield * molesUO3Powder
massUO2PowderKg = molesUO2Powder * molarMassUraniumdioxide /1000.0
massUraniumInUO2Kg = molesUO2Powder * molarMassUranium /1000.0
massUraniumLostInConversion = (molesUraniumProduct - molesUO2Powder) * molarMassUranium / 1000.0

sinteredDensityGramPerCm3 = sinteredDensityFracction * theoreticalDensityUO2
pelletVolumeCm3 = math.pi * (pelletDiameterCm / 2)**2 * pelletHeightCm
singlePelletMassGrams = sinteredDensityGramPerCm3 * pelletVolumeCm3

totalNumberOfPellets = math.floor(1000.0 * massUO2PowderKg * (1.0 - fabricationLoss) / singlePelletMassGrams)
PUREXUraniumBalance = massUraniumInUO2Kg + massUraniumUndissolvedhullKg + massUraniumLostToRaffinateKg + massUraniumInventoryInSolventKg + massUraniumLostInConversion

@app.get('/menu')
def Saliitations():
    return 'zdrasti'
