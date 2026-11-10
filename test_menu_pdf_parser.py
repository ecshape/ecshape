"""
Unit checks for the trainer-menu-PDF parser, using the real text pypdf's extract_text()
produced for an actual client PDF (not a synthetic fixture) as ground truth.

    python test_menu_pdf_parser.py

Covers: meal slot detection, option boundary detection, the macro-digit-blob split
(including the glued-onto-text-line variant), and the hard exclusion of the
substitutions table / rules section so they never get parsed as meal content.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.menu_pdf_parser import (
    parse_menu_text, split_macro_blob, resolve_macro_blob, match_parsed_slots_to_plan,
    _parse_daily_targets, _parse_meal_targets,
)

# Real text extracted via pypdf's PdfReader(...).pages[i].extract_text() from an actual
# client PDF, joined the same way the endpoint joins pages (newline-separated).
PAGE_1 = """ תפריט תזונה עימאד עלושי20.10.26
2120 קלוריות   חלבון |   170    פחמימה|   ' ג180    שומן|   ' ג80' ג
בכל ארוחה בוחרים אופציה אחת. כל האופציות באותה ארוחה מכוילות לאותם ערכים, כך שכל שילוב מגיע ל-2050 עד 
2160. קלוריות ביום. כל המשקלים הם אחרי בישול
חלוקה יומית
ארוחהחלבון (ג')פחמימה (ג')שומן (ג')קלוריות
קפה בוקר585100
ארוחת בוקר434617510
ארוחת צהריים495520600
ארוחת ביניים26388325
ארוחת ערב473825570
סה"כ יומי170185752105
)קפה בוקר (קבוע
כוס קפה עם חלב, 100- קלוריות חלב (כ170  מ"ל חלב3% ). חלבון5  פחמימה· 8  שומן· 5.
ארוחת בוקר
אופציהמה אוכליםחלבוןפחמימהשומןקלוריות
1'. חביתה וקוטג
2 +  ביצים2 , חלבונים כחביתה100' ג' קוטג 
5% ,2 פיתות קוסמין, פריכית אורז אחת, ירקות 
חופשי
424417500
2. דייסת חלבון
50 ג' שיבולת שועל (משקל יבש) מבושלת 
במים, משקה חלבון מעורבב פנימה, 100' ג 
גבינה לבנה 5% ,15 ג' שוקולד מריר מגורר 
מעל
424717510
3. כריך טונה 
וביצה
קופסת טונה במים מסוננת, ביצה קשה, 60' ג 
אבוקדו, 2, פיתות קוסמין, פריכית אורז אחת 
ירקות חופשי
444717520
ארוחת צהריים
אופציהמה אוכליםחלבוןפחמימהשומןקלוריות
1. חזה עוף ואורז
135 , ג' חזה עוף מבושל180 ג' אורז לבן 
מבושל, 15 , ג' טחינה גולמית50, ג' אבוקדו 
סלט חופשי
505619595
2. פרגית ותפוח 165 , ג' פרגית מבושלת250 ג' תפוח אדמה 475122590
ECSHAPE  אליאור, ליווי כושר ותזונה אונליין|  """

PAGE_2 = """אופציהמה אוכליםחלבוןפחמימהשומןקלוריות
אדמהאפוי או מבושל, 10 ג' טחינה גולמית, סלט חופשי
3. דג לבן ואורז
175 ג' דג לבן מבושל, כמו אמנון, מוסר או 
בקלה, 170 , ג' אורז לבן מבושל100, ג' אבוקדו 
סלט חופשי
515620605
4. פיתות פסטרמה 
וביצים
100 , ג' פסטרמה עוף או בקר2 , ביצים3 פיתות 
קוסמין, 40 ג' אבוקדו, ירקות חופשי485721610
ארוחת ביניים
אופציהמה אוכליםחלבוןפחמימהשומןקלוריות
1. שייק ובננהמשקה חלבון, בננה בינונית, 15 ג' שוקולד מריר28389340
2. קערת יוגורטיוגורט 20 , ג' חלבון25 , ג' קורנפלקס15' ג שוקולד מריר קצוץ23387305
3. שייק ופריכיותמשקה חלבון, 2- פריכיות אורז מרוחות ב10' ג טחינה גולמית, תמר מג'הול אחד28388335
ארוחת ערב
אופציהמה אוכליםחלבוןפחמימהשומןקלוריות
1. טונה, ביצים 
ואבוקדו
קופסת טונה במים מסוננת, 2 , ביצים70' ג 
אבוקדו, 2 פיתות קוסמין, סלט חופשי504124575
2. פרגית ותפוח 
אדמה
165 , ג' פרגית מבושלת150 ג' תפוח אדמה 
אפוי, 20 ג' טחינה גולמית, סלט חופשי473227560
3. דג לבן ותפוח 
אדמה
160 , ג' דג לבן מבושל150 ג' תפוח אדמה 
אפוי, 20 , ג' טחינה גולמית70 ג' אבוקדו, סלט 
חופשי
483825570
4. פיתות חזה עוף
100 , ג' חזה עוף מבושל בפיתות2 פיתות 
קוסמין, 20 , ג' טחינה גולמית70, ג' אבוקדו 
ירקות חופשי
454225575
 באופציה4- אפשר להחליף את חזה העוף ב150. ג' פסטרמה עוף או בקר, הערכים כמעט זהים
טבלת החלפות
רוצים לשנות רכיב? מחליפים בתוך אותה קבוצה, כמות מול כמות.
קבוצהכמות שוות ערךהערה
פחמימה (כ-25)' ג
90 ·  ג' אורז לבן מבושל125 ·  ג' תפוח אדמה1.5 פיתות 
 ·  בננה בינונית· קוסמין1.5 ·  תמרי מג'הול40 ג' שיבולת 
 · שועל יבשה30 ·  ג' קורנפלקס3.5 פריכיות אורז
חלבון (כ-23)' ג75 ·  ג' חזה עוף מבושל90 ·  ג' דג לבן מבושל120' ג  משקה חלבון·  קופסת טונה במים· פסטרמהפרגית: 95 ג' מבושלת, אבל מוסיפה כ-8 ג' שומן
ECSHAPE  אליאור, ליווי כושר ותזונה אונליין|  """

PAGE_3 = """קבוצהכמות שוות ערךהערה
שומן (כ-8)' ג55 ·  ג' אבוקדו15 ·  ג' טחינה גולמית20 ג' שוקולד מרירהשוקולד מוסיף גם כ-9' ג פחמימה
כללים חשובים
●.כל המשקלים בתפריט הם אחרי בישול. יוצאים מהכלל: שיבולת שועל וקורנפלקס, שנשקלים יבשים
●.ירקות ירוקים וסלט בלי הגבלה, בלי שמן. לבישול רק ספריי שמן
● גבינה לבנה וקוטג' לפי5%. שומן. טונה במים בלבד
● יוגורט20- ג' חלבון חושב לפי כ125. קלוריות לגביע. אם המותג שונה, כדאי לבדוק את התווית
●.תמר חושב כתמר מג'הול גדול. תמר דקל נור קטן שווה בערך שליש ממנו
● מים: לפחות3. ליטר ביום. משקאות דיאט וקפה שחור לא נספרים
ECSHAPE  אליאור, ליווי כושר ותזונה אונליין|  """

FULL_TEXT = "\n".join([PAGE_1, PAGE_2, PAGE_3])

fails = []
def check(name, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + name + (f"  {detail}" if detail else ""))
    if not cond:
        fails.append(name)

parsed = parse_menu_text(FULL_TEXT)

# --- slot detection ---
check("found exactly 4 meal slots", len(parsed.slots) == 4, str([s.raw_name for s in parsed.slots]))
slot_names = [s.raw_name for s in parsed.slots]
check("slot order: breakfast, lunch, snack, dinner",
      slot_names == ["ארוחת בוקר", "ארוחת צהריים", "ארוחת ביניים", "ארוחת ערב"], str(slot_names))
check("no empty phantom slots", all(len(s.options) > 0 for s in parsed.slots))

breakfast, lunch, snack, dinner = parsed.slots

# --- option counts (ground truth from the real PDF) ---
check("breakfast has 3 options", len(breakfast.options) == 3, str(len(breakfast.options)))
check("lunch has 4 options (spans a page break)", len(lunch.options) == 4, str(len(lunch.options)))
check("snack has 3 options", len(snack.options) == 3, str(len(snack.options)))
check("dinner has 4 options", len(dinner.options) == 4, str(len(dinner.options)))

# --- zero warnings: every real option has a parseable macro blob ---
check("zero parse warnings on the real file", len(parsed.warnings) == 0, str(parsed.warnings))

# --- macro blobs: unambiguous cases (11 of 14 real rows) ---
UNAMBIGUOUS = {
    (0, 0): ("424417500", (42, 44, 17, 500)),
    (0, 1): ("424717510", (42, 47, 17, 510)),
    (0, 2): ("444717520", (44, 47, 17, 520)),
    (1, 0): ("505619595", (50, 56, 19, 595)),
    (1, 1): ("475122590", (47, 51, 22, 590)),
    (1, 2): ("515620605", (51, 56, 20, 605)),
    (1, 3): ("485721610", (48, 57, 21, 610)),
    (3, 0): ("504124575", (50, 41, 24, 575)),
    (3, 1): ("473227560", (47, 32, 27, 560)),
    (3, 2): ("483825570", (48, 38, 25, 570)),
    (3, 3): ("454225575", (45, 42, 25, 575)),
}
for (slot_idx, opt_idx), (expected_blob, expected_macros) in UNAMBIGUOUS.items():
    opt = parsed.slots[slot_idx].options[opt_idx]
    check(f"slot{slot_idx}/opt{opt_idx} blob={expected_blob}", opt.macro_blob == expected_blob,
          f"got {opt.macro_blob!r}")
    cands = opt.macro_candidates
    check(f"slot{slot_idx}/opt{opt_idx} unambiguous (1 candidate)", len(cands) == 1, str(cands))
    if cands:
        check(f"slot{slot_idx}/opt{opt_idx} macros={expected_macros}", cands[0] == expected_macros,
              f"got {cands[0]}")

# --- macro blobs: ambiguous cases (all 3 snack options - fat is a single digit) ---
# split_macro_blob still returns 3 raw candidates for these (the digits genuinely split
# multiple valid ways), but resolve_macro_blob must pick the single correct one
# automatically via the calorie-sanity tiebreaker - no choice should ever reach a human.
SNACK_RESOLVED = {
    0: (28, 38, 9, 340),
    1: (23, 38, 7, 305),
    2: (28, 38, 8, 335),
}
for opt_idx in range(3):
    opt = snack.options[opt_idx]
    cands = opt.macro_candidates
    check(f"snack opt{opt_idx} raw blob is still ambiguous (3 candidates)", len(cands) == 3, str(cands))
    resolved = opt.resolved_macros
    expected = SNACK_RESOLVED[opt_idx]
    check(f"snack opt{opt_idx} resolved automatically to {expected}", resolved == expected,
          f"got {resolved}")

# split_macro_blob / resolve_macro_blob as standalone functions, independent of the parser
check("split_macro_blob unambiguous example", split_macro_blob("424417500") == [(42, 44, 17, 500)])
check("split_macro_blob ambiguous example has 3 candidates", len(split_macro_blob("28389340")) == 3)
check("split_macro_blob too-short blob returns no candidates", split_macro_blob("1234") == [])
check("resolve_macro_blob unambiguous passthrough", resolve_macro_blob("424417500") == (42, 44, 17, 500))
check("resolve_macro_blob picks correct candidate for ambiguous blob",
      resolve_macro_blob("28389340") == (28, 38, 9, 340))
check("resolve_macro_blob returns None for unparseable blob", resolve_macro_blob("1234") is None)

# --- critical negative assertions: trailing sections must never leak in as options ---
all_names = [o.name_hebrew_raw for s in parsed.slots for o in s.options]
check("substitutions table not parsed as an option", not any("אורז לבן מבושל" in n for n in all_names))
check("'כללים חשובים' not parsed as an option", not any("כללים חשובים" in n for n in all_names))
check("'טבלת החלפות' not parsed as an option", not any("טבלת החלפות" in n for n in all_names))
check("no option name starting with a substitution group header",
      not any(n.startswith(("פחמימה", "חלבון", "שומן") ) for n in all_names))
check("no 5th meal slot created from the substitutions/rules sections", len(parsed.slots) == 4)

# --- the חלוקה יומית daily-breakdown summary table must not create phantom slots ---
# (this was a real bug found when testing against the actual file: "ארוחת בוקר434617510"
# inside the summary table matched a loose meal-header regex and created an empty slot)
check("no option carries a daily-breakdown row's glued digits as its own name",
      not any(n.endswith(("434617510", "495520600", "26388325", "473825570")) for n in all_names))

# --- meal-slot matching ---
plan_slots_exact = [
    {"id": 1, "name": "ארוחת בוקר", "order_index": 0},
    {"id": 2, "name": "ארוחת צהריים", "order_index": 1},
    {"id": 3, "name": "ארוחת ביניים", "order_index": 2},
    {"id": 4, "name": "ארוחת ערב", "order_index": 3},
]
matches = match_parsed_slots_to_plan(parsed.slots, plan_slots_exact)
check("exact slot-name match resolves all 4 slots",
      all(m.match_confidence == "exact" and m.matched_meal_slot_id is not None for m in matches),
      str(matches))

plan_slots_unknown = [
    {"id": 10, "name": "Breakfast", "order_index": 0},
    {"id": 11, "name": "Lunch", "order_index": 1},
]
matches2 = match_parsed_slots_to_plan(parsed.slots, plan_slots_unknown)
check("no confident match -> candidates offered, not a guess",
      all(m.match_confidence == "none" and m.matched_meal_slot_id is None for m in matches2),
      str(matches2))

# --- daily and per-meal targets, parsed from the same real PDF text ---
check("parsed.daily_targets == (protein, carbs, fat, calories)",
      parsed.daily_targets == (170, 180, 80, 2120), f"got {parsed.daily_targets}")
check("_parse_daily_targets standalone matches", _parse_daily_targets(FULL_TEXT) == (170, 180, 80, 2120))

EXPECTED_MEAL_TARGETS = {
    "ארוחת בוקר": (43, 46, 17, 510),
    "ארוחת צהריים": (49, 55, 20, 600),
    "ארוחת ביניים": (26, 38, 8, 325),
    "ארוחת ערב": (47, 38, 25, 570),
}
check("meal_targets has exactly the 4 option-bearing meals",
      set(parsed.meal_targets.keys()) == set(EXPECTED_MEAL_TARGETS.keys()),
      str(sorted(parsed.meal_targets.keys())))
for name, expected in EXPECTED_MEAL_TARGETS.items():
    got = parsed.meal_targets.get(name)
    check(f"meal_targets[{name!r}] == {expected}", got == expected, f"got {got}")

check("_parse_meal_targets standalone matches", _parse_meal_targets(FULL_TEXT) == EXPECTED_MEAL_TARGETS)
check("קפה בוקר (fixed coffee row) is NOT included in meal_targets",
      "קפה בוקר" not in parsed.meal_targets)
check("סה\"כ יומי (grand total row) is NOT included in meal_targets",
      "סה\"כ יומי" not in parsed.meal_targets)

print()
print(f"{len(fails)} failing check(s): {fails}" if fails else "ALL PASSED")
sys.exit(1 if fails else 0)
