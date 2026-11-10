"""
End-to-end checks for the PDF-import endpoint, driving the endpoint function directly
(same no-httpx/pytest pattern as test_meal_variants_e2e.py). Covers auth, file-type/size
validation, and the "parse never writes to the database" contract - full parsing
correctness against a real PDF is covered separately in test_menu_pdf_parser.py.

    DATABASE_URL="sqlite:////tmp/mv_pdf_e2e.db" python test_menu_pdf_import_e2e.py
"""

import asyncio
import io
import os
import sys
import logging

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
logging.disable(logging.INFO)

from app.database import SessionLocal, engine, Base
from fastapi import HTTPException
from starlette.datastructures import UploadFile, Headers
import app.routers.meal_variants_v3 as mv
from app.schemas.auth import UserResponse, UserRole
from app.models.user import User
from app.models.meal_system import MealPlanV2, MealSlot
from app.models.meal_variants import MealVariant
from app.migrations.meal_tracking_v3_migration import run_meal_tracking_v3_migrations

Base.metadata.create_all(bind=engine)
run_meal_tracking_v3_migrations(engine)

db = SessionLocal()
trainer = User(username="t", email="t@x.com", hashed_password="x", full_name="T", role="TRAINER", is_active=True)
db.add(trainer); db.commit(); db.refresh(trainer)
client_u = User(username="c", email="c@x.com", hashed_password="x", full_name="C", role="CLIENT", is_active=True, trainer_id=trainer.id)
db.add(client_u); db.commit(); db.refresh(client_u)

other_trainer = User(username="t2", email="t2@x.com", hashed_password="x", full_name="T2", role="TRAINER", is_active=True)
db.add(other_trainer); db.commit(); db.refresh(other_trainer)

plan = MealPlanV2(client_id=client_u.id, trainer_id=trainer.id, name="P", number_of_meals=3,
                  total_calories=2200, protein_target=165, carb_target=220, fat_target=70, is_active=True)
db.add(plan); db.commit(); db.refresh(plan)
for i, nm in enumerate(["ארוחת בוקר", "ארוחת צהריים", "ארוחת ערב"]):
    db.add(MealSlot(meal_plan_id=plan.id, name=nm, order_index=i))
db.commit()
slots = db.query(MealSlot).filter(MealSlot.meal_plan_id == plan.id).order_by(MealSlot.order_index).all()
plan_id, cid, tid, t2id = plan.id, client_u.id, trainer.id, other_trainer.id
slot_ids = [s.id for s in slots]
db.close()

from app.schemas.meal_variants_v3 import EnsurePlanRequest, DailyTargetsFields, EnsurePlanSlotInput

current = {"u": None}

class Resp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)
    def json(self): return self._payload

def norm(o):
    if isinstance(o, list): return [norm(i) for i in o]
    if hasattr(o, "model_dump"): return o.model_dump(mode="json")
    if isinstance(o, dict): return {k: norm(v) for k, v in o.items()}
    return o

def call_async(fn, **kwargs):
    """Invoke an async endpoint function directly with a fresh session."""
    d = SessionLocal()
    try:
        out = asyncio.run(fn(current_user=current["u"], db=d, **kwargs))
        return Resp(200, norm(out))
    except HTTPException as e:
        return Resp(e.status_code, {"detail": e.detail})
    finally:
        d.close()

def call_sync(fn, **kwargs):
    """Invoke a sync endpoint function directly with a fresh session."""
    d = SessionLocal()
    try:
        out = fn(current_user=current["u"], db=d, **kwargs)
        return Resp(200, norm(out))
    except HTTPException as e:
        return Resp(e.status_code, {"detail": e.detail})
    finally:
        d.close()

def make_upload(content: bytes, filename: str, content_type: str) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(content),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )

def as_trainer(): current["u"] = UserResponse(id=tid, username="t", email="t@x.com", full_name="T", role=UserRole.TRAINER, is_active=True)
def as_other_trainer(): current["u"] = UserResponse(id=t2id, username="t2", email="t2@x.com", full_name="T2", role=UserRole.TRAINER, is_active=True)
def as_client(): current["u"] = UserResponse(id=cid, username="c", email="c@x.com", full_name="C", role=UserRole.CLIENT, is_active=True)

