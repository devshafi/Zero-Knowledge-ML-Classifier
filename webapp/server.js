const express = require("express");
const path = require("path");
const fs = require("fs");
const snarkjs = require("snarkjs");

// BN128 prime — values >= PRIME/2 represent negative numbers in the field
const PRIME = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
const HALF_PRIME = PRIME / 2n;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ZK_DIR = path.join(__dirname, "../zk");
const WASM_PATH = path.join(ZK_DIR, "build/classifier_js/classifier.wasm");
const ZKEY_PATH = path.join(ZK_DIR, "keys/classifier_final.zkey");
const VKEY_PATH = path.join(ZK_DIR, "keys/verification_key.json");
const INPUT_PATH = path.join(ZK_DIR, "inputs/input.json");

// POST /api/prove
// Body: { tamper: false }  — if tamper=true, flips the label to simulate dishonest prover
app.post("/api/prove", async (req, res) => {
  try {
    const input = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));

    // Tampered mode: flip label (dishonest prover)
    if (req.body && req.body.tamper) {
      input.label = input.label === "1" ? "0" : "1";
    }

    const vKey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

    const startProve = Date.now();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      WASM_PATH,
      ZKEY_PATH
    );
    const proveTime = Date.now() - startProve;

    const startVerify = Date.now();
    const proofValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    const verifyTime = Date.now() - startVerify;

    // publicSignals[0] is the circuit output `out` (the score = dot(weights,x)+bias)
    // If score >= PRIME/2, it's a negative field element → score < 0 → expected label = 0
    // If score < PRIME/2, it's positive → score > 0 → expected label = 1
    const score = BigInt(publicSignals[0]);
    const scoreIsPositive = score < HALF_PRIME;
    const expectedLabel = scoreIsPositive ? "1" : "0";
    const labelMatchesScore = input.label === expectedLabel;

    // Both the proof must be valid AND the label must match the computed score
    const isValid = proofValid && labelMatchesScore;

    res.json({
      ok: true,
      valid: isValid,
      proofValid,
      labelMatchesScore,
      proof,
      publicSignals,
      label: input.label,
      tampered: !!(req.body && req.body.tamper),
      timing: {
        proveMs: proveTime,
        verifyMs: verifyTime,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`ZK Demo server running at http://localhost:${PORT}`);
});
