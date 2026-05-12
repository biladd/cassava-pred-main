"""
Script untuk generate file .pkl model
Jalankan dari folder cassava-pred-main:
  python generate_models.py
"""

import pandas as pd
import numpy as np
import joblib, json, warnings, os, time
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (recall_score, precision_score, f1_score,
    roc_auc_score, average_precision_score, accuracy_score, classification_report)
from imblearn.over_sampling import SMOTE
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
from Sastrawi.StopWordRemover.StopWordRemoverFactory import StopWordRemoverFactory
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import LatentDirichletAllocation
import re

warnings.filterwarnings('ignore')

# ── Path config ──
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = BASE_DIR  # sensor_readings.csv & maintenance_logs.csv di root project
MODEL_DIR  = os.path.join(BASE_DIR, 'fastapi_app', 'models')
os.makedirs(MODEL_DIR, exist_ok=True)

print("="*60)
print("GENERATE MODEL .PKL UNTUK FASTAPI")
print("="*60)

# ── Load data ──
print("\n[1/6] Load dataset...")
sensor = pd.read_csv(os.path.join(DATA_DIR, 'sensor_readings.csv'), parse_dates=['timestamp'])
maint  = pd.read_csv(os.path.join(DATA_DIR, 'maintenance_logs.csv'), parse_dates=['date'])
print(f"  sensor: {sensor.shape} | maint: {maint.shape}")

# Fix vibration negatif
sensor.loc[sensor['vibration'] < 0, 'vibration'] = 0.0
sensor = sensor.sort_values(['machine_id','timestamp']).reset_index(drop=True)

SENSOR_COLS = ['temperature','vibration','pressure','rpm',
               'power_consumption','noise_level','humidity','operating_hours']

# ── NLP Pipeline ──
print("\n[2/6] NLP pipeline...")
SLANG_DICT = {
    'gak':'tidak','udh':'sudah','udah':'sudah','sdh':'sudah','krn':'karena',
    'dgn':'dengan','utk':'untuk','yg':'yang','tdk':'tidak','blm':'belum',
    'hrs':'harus','bs':'bisa','dpt':'dapat','pd':'pada','dr':'dari',
}
PROBLEM_KW  = ['rusak','aus','bocor','overheat','putus','patah','longgar',
               'kotor','tersumbat','korosi','retak','error','noise','getaran','gagal']
ACTION_KW   = ['ganti','perbaiki','kalibrasi','bersihkan','lubrikasi','cek',
               'periksa','pasang','replace','repair','clean','service','overhaul']
URGENT_KW   = ['emergency','urgent','darurat','kritis','segera','bahaya','critical']
TECH_KW     = ['bearing','belt','seal','filter','valve','pump','motor','sensor',
               'relay','coupling','shaft','gear','compressor','hydraulic']

stemmer    = StemmerFactory().create_stemmer()
ALL_SW     = set(StopWordRemoverFactory().get_stop_words()) | {
    'dan','atau','yang','dengan','untuk','pada','dari','ke','di','ini','itu',
    'sudah','akan','bisa','adalah','ada','tidak','juga','test'
}

def preprocess(text):
    text = str(text).lower()
    text = re.sub(r'[^a-z\s]', ' ', text)
    tokens = [SLANG_DICT.get(t, t) for t in text.split()]
    tokens = [t for t in tokens if t not in ALL_SW and len(t) > 2]
    return ' '.join([stemmer.stem(t) for t in tokens])

def count_kw(text, kws):
    tl = str(text).lower()
    return sum(1 for k in kws if k in tl)

maint['processed_text']        = maint['technician_notes'].apply(preprocess)
maint['severity_score']        = maint['maintenance_type'].map({'Preventive':1,'Corrective':2,'Emergency':3})
maint['severity_score']       += maint['technician_notes'].apply(lambda x: min(count_kw(x, PROBLEM_KW), 3))
maint['problem_keyword_count'] = maint['technician_notes'].apply(lambda x: count_kw(x, PROBLEM_KW))
maint['action_keyword_count']  = maint['technician_notes'].apply(lambda x: count_kw(x, ACTION_KW))
maint['technical_term_count']  = maint['technician_notes'].apply(lambda x: count_kw(x, TECH_KW))
maint['has_urgent_flag']       = maint['technician_notes'].apply(
    lambda x: int(any(k in str(x).lower() for k in URGENT_KW)))

