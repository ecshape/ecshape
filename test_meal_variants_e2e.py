"""
End-to-end checks for the meal variants feature, driving the endpoint functions directly
(the project intentionally has no httpx/pytest, so this avoids TestClient).

    DATABASE_URL="sqlite:////tmp/mv_e2e.db" python test_meal_variants_e2e.py

Seeds a trainer, a client, a meal bank and a 3-slot plan, then exercises targets,
favorites, generation (fallback composer - no API key needed), and variant selection.
"""

import os, sys, logging
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
logging.disable(logging.INFO)
from app.main import app
from app.database import get_db, SessionLocal, engine, Base
from app.auth.utils import get_current_user
from fastapi import HTTPException
import app.routers.meal_variants_v3 as mv
from app.schemas.auth import UserResponse, UserRole
from app.models.user import User
from app.models.meal_system import MealPlanV2, MealSlot, MealBank, MacroType, MeasurementType
from app.migrations.meal_tracking_v3_migration import run_meal_tracking_v3_migrations

Base.metadata.create_all(bind=engine)
run_meal_tracking_v3_migrations(engine)

db = SessionLocal()
trainer = User(username="t", email="t@x.com", hashed_password="x", full_name="T", role="TRAINER", is_active=True)
db.add(trainer); db.commit(); db.refresh(trainer)
client_u = User(username="c", email="c@x.com", hashed_password="x", full_name="C", role="CLIENT", is_active=True, trainer_id=trainer.id)
db.add(client_u); db.commit(); db.refresh(client_u)

def bank(name, he, mt, cal, p, c, f, meas=MeasurementType.PER_100G, serving="100g"):
    b = MealBank(name=name, name_hebrew=he, macro_type=mt, calories=cal, protein=p, carbs=c, fat=f,
                 measurement_type=meas, serving_size=serving, created_by=trainer.id, is_public=True)
    db.add(b); return b

foods = [
    bank("Chicken","חזה עוף",MacroType.PROTEIN,165,31,0,3.6),
    bank("Beef","בקר",MacroType.PROTEIN,250,26,0,15),
    bank("Rice","אורז",MacroType.CARB,130,2.7,28,0.3),
    bank("Potato","תפוח אדמה",MacroType.CARB,77,2,17,0.1),
    bank("Olive oil","שמן זית",MacroType.FAT,884,0,0,100),
    bank("Tahini","טחינה",MacroType.FAT,595,17,21,54),
    bank("Egg","ביצה",MacroType.PROTEIN,78,6,0.6,5, MeasurementType.PER_PORTION, "1 egg"),
]
db.commit()
for f in foods: db.refresh(f)

plan = MealPlanV2(client_id=client_u.id, trainer_id=trainer.id, name="P", number_of_meals=3,
                  total_calories=2200, protein_target=165, carb_target=220, fat_target=70, is_active=True)
db.add(plan); db.commit(); db.refresh(plan)
for i, nm in enumerate(["Breakfast","Lunch","Dinner"]):
    db.add(MealSlot(meal_plan_id=plan.id, name=nm, order_index=i))
db.commit()
slots = db.query(MealSlot).filter(MealSlot.meal_plan_id==plan.id).order_by(MealSlot.order_index).all()
cid, tid = client_u.id, trainer.id
slot_ids = [s.id for s in slots]
food_ids = [f.id for f in foods]
db.close()

current = {"u": None}

class Resp:
    """Mimics the bits of a requests Response the assertions below use."""
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)
    def json(self): return self._payload

def call(fn, **kwargs):
    """Invoke an endpoint function directly with a fresh session."""
    d = SessionLocal()
    try:
        out = fn(current_user=current["u"], db=d, **kwargs)
        def norm(o):
            if isinstance(o, list): return [norm(i) for i in o]
            if hasattr(o, "model_dump"): return o.model_dump(mode="json")
            if isinstance(o, dict): return {k: norm(v) for k, v in o.items()}
            return o
        return Resp(200, norm(out))
    except HTTPException as e:
        return Resp(e.status_code, {"detail": e.detail})
    finally:
        d.close()

def as_trainer(): current["u"] = UserResponse(id=tid, username="t", email="t@x.com", full_name="T", role=UserRole.TRAINER, is_active=True)
def as_client(): current["u"] = UserResponse(id=cid, username="c", email="c@x.com", full_name="C", role=UserRole.CLIENT, is_active=True)

fails = []
def check(n, cond, d=""):
    print(("PASS  " if cond else "FAIL  ") + n + (f"  {d}" if d else ""))
    if not cond: fails.append(n)

# --- targets ---
as_trainer()
from app.schemas.meal_variants_v3 import (DailyTargetsUpdate, MealSlotTargetsUpdate,
    FavoriteFoodCreate, VariantGenerateRequest, VariantSelectRequest)
r = call(mv.update_plan_targets, plan_id=plan.id, targets=DailyTargetsUpdate(
    total_calories=2200, protein_target=165, carb_target=220, fat_target=70,
    meal_targets=[
        MealSlotTargetsUpdate(meal_slot_id=slot_ids[0], target_calories=550, target_protein=41, target_carbs=55, target_fat=17),
        MealSlotTargetsUpdate(meal_slot_id=slot_ids[1], target_calories=880, target_protein=66, target_carbs=88, target_fat=28),
        MealSlotTargetsUpdate(meal_slot_id=slot_ids[2], target_calories=770, target_protein=58, target_carbs=77, target_fat=25),
    ]))
