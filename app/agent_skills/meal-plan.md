---
name: meal-plan
title: Nutrition and meal plans
when: build or adjust a menu / meal plan / calories / macros for a client; food swaps; diet questions
keywords: menu, meal plan, diet, calories, macros, protein, carbs, fat, cutting, bulking, food, תפריט, תזונה, קלוריות, חלבון, פחמימות, שומן, חיטוב, מסה, ארוחה, menu, nutrition, repas, calories, protéines, glucides, lipides, sèche, prise de masse
paths: /trainer-weekly-meals-v3, /meal-bank, /client/
---
# Nutrition and meal plans (sports nutrition coach level)

## 1. Calories
- BMR (Mifflin–St Jeor): men 10·kg + 6.25·cm − 5·age + 5; women 10·kg + 6.25·cm − 5·age − 161.
- × activity: 1.3 desk + 3 workouts/week, 1.45 active job or 4–5 workouts, 1.6 very active.
- Goal: fat loss −15 to −25 % (aim 0.5–1 % of body weight per week); muscle gain +5 to +10 % (0.25–0.5 %/week); recomposition ≈ maintenance with high protein.
- Round to 50 kcal. Show the calculation in one line so the trainer can check it.

## 2. Macros
- Protein 1.8–2.2 g/kg (use goal weight if BMI > 30). Fat 0.7–1 g/kg (never < 0.5 g/kg). Carbs = the rest.
- Check: protein×4 + carbs×4 + fat×9 = calories (±3 %).

## 3. Menu structure (how ECshape menus are built)
- 3–5 meals (breakfast, lunch, snack, dinner, optional pre/post workout). Each meal has a calorie / macro target.
- For each meal give at least 3 interchangeable options with grams (cooked/raw stated) and household measures (כפות, פרוסות, יחידות).
- Prefer foods common in Israel and in the trainer's food bank: call `list_foods` and use those names (cottage 5 %, Greek yogurt, eggs, chicken breast, tuna, tofu, rice, sweet potato, oats, pita/bread, hummus/tahini, avocado, fruit, vegetables).
- Protein in every meal (25–45 g). Vegetables at lunch and dinner. Carbs around training.
- Respect kosher / vegetarian / vegan / allergies / dislikes the client stated.

## 4. Output format
1. Targets line: kcal · protein · carbs · fat.
2. Per meal: name + time + target, then "Option 1/2/3" with foods and grams.
3. "Free foods" (vegetables, zero drinks) and 3 practical tips (water, eating out, weekends).
4. Offer to open the weekly menu planner (`navigate` /trainer-weekly-meals-v3).

## Never
- Medical nutrition therapy (diabetes, kidney disease, eating disorders, pregnancy) → recommend a registered dietitian / doctor.
- Below 1,200 kcal (women) / 1,500 kcal (men) without medical supervision. No supplements as "must", no detox claims.
