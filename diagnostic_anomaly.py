"""
Diagnostic Script — Analisis Distribusi Anomaly Score
=======================================================
Tujuan:
  1. Lihat distribusi training score (dari notebook Tahap 6)
  2. Compare dengan production score (dari production inference)
  3. Cari threshold yang lebih cocok untuk production

Cara pakai:
  cd C:\\Users\\USER\\cassava-pred-main
  python diagnostic_anomaly.py
"""

import json
import joblib
import numpy as np
import pandas as pd
from pathlib import Path

# ────────────────────────────────────────────────────────────────
# CONFIG
# ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent

# Sesuaikan path ke notebook outputs Anda
CASSAVA_PBL = Path("C:/Users/USER/Cassava_PBL/outputs")
PROD_MODELS = ROOT / "fastapi_app" / "models"

print("=" * 65)
print("🔬 DIAGNOSTIC: Anomaly Score Distribution Analysis")
print("=" * 65)

# ────────────────────────────────────────────────────────────────
# 1. Load training scores (dari notebook Tahap 6)
# ────────────────────────────────────────────────────────────────
print("\n[1/4] Loading training anomaly scores...")

training_csv = CASSAVA_PBL / "tahap6_output" / "tahap6_anomaly_scores.csv"
if not training_csv.exists():
    print(f"   ❌ File tidak ditemukan: {training_csv}")
    print("   Pastikan notebook Tahap 6 sudah dijalankan sampai akhir.")
    exit(1)

df_train = pd.read_csv(training_csv)
print(f"   ✓ Loaded {len(df_train):,} rows")
print(f"   ✓ Columns: {list(df_train.columns)}")

# ────────────────────────────────────────────────────────────────
# 2. Distribusi training scores
# ────────────────────────────────────────────────────────────────
print("\n[2/4] Training Score Distribution:")

# Cari kolom yang relevan
score_col = None
for candidate in ["anomaly_score", "score", "iforest_score", "is_anomaly_score"]:
    if candidate in df_train.columns:
        score_col = candidate
        break

if score_col is None:
    print(f"   ❌ Tidak menemukan kolom anomaly score di CSV")
    print(f"   Available columns: {list(df_train.columns)}")
    exit(1)

# Convert score ke -score_samples convention (lebih tinggi = lebih anomalous)
scores = df_train[score_col]
print(f"\n   Using column: '{score_col}'")
print(f"   • Min:    {scores.min():.4f}")
print(f"   • Max:    {scores.max():.4f}")
print(f"   • Mean:   {scores.mean():.4f}")
print(f"   • Median: {scores.median():.4f}")
print(f"   • Std:    {scores.std():.4f}")

print(f"\n   Percentiles:")
for p in [50, 75, 90, 95, 99]:
    val = scores.quantile(p / 100)
    print(f"     P{p:2d}: {val:.4f}")

# Threshold saat ini di production
CURRENT_THRESHOLD = 0.5060
above_current = (scores >= CURRENT_THRESHOLD).sum()
print(f"\n   Saat threshold = {CURRENT_THRESHOLD}:")
print(f"     • {above_current:,} / {len(scores):,} samples flagged ({above_current/len(scores)*100:.1f}%)")

# ────────────────────────────────────────────────────────────────
# 3. Simulasi production inference
# ────────────────────────────────────────────────────────────────
print("\n[3/4] Simulating production inference...")

try:
    iforest = joblib.load(PROD_MODELS / "tahap6_iforest_model.pkl")
    preprocess = joblib.load(PROD_MODELS / "tahap6_scaler.pkl")
    imputer = preprocess["imputer"]
    scaler = preprocess["scaler"]

    n_features = scaler.n_features_in_
    print(f"   ✓ Model loaded, expects {n_features} features")

    # Simulasi production input — sensor reading + nlp defaults -1
    fake_features = np.array([
        # 8 sensor (range normal)
        72.5, 0.5, 105.0, 2500, 75.0, 70.0, 55.0, 1000.0,
        # 25 rolling (sebagian besar 0 atau sama dengan sensor)
        *([72.5, 0.0, 72.5, 72.5, 0.0, 0.5, 0.0, 105.0, 105.0,
           2500, 0.0, 2500, 2500, 75.0, 0.0, 75.0, 75.0, 0.0, 70.0, 70.0,
           55.0, 0.0, 55.0, 55.0, 0.0]),
        # 8 delta (0)
        *([0.0] * 8),
        # 24 lag (sama dengan sensor)
        *([72.5] * 6), *([0.5] * 6), *([105.0] * 6), *([2500] * 6),
        # 4 interaksi
        262500, 7612.5, 0.03, 0.0,
        # 6 time features
        14, 1, 1, 1, 0, 0,
        # 8 NLP DEFAULT = -1
        -1, -1, -1, -1, -1, -1, -1, -1,
    ])

    print(f"   Simulated input: {len(fake_features)} features")

    # Pad ke n_features
    if len(fake_features) < n_features:
        pad = np.zeros(n_features - len(fake_features))
        fake_features = np.concatenate([fake_features, pad])
    elif len(fake_features) > n_features:
        fake_features = fake_features[:n_features]

    X = fake_features.reshape(1, -1)
    X = imputer.transform(X)
    X = scaler.transform(X)

    sim_score = float(-iforest.score_samples(X)[0])
    print(f"\n   📊 Simulated production score: {sim_score:.4f}")

    # Test dengan NLP defaults = 0 (bukan -1)
    fake_features_v2 = fake_features.copy()
    if len(fake_features_v2) >= 84:
        fake_features_v2[-8:] = [2, 1, 0, 0, 5, 2, 3, 30]  # realistic defaults

    X2 = fake_features_v2.reshape(1, -1)
    X2 = imputer.transform(X2)
    X2 = scaler.transform(X2)
    sim_score_v2 = float(-iforest.score_samples(X2)[0])
    print(f"   📊 With realistic NLP defaults: {sim_score_v2:.4f}")

    print(f"\n   💡 Difference: {abs(sim_score - sim_score_v2):.4f}")
    if abs(sim_score - sim_score_v2) > 0.05:
        print("      ⚠️ NLP defaults SIGNIFICANTLY affect anomaly score!")

except Exception as e:
    print(f"   ❌ Error: {e}")

# ────────────────────────────────────────────────────────────────
# 4. Rekomendasi threshold baru
# ────────────────────────────────────────────────────────────────
print("\n[4/4] Threshold Recommendations:")

print(f"\n   Untuk mendapatkan target false positive rate:")
for target_pct in [5, 10, 20, 30]:
    threshold = scores.quantile(1 - target_pct / 100)
    print(f"     {target_pct}% flagged → threshold = {threshold:.4f}")

print(f"\n   Production saat ini menampilkan ~100% mesin anomali.")
print(f"   Untuk target REALISTIS (5-10% anomaly rate):")
p90 = scores.quantile(0.90)
p95 = scores.quantile(0.95)
print(f"     Conservative (5% flagged):  use threshold = {p95:.4f}")
print(f"     Balanced (10% flagged):     use threshold = {p90:.4f}")

print(f"\n   ⚠️ NAMUN: production score ~0.6 lebih tinggi dari training")
print(f"   distribution. Threshold baru harus disesuaikan dengan PRODUCTION,")
print(f"   bukan training. Saran:")
print(f"     • Mulai dengan threshold = 0.65 atau 0.70")
print(f"     • Monitor false positive rate selama 1 minggu")
print(f"     • Tune lebih lanjut berdasarkan data riil")

print("\n" + "=" * 65)
print("✅ Diagnostic complete!")
print("=" * 65)
