#!/usr/bin/env python3
"""
Local demo seed: trainer + client + meal bank + a 3-slot plan with per-meal targets.

    python seed_meal_variants_demo.py

Login as the client at http://localhost:5173 to see the meal page with budget rows;
login as the trainer to edit targets in the weekly planner.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal, engine, Base
from app.models.user import User
from app.models.meal_system import MealPlanV2, MealSlot, MealBank, MacroType, MeasurementType
from app.schemas.auth import UserRole
from app.auth.utils import get_password_hash

Base.metadata.create_all(bind=engine)

db = SessionLocal()

def get_or_create_user(username, email, password, full_name, role, trainer_id=None):
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        print(f"  exists: {username} ({role})")
        return existing
    u = User(
        username=username,
        email=email,
        hashed_password=get_password_hash(password),
        full_name=full_name,
        role=role,
        is_active=True,
        trainer_id=trainer_id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    print(f"  created: {username} / {password} ({role})")
    return u

print("Users:")
trainer = get_or_create_user("trainer1", "trainer1@example.com", "trainer123", "Dana Trainer", UserRole.TRAINER)
client = get_or_create_user("client1", "client1@example.com", "client123", "Yossi Client", UserRole.CLIENT, trainer_id=trainer.id)

print("\nMeal bank:")
def get_or_create_food(name, name_hebrew, macro_type, calories, protein, carbs, fat,
                        measurement_type=MeasurementType.PER_100G, serving_size="100g"):
    existing = db.query(MealBank).filter(
        MealBank.name == name, MealBank.created_by == trainer.id
    ).first()
    if existing:
        print(f"  exists: {name}")
        return existing
    f = MealBank(
        name=name, name_hebrew=name_hebrew, macro_type=macro_type,
        calories=calories, protein=protein, carbs=carbs, fat=fat,
        measurement_type=measurement_type, serving_size=serving_size,
        created_by=trainer.id, is_public=True,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    print(f"  created: {name} ({name_hebrew})")
    return f

foods = [
    get_or_create_food("Chicken breast", "חזה עוף", MacroType.PROTEIN, 165, 31, 0, 3.6),
    get_or_create_food("Beef sirloin", "סינטה בקר", MacroType.PROTEIN, 250, 26, 0, 15),
    get_or_create_food("White fish", "דג לבן", MacroType.PROTEIN, 96, 20, 0, 1.5),
    get_or_create_food("Cottage cheese", "קוטג'", MacroType.PROTEIN, 98, 11, 3.4, 4.3),
    get_or_create_food("Egg", "ביצה", MacroType.PROTEIN, 78, 6, 0.6, 5, MeasurementType.PER_PORTION, "1 egg"),
    get_or_create_food("White rice", "אורז לבן", MacroType.CARB, 130, 2.7, 28, 0.3),
    get_or_create_food("Sweet potato", "בטטה", MacroType.CARB, 86, 1.6, 20, 0.1),
    get_or_create_food("Oats", "שיבולת שועל", MacroType.CARB, 389, 16.9, 66, 6.9),
    get_or_create_food("Bread slice", "פרוסת לחם", MacroType.CARB, 79, 3.1, 14, 1, MeasurementType.PER_PORTION, "1 slice"),
    get_or_create_food("Olive oil", "שמן זית", MacroType.FAT, 884, 0, 0, 100),
    get_or_create_food("Tahini", "טחינה", MacroType.FAT, 595, 17, 21, 54),
    get_or_create_food("Almonds", "שקדים", MacroType.FAT, 579, 21, 22, 50),
]

print("\nMeal plan:")
existing_plan = db.query(MealPlanV2).filter(
    MealPlanV2.client_id == client.id, MealPlanV2.is_active == True
).first()

if existing_plan:
    print(f"  exists: plan #{existing_plan.id} for {client.username}")
    plan = existing_plan
else:
    plan = MealPlanV2(
        client_id=client.id,
        trainer_id=trainer.id,
        name="Demo cutting plan",
        number_of_meals=3,
        total_calories=2200,
        protein_target=165,
        carb_target=220,
        fat_target=70,
        is_active=True,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    # 25/40/35 split, matching MealTargetsEditor's default.
    slot_defs = [
        ("Breakfast", "ארוחת בוקר", 0, "08:00", 0.25),
        ("Lunch", "ארוחת צהריים", 1, "13:00", 0.40),
        ("Dinner", "ארוחת ערב", 2, "19:30", 0.35),
    ]
    for name, _he, order, time_sugg, share in slot_defs:
        slot = MealSlot(
            meal_plan_id=plan.id,
            name=name,
            order_index=order,
            time_suggestion=time_sugg,
            target_calories=round(2200 * share),
            target_protein=round(165 * share, 1),
            target_carbs=round(220 * share, 1),
            target_fat=round(70 * share, 1),
        )
        db.add(slot)
    db.commit()
    print(f"  created: plan #{plan.id} for {client.username}, 3 slots with targets")

db.close()

print("\n" + "=" * 60)
print("Login at http://localhost:5173")
print("  Trainer: trainer1 / trainer123")
print("  Client:  client1 / client123")
print("  Admin:   admin / admin123")
print("=" * 60)