tfidf   = TfidfVectorizer(max_features=50, min_df=2, ngram_range=(1,2))
tmat    = tfidf.fit_transform(maint['processed_text'])
lda     = LatentDirichletAllocation(n_components=5, random_state=42, max_iter=20)
lda_out = lda.fit_transform(tmat)
maint['dominant_topic'] = lda_out.argmax(axis=1)
print("  NLP selesai")

# ── Feature Engineering ──
print("\n[3/6] Feature engineering...")
df     = sensor.copy()
WINDOW = 24

for col in SENSOR_COLS:
    for stat in ['mean','std','max','min']:
        df[f'{col}_roll_{stat}_{WINDOW}h'] = df.groupby('machine_id')[col].transform(
            lambda x: x.rolling(window=WINDOW, min_periods=1).agg(stat))
    df[f'{col}_delta'] = df.groupby('machine_id')[col].transform(lambda x: x.diff().fillna(0))

for col in ['temperature','vibration','pressure','rpm']:
    for lag in [1,2,3,6,12,24]:
        df[f'{col}_lag_{lag}h'] = df.groupby('machine_id')[col].transform(
            lambda x, l=lag: x.shift(l).bfill())

df['cum_operating_hours']       = df.groupby('machine_id')['operating_hours'].transform('cumsum')
df['cum_vibration_degradation'] = df.groupby('machine_id')['vibration'].transform(
    lambda x: (x - x.quantile(0.25)).clip(lower=0).cumsum())
df['cum_power_consumption']     = df.groupby('machine_id')['power_consumption'].transform('cumsum')

df['temp_x_vibration']  = df['temperature'] * df['vibration']
df['pressure_x_rpm']    = df['pressure']    * df['rpm']
df['temp_x_pressure']   = df['temperature'] * df['pressure']
df['vibration_x_noise'] = df['vibration']   * df['noise_level']
df['power_per_rpm']     = df['power_consumption'] / (df['rpm'] + 1)

def batch_fft(series, window=24):
    vals = series.values; n = len(vals)
    dom = np.zeros(n); eng = np.zeros(n)
    for i in range(n):
        seg = vals[max(0,i-window+1):i+1]
        if len(seg) < 4: continue
        fv = np.abs(np.fft.rfft(seg)); fr = np.fft.rfftfreq(len(seg))
        dom[i] = fr[np.argmax(fv[1:])+1] if len(fv)>1 else 0
        eng[i] = np.sum(fv**2)
    return dom, eng

dom_list, eng_list = [], []
for mid, grp in df.groupby('machine_id', sort=False):
    d, e = batch_fft(grp['vibration'])
    dom_list.append(pd.Series(d, index=grp.index))
    eng_list.append(pd.Series(e, index=grp.index))
df['fft_vib_dominant_freq'] = pd.concat(dom_list).sort_index()
df['fft_vib_energy']        = pd.concat(eng_list).sort_index()

df['hour_of_day']  = df['timestamp'].dt.hour
df['day_of_week']  = df['timestamp'].dt.dayofweek
df['day_of_month'] = df['timestamp'].dt.day
df['month']        = df['timestamp'].dt.month
df['is_weekend']   = (df['timestamp'].dt.dayofweek >= 5).astype(int)
df['is_night']     = ((df['timestamp'].dt.hour >= 22) | (df['timestamp'].dt.hour <= 5)).astype(int)

# NLP merge
NLP_FEAT_COLS = ['last_maintenance_type','last_maintenance_severity_score',
                 'last_problem_category','last_has_urgent_flag',
                 'last_technical_term_count','last_problem_keyword_count','last_action_keyword_count']
from sklearn.preprocessing import LabelEncoder
le = LabelEncoder()
nlp_merge = maint.rename(columns={
    'maintenance_type':'last_maintenance_type','severity_score':'last_maintenance_severity_score',
    'dominant_topic':'last_problem_category','has_urgent_flag':'last_has_urgent_flag',
    'technical_term_count':'last_technical_term_count','problem_keyword_count':'last_problem_keyword_count',
    'action_keyword_count':'last_action_keyword_count'}).copy()