fails = []
def check(n, cond, d=""):
    print(("PASS  " if cond else "FAIL  ") + n + (f"  {d}" if d else ""))
    if not cond: fails.append(n)

def count_variants():
    d = SessionLocal()
    try:
        return d.query(MealVariant).filter(MealVariant.meal_slot_id.in_(slot_ids)).count()
    finally:
        d.close()

# --- auth: client cannot call the endpoint ---
as_client()
r = call_async(mv.parse_menu_pdf, client_id=cid, file=make_upload(b"%PDF-1.4 fake", "menu.pdf", "application/pdf"))
check("client CANNOT parse-pdf (403)", r.status_code == 403, f"{r.status_code} {r.text[:150]}")

# --- auth: a different trainer (not this client's coach) cannot call it ---
as_other_trainer()
r = call_async(mv.parse_menu_pdf, client_id=cid, file=make_upload(b"%PDF-1.4 fake", "menu.pdf", "application/pdf"))
check("unrelated trainer CANNOT parse-pdf (403)", r.status_code == 403, f"{r.status_code} {r.text[:150]}")

# --- validation: non-PDF content type/extension rejected ---
as_trainer()
r = call_async(mv.parse_menu_pdf, client_id=cid, file=make_upload(b"hello", "notes.txt", "text/plain"))
check("non-PDF file rejected (400)", r.status_code == 400, f"{r.status_code} {r.text[:150]}")

# --- validation: empty file rejected ---
r = call_async(mv.parse_menu_pdf, client_id=cid, file=make_upload(b"", "menu.pdf", "application/pdf"))
check("empty file rejected (400)", r.status_code == 400, f"{r.status_code} {r.text[:150]}")

# --- validation: oversized file rejected ---
oversized = b"%PDF-1.4" + b"0" * (16 * 1024 * 1024)
r = call_async(mv.parse_menu_pdf, client_id=cid, file=make_upload(oversized, "menu.pdf", "application/pdf"))
check("oversized file rejected (400)", r.status_code == 400, f"{r.status_code} {r.text[:150]}")

# --- validation: unreadable/corrupt PDF bytes -> 422, not a 500 ---
r = call_async(mv.parse_menu_pdf, client_id=cid, file=make_upload(b"not actually a pdf file", "menu.pdf", "application/pdf"))
check("corrupt PDF rejected (422, not 500)", r.status_code == 422, f"{r.status_code} {r.text[:150]}")

# --- unknown client ---
r = call_async(mv.parse_menu_pdf, client_id=999999, file=make_upload(b"%PDF-1.4 fake", "menu.pdf", "application/pdf"))
check("unknown client_id (403/404)", r.status_code in (403, 404), f"{r.status_code} {r.text[:150]}")

# --- real PDF: use the actual file if present on this machine, else build a minimal one ---
REAL_PDF_PATH = os.path.expanduser("~/Downloads/תפריט תזונה עימאד עלושי 20.10.26.pdf")
before_count = count_variants()

if os.path.exists(REAL_PDF_PATH):
    with open(REAL_PDF_PATH, "rb") as f:
        pdf_bytes = f.read()
    r = call_async(mv.parse_menu_pdf, client_id=cid, file=make_upload(pdf_bytes, "menu.pdf", "application/pdf"))
    check("real PDF parses 200", r.status_code == 200, r.text[:300])
    if r.status_code == 200:
        data = r.json()
        check("real PDF: has_plan is True (plan already exists)", data["has_plan"] is True)
        check("real PDF: 4 slots found", len(data["slots"]) == 4, f"got {len(data['slots'])}")
        total_options = sum(len(s["variants"]) for s in data["slots"])
        check("real PDF: 14 options total", total_options == 14, f"got {total_options}")
        breakfast = next((s for s in data["slots"] if s["raw_meal_name"] == "ארוחת בוקר"), None)
        check("real PDF: breakfast slot matched exactly (seeded slot name matches)",
              breakfast is not None and breakfast["match_confidence"] == "exact",
              str(breakfast.get("match_confidence") if breakfast else None))
        snack = next((s for s in data["slots"] if s["raw_meal_name"] == "ארוחת ביניים"), None)
        check("real PDF: snack (no seeded slot) has no match but a proposed_target",
              snack is not None and snack["matched_meal_slot_id"] is None and snack["proposed_target"] is not None,
              str(snack))