check("PUT targets 200", r.status_code == 200, r.text[:200])
if r.status_code == 200:
    check("drift == 0", r.json()["drift"] == 0, f"drift={r.json()['drift']}")
    check("response echoes meal_slot_id", r.json()["meal_targets"][0].get("meal_slot_id") == slot_ids[0])

# --- favorites ---
as_client()
for i, fid in enumerate(food_ids):
    for slot_order in range(3):
        rr = call(mv.add_favorite, favorite=FavoriteFoodCreate(meal_bank_id=fid, meal_slot_order_index=slot_order), client_id=None)
        if rr.status_code != 200: check(f"POST favorite {fid}/{slot_order}", False, rr.text[:200]); break
check("favorites added", call(mv.get_favorites, client_id=None, slot_order=1).status_code == 200)
dup = call(mv.add_favorite, favorite=FavoriteFoodCreate(meal_bank_id=food_ids[0], meal_slot_order_index=0), client_id=None)
check("duplicate favorite is idempotent 200", dup.status_code == 200, f"{dup.status_code}")

# --- generate (no API key -> fallback) ---
r = call(mv.generate_variants, request=VariantGenerateRequest(force=False))
check("POST generate 200", r.status_code == 200, r.text[:400])
if r.status_code == 200:
    res = r.json()["results"]
    gen = [x for x in res if x["status"] == "generated"]
    check("all 3 slots generated", len(gen) == 3, str([x['status'] for x in res]))
    check("3 variants per slot", all(len(x["variants"]) == 3 for x in gen), str([len(x['variants']) for x in gen]))

# regenerate must not blow up on the unique constraint
r2 = call(mv.generate_variants, request=VariantGenerateRequest(force=True))
check("REGENERATE with force 200 (unique constraint)", r2.status_code == 200, r2.text[:400])
r3 = call(mv.generate_variants, request=VariantGenerateRequest(force=True))
check("REGENERATE twice 200", r3.status_code == 200, r3.text[:300])

# --- list + macro sanity ---
r = call(mv.list_variants, client_id=None, plan_id=None)
check("GET variants 200", r.status_code == 200, r.text[:200])
variants = r.json() if r.status_code == 200 else []
check("9 variants total", len(variants) == 9, f"got {len(variants)}")
bad_sum = [v for v in variants if abs(sum(f["calories"] for f in v["foods"]) - v["computed_calories"]) > 0.5]
check("every variant: computed == sum(foods)", not bad_sum,
      "; ".join(f"id{v['id']} {sum(f['calories'] for f in v['foods']):.1f} vs {v['computed_calories']:.1f}" for v in bad_sum[:3]))
bad_cal = [v for v in variants if v["computed_calories"] > 1500]
check("every variant: calories plausible (<1500)", not bad_cal,
      "; ".join(f"id{v['id']}={v['computed_calories']:.0f}" for v in bad_cal[:3]))
bad_qty = []
for v in variants:
    for f in v["foods"]:
        if f["measurement_type"] == "per_portion" and f["quantity_amount"] > 6:
            bad_qty.append(f"{f['name']}={f['quantity_amount']}")
        if f["measurement_type"] == "per_100g" and f["quantity_amount"] > 500:
            bad_qty.append(f"{f['name']}={f['quantity_amount']}g")
check("no absurd quantities (portion<=6, grams<=500)", not bad_qty, "; ".join(bad_qty[:4]))

# --- select (the previously-500ing endpoint) ---
if variants:
    v0 = [v for v in variants if v["meal_slot_id"] == slot_ids[0]][0]
    r = call(mv.select_variant, request=VariantSelectRequest(variant_id=v0["id"]))
    check("POST select 200 (was TypeError)", r.status_code == 200, r.text[:400])
    if r.status_code == 200:
        dm = r.json()["daily_macros"]
        check("daily_macros has consumed/targets", "consumed" in dm and "targets" in dm, str(dm)[:200])
        check("consumed > 0 after select", dm["consumed"]["calories"] > 0, str(dm["consumed"]))
        check("targets reflect plan (2200)", abs(dm["targets"]["calories"] - 2200) < 1, str(dm["targets"]))
        before = dm["consumed"]["calories"]
        # re-select same slot must REPLACE, not accumulate
        r = call(mv.select_variant, request=VariantSelectRequest(variant_id=v0["id"]))
        after = r.json()["daily_macros"]["consumed"]["calories"]
        check("re-select replaces (no double-count)", abs(after - before) < 0.5, f"{before:.1f} -> {after:.1f}")

# --- cross-client isolation ---
other = SessionLocal()
o = User(username="o", email="o@x.com", hashed_password="x", full_name="O", role="CLIENT", is_active=True, trainer_id=None)
other.add(o); other.commit(); other.refresh(o); oid = o.id; other.close()
as_client()
r = call(mv.list_variants, client_id=None, plan_id=plan.id)
check("client reads own plan", r.status_code == 200, f"{r.status_code}")
current["u"] = UserResponse(id=oid, username="o", email="o@x.com", full_name="O", role=UserRole.CLIENT, is_active=True)
r = call(mv.list_variants, client_id=None, plan_id=plan.id)
check("other client CANNOT read this plan", r.status_code == 404, f"got {r.status_code}")

print()
print("ALL PASSED" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