nlp_merge['last_maintenance_type'] = le.fit_transform(nlp_merge['last_maintenance_type'].astype(str))
nlp_merge = nlp_merge.sort_values(['machine_id','date']).reset_index(drop=True)
nlp_merge['timestamp'] = nlp_merge['date']

merged_parts = []
for mid in df['machine_id'].unique():
    sm = df[df['machine_id']==mid].copy().sort_values('timestamp')
    nm = nlp_merge[nlp_merge['machine_id']==mid].copy().sort_values('timestamp')
    merged = pd.merge_asof(sm, nm[['timestamp']+NLP_FEAT_COLS], on='timestamp', direction='backward')
    merged_parts.append(merged)
df = pd.concat(merged_parts, ignore_index=True).sort_values(['machine_id','timestamp']).reset_index(drop=True)

maint_sorted = maint.sort_values(['machine_id','date'])
dsm_parts = []
for mid in df['machine_id'].unique():
    sm = df[df['machine_id']==mid].copy()
    md = maint_sorted[maint_sorted['machine_id']==mid]['date'].values
    days = [(ts - pd.Timestamp(md[md <= np.datetime64(ts)][-1])).days
            if len(md[md <= np.datetime64(ts)]) > 0 else np.nan
            for ts in sm['timestamp']]
    sm['days_since_last_maintenance'] = days
    dsm_parts.append(sm)
df = pd.concat(dsm_parts, ignore_index=True).sort_values(['machine_id','timestamp']).reset_index(drop=True)

for col in NLP_FEAT_COLS + ['days_since_last_maintenance']:
    df[col] = df.groupby('machine_id')[col].transform(lambda x: x.ffill()).fillna(-1)

# Target variables
df['will_fail_within_7days'] = 0
PRED_WIN = pd.Timedelta(days=7)
for mid, grp in df.groupby('machine_id'):
    for ft in grp.loc[grp['failure']==1, 'timestamp']:
        mask = ((df['machine_id']==mid) &
                (df['timestamp'] >= ft - PRED_WIN) &
                (df['timestamp'] <= ft))
        df.loc[mask, 'will_fail_within_7days'] = 1

df['health_status'] = df.apply(lambda r: 2 if (r['temperature']>=90 or r['vibration']>=1.2 or
    r['pressure']>=112 or r['failure']==1) else (1 if (r['temperature']>=80 or
    r['vibration']>=0.8 or r['pressure']>=108) else 0), axis=1)

TARGET_COLS = ['will_fail_within_7days','health_status','failure']
ID_COLS     = ['timestamp','machine_id']
FEAT_COLS   = [c for c in df.columns if c not in TARGET_COLS+ID_COLS+['remaining_useful_life']]
num_feats   = df[FEAT_COLS].select_dtypes(include=[np.number]).columns.tolist()

for col in SENSOR_COLS:
    q01, q99 = df[col].quantile(0.01), df[col].quantile(0.99)
    df[col]  = df[col].clip(lower=q01, upper=q99)

var      = df[num_feats].var()
zero_var = var[var==0].index.tolist()
df       = df.drop(columns=zero_var)
num_feats = [c for c in num_feats if c not in zero_var]

corr_m   = df[num_feats].corr().abs()
upper    = corr_m.where(np.triu(np.ones(corr_m.shape), k=1).astype(bool))
high_cor = [c for c in upper.columns if any(upper[c]>0.95)]
df       = df.drop(columns=high_cor, errors='ignore')
num_feats = [c for c in num_feats if c not in high_cor]

X_full  = df[num_feats].fillna(df[num_feats].median())
y_taskA = df['will_fail_within_7days']
y_taskB = df['health_status']

print(f"  Features: {len(num_feats)} | TaskA pos: {y_taskA.mean()*100:.2f}%")

# ── Training ──
print("\n[4/6] Training model...")
n          = len(X_full)
test_start = int(n*0.8)
val_start  = int(test_start*0.9)