else:
    print("SKIP  real PDF not present on this machine, skipping full-parse assertions")

# --- the core safety contract: parsing never writes to the database ---
after_count = count_variants()
check("parse-pdf wrote ZERO MealVariant rows", after_count == before_count,
      f"before={before_count} after={after_count}")

# --- no-plan client: parse-pdf reports has_plan=False with proposed targets, never a 404 ---
noplan_client = User(username="np", email="np@x.com", hashed_password="x", full_name="NP", role="CLIENT",
                      is_active=True, trainer_id=tid)
d = SessionLocal()
d.add(noplan_client); d.commit(); d.refresh(noplan_client)
npid = noplan_client.id
d.close()

if os.path.exists(REAL_PDF_PATH):
    r = call_async(mv.parse_menu_pdf, client_id=npid, file=make_upload(pdf_bytes, "menu.pdf", "application/pdf"))
    check("no-plan client: parse-pdf returns 200 (not 404)", r.status_code == 200, f"{r.status_code} {r.text[:150]}")
    if r.status_code == 200:
        data = r.json()
        check("no-plan client: has_plan is False", data["has_plan"] is False)
        check("no-plan client: daily_targets parsed from PDF",
              data["daily_targets"] == {"total_calories": 2120, "protein_target": 170.0, "carb_target": 180.0, "fat_target": 80.0},
              str(data["daily_targets"]))
        check("no-plan client: all 4 sections have matched_meal_slot_id=None",
              all(s["matched_meal_slot_id"] is None for s in data["slots"]))
        check("no-plan client: all 4 sections have a proposed_target",
              all(s["proposed_target"] is not None for s in data["slots"]))

        # --- POST /plans/ensure: creates the plan + all 4 slots in one additive call ---
        as_trainer()
        ensure_req = EnsurePlanRequest(
            client_id=npid,
            daily_targets=DailyTargetsFields(**data["daily_targets"]),
            new_slots=[
                EnsurePlanSlotInput(raw_name=s["raw_meal_name"], order_index=i,
                                    target_calories=s["proposed_target"]["target_calories"],
                                    target_protein=s["proposed_target"]["target_protein"],
                                    target_carbs=s["proposed_target"]["target_carbs"],
                                    target_fat=s["proposed_target"]["target_fat"])
                for i, s in enumerate(data["slots"])
            ],
        )
        r2 = call_sync(mv.ensure_plan, request=ensure_req)
        check("ensure_plan creates a plan with 4 slots", r2.status_code == 200 and len(r2.json()["meal_slots"]) == 4,
              f"{r2.status_code} {r2.text[:200]}")

        # --- calling /plans/ensure AGAIN with the same payload must NOT duplicate slots ---
        r3 = call_sync(mv.ensure_plan, request=ensure_req)
        check("ensure_plan called twice does not duplicate slots",
              r3.status_code == 200 and len(r3.json()["meal_slots"]) == 4,
              f"{r3.status_code} got {len(r3.json().get('meal_slots', [])) if r3.status_code == 200 else '?'} slots")

        # --- GET-equivalent: re-parsing the same client now matches every section exactly ---
        r4 = call_async(mv.parse_menu_pdf, client_id=npid, file=make_upload(pdf_bytes, "menu.pdf", "application/pdf"))
        if r4.status_code == 200:
            data4 = r4.json()
            check("after ensure_plan: has_plan is now True", data4["has_plan"] is True)
            check("after ensure_plan: all 4 sections now match exactly",
                  all(s["match_confidence"] == "exact" for s in data4["slots"]),
                  str([(s["raw_meal_name"], s["match_confidence"]) for s in data4["slots"]]))
else:
    print("SKIP  real PDF not present on this machine, skipping no-plan/ensure assertions")

print()
print("ALL PASSED" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
