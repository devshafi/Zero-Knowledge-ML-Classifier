# Zero-Knowledge Enforcement of Classification Integrity in Distributed AI Systems

A proof-of-concept that uses **zkSNARK (Groth16)** to prove that a Logistic Regression model correctly classified network traffic — without revealing the private input data.

## What It Does

In a distributed AI system, multiple nodes classify network traffic as **Attack** or **Benign**. This project allows a node to:

1. Run a Logistic Regression classifier on private network traffic data
2. Generate a **Zero-Knowledge proof** that the classification was done honestly
3. Allow any verifier to confirm the result is correct — **without ever seeing the private data**

## Project Structure

```
├── dataset/                    # Network traffic dataset (KDD-based, binary classification)
├── models/                     # Saved model files (generated after training)
├── eda.ipynb                   # Exploratory data analysis
├── training.ipynb              # Random Forest training (baseline)
├── lr_training.ipynb           # Logistic Regression training (used for ZK)
├── zk/
│   ├── circuits/
│   │   └── classifier.circom   # Arithmetic circuit for LR classification
│   ├── inputs/
│   │   └── input.json          # Quantized circuit inputs (generated)
│   ├── build/                  # Compiled circuit (generated)
│   ├── keys/                   # ZK proving & verification keys (generated)
│   ├── proofs/                 # Generated proofs (generated)
│   └── generate_input.py       # Converts model weights to field elements
└── webapp/
    ├── server.js               # Express server — proof generation & verification API
    └── public/
        └── index.html          # Demo UI (Prover vs Verifier)
```

## Tech Stack

- **ML**: Python, scikit-learn (Logistic Regression)
- **ZK Circuit**: Circom 2.2.3
- **ZK Proof System**: Groth16 on BN128 curve via snarkjs
- **Web Demo**: Node.js + Express

---

## How to Run

### Prerequisites

- Python 3.12
- Node.js 24
- Circom 2.2.3 ([install guide](https://docs.circom.io/getting-started/installation/))

### Step 1 — Install Python dependencies

```bash
pip install scikit-learn pandas numpy joblib
```

### Step 2 — Train the Logistic Regression model

Open and run all cells in `lr_training.ipynb`.

This saves the following to `models/`:
- `lr_model.pkl`
- `lr_scaler.pkl`
- `label_encoders.pkl`
- `lr_circuit_params.json`

### Step 3 — Generate circuit inputs

```bash
cd zk
python generate_input.py
```

This creates `zk/inputs/input.json` with quantized field elements.

### Step 4 — Compile the circuit

```bash
cd zk
circom circuits/classifier.circom --r1cs --wasm --sym --output build/
```

### Step 5 — Trusted setup (Powers of Tau)

```bash
cd zk
npx snarkjs powersoftau new bn128 10 keys/pot10_0000.ptau -v
npx snarkjs powersoftau contribute keys/pot10_0000.ptau keys/pot10_0001.ptau --name="First contribution" -v -e="random entropy"
npx snarkjs powersoftau prepare phase2 keys/pot10_0001.ptau keys/pot10_final.ptau -v
```

### Step 6 — Generate proving & verification keys

```bash
npx snarkjs groth16 setup build/classifier.r1cs keys/pot10_final.ptau keys/classifier_0000.zkey
npx snarkjs zkey contribute keys/classifier_0000.zkey keys/classifier_final.zkey --name="Final" -e="entropy"
npx snarkjs zkey export verificationkey keys/classifier_final.zkey keys/verification_key.json
```

### Step 7 — Generate and verify a proof (CLI)

```bash
node build/classifier_js/generate_witness.js build/classifier_js/classifier.wasm inputs/input.json build/witness.wtns
npx snarkjs groth16 prove keys/classifier_final.zkey build/witness.wtns proofs/proof.json proofs/public.json
npx snarkjs groth16 verify keys/verification_key.json proofs/public.json proofs/proof.json
```

Expected output: `[INFO] snarkJS: OK!`

### Step 8 — Run the web demo

```bash
cd webapp
npm install
node server.js
```

Open **http://localhost:3001** in your browser.

- **Honest Prover** — generates a valid proof, verifier accepts ✅
- **Dishonest Prover** — flips the label, verifier rejects ❌

---

## Demo Screenshot

![Web App Demo](files/webapp-demo.png)

---

## Circuit Stats

| Metric | Value |
|--------|-------|
| Features | 46 |
| Non-linear constraints | 48 |
| Linear constraints | 46 |
| Wires | 188 |
| Proof size | ~800 bytes |
| Proof time | ~40ms |
| Verify time | ~6ms |