X_train = X_full.iloc[:val_start];  X_test = X_full.iloc[test_start:]
yA_train= y_taskA.iloc[:val_start]; yA_test= y_taskA.iloc[test_start:]
yB_train= y_taskB.iloc[:val_start]; yB_test= y_taskB.iloc[test_start:]

scaler    = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s  = scaler.transform(X_test)

RF = dict(n_estimators=100, max_depth=15, min_samples_split=10,
          min_samples_leaf=4, max_features='sqrt', random_state=42, n_jobs=-1)

# Task A
print("  Task A — training...")
smote   = SMOTE(random_state=42, k_neighbors=5)
Xsm, ysm = smote.fit_resample(X_train_s, yA_train)
t0      = time.time()
model_A = RandomForestClassifier(**RF, class_weight='balanced')
model_A.fit(Xsm, ysm)
proba_A = model_A.predict_proba(X_test_s)[:,1]
pred_A  = model_A.predict(X_test_s)
print(f"  Task A selesai ({time.time()-t0:.1f}s) | AUC={roc_auc_score(yA_test,proba_A):.4f} F1={f1_score(yA_test,pred_A,zero_division=0):.4f}")

# Threshold tuning
th_results = [{'th':th,
    'rec':recall_score(yA_test,(proba_A>=th).astype(int),zero_division=0),
    'prec':precision_score(yA_test,(proba_A>=th).astype(int),zero_division=0),
    'f1':f1_score(yA_test,(proba_A>=th).astype(int),zero_division=0)}
    for th in np.arange(0.05,0.90,0.01)]
th_df   = pd.DataFrame(th_results)
cand    = th_df[th_df['rec']>=0.80]
best_th = float(cand.loc[cand['prec'].idxmax(),'th']) if not cand.empty else float(th_df.loc[th_df['f1'].idxmax(),'th'])

# Task B
print("  Task B — training...")
smote_B  = SMOTE(random_state=42, k_neighbors=3)
XsmB, ysmB = smote_B.fit_resample(X_train_s, yB_train)
t0       = time.time()
model_B  = RandomForestClassifier(**RF, class_weight='balanced')
model_B.fit(XsmB, ysmB)
pred_B   = model_B.predict(X_test_s)
print(f"  Task B selesai ({time.time()-t0:.1f}s) | Acc={accuracy_score(yB_test,pred_B):.4f} Macro-F1={f1_score(yB_test,pred_B,average='macro',zero_division=0):.4f}")

# ── Save ──
print("\n[5/6] Menyimpan file .pkl...")
joblib.dump(model_A, os.path.join(MODEL_DIR, 'final_model_taskA.pkl'))
joblib.dump(model_B, os.path.join(MODEL_DIR, 'final_model_taskB.pkl'))
joblib.dump(scaler,  os.path.join(MODEL_DIR, 'scaler.pkl'))

metadata = {
    'task_A': {
        'model'             : 'RF_SMOTE_CW',
        'roc_auc'           : float(roc_auc_score(yA_test, proba_A)),
        'pr_auc'            : float(average_precision_score(yA_test, proba_A)),
        'threshold_default' : 0.20,
        'threshold_recall80': best_th,
    },
    'task_B': {
        'model'    : 'RF_SMOTE_CW',
        'macro_f1' : float(f1_score(yB_test, pred_B, average='macro', zero_division=0)),
        'labels'   : {'0':'Healthy','1':'Warning','2':'Critical'},
    },
    'features' : num_feats,
    'n_features': len(num_feats),
}
with open(os.path.join(MODEL_DIR, 'final_metadata.json'), 'w') as f:
    json.dump(metadata, f, indent=2)

print("\n[6/6] File tersimpan di fastapi_app/models/:")
for fname in sorted(os.listdir(MODEL_DIR)):
    size = os.path.getsize(os.path.join(MODEL_DIR, fname))
    print(f"  ✅ {fname:<35} {size/1024/1024:.1f} MB")

print("\n" + "="*60)
print("SELESAI! Sekarang jalankan FastAPI:")
print("  cd fastapi_app")
print("  python -m uvicorn main:app --reload --port 8000")
print("="*60)
