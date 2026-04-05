import json
import numpy as np
import joblib
import sys

# ── configuration ──────────────────────────────────────────
SCALE = 10**6          # fixed-point scaling factor
PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617  # BN128

# ── load saved model artifacts ─────────────────────────────
lr_model  = joblib.load('../models/lr_model.pkl')
scaler    = joblib.load('../models/lr_scaler.pkl')
le_dict   = joblib.load('../models/label_encoders.pkl')

with open('../models/lr_circuit_params.json') as f:
    params = json.load(f)

# ── quantize weights and bias to integers ──────────────────
weights_int = [int(round(w * SCALE)) for w in params['weights']]
bias_int    = int(round(params['bias'] * SCALE))

# ── load a sample input (first row of test data) ───────────
import pandas as pd
from sklearn.preprocessing import LabelEncoder

df = pd.read_csv('../dataset/0.01percent_2classes.csv')
X  = df.drop('benign', axis=1)

# encode categoricals
X_encoded = X.copy()
for col, le in le_dict.items():
    X_encoded[col] = le.transform(X[col])

# scale
X_scaled = scaler.transform(X_encoded)

# pick first sample
sample      = X_scaled[0]
sample_int  = [int(round(x * SCALE)) for x in sample]

# convert negatives to field elements (mod prime)
def to_field(v):
    return v % PRIME

weights_field = [to_field(w) for w in weights_int]
bias_field    = to_field(bias_int)
sample_field  = [to_field(x) for x in sample_int]

# ── compute expected score and decision ────────────────────
score = sum(w * x for w, x in zip(weights_int, sample_int)) + bias_int * SCALE
label = 1 if score > 0 else 0

print(f"Sample label (float model): {lr_model.predict(X_scaled[[0]])[0]}")
print(f"Sample label (int circuit): {label}")
print(f"Score (pre-scaled):         {score}")

# ── write circuit input JSON ───────────────────────────────
circuit_input = {
    "x":       [str(v) for v in sample_field],
    "weights": [str(v) for v in weights_field],
    "bias":    str(bias_field),
    "label":   str(label)
}

with open('inputs/input.json', 'w') as f:
    json.dump(circuit_input, f, indent=2)

print(f"\n✓ input.json written to zk/inputs/input.json")
print(f"  Features:  {len(sample_field)}")
print(f"  Scale:     {SCALE} (1e6 fixed-point)")