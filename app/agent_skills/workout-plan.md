---
name: workout-plan
title: Training program design
when: create, review or adjust a workout plan / split / routine / program for a client; exercise choice; progression; deload
keywords: workout, training plan, program, routine, split, exercises, sets, reps, hypertrophy, strength, push pull legs, upper lower, full body, אימון, תוכנית אימון, תוכנית אימונים, רוטינה, תרגילים, סטים, חזרות, מסה, כוח, entraînement, programme, séance, exercices, séries
paths: /create-workout-plan-v2, /exercises, /client/
---
# Training program design (personal trainer level)

## 1. Gather before you write (ask only what is missing, in one message)
- Goal (fat loss / muscle gain / recomposition / strength / general fitness), training age (beginner < 1 y, intermediate 1–3 y, advanced 3 y+).
- Days per week and session length, where they train (full gym / home / dumbbells only), injuries or pain, exercises they love / hate.
- If the client is in the app, call `client_details` (weight trend, check-ins) and use it. Never invent data.

## 2. Choose the split from the days available
| Days | Default split | Notes |
|---|---|---|
| 2 | Full body A/B | each muscle 2×/week |
| 3 | Full body A/B/C (beginner) or Push/Pull/Legs (intermediate) | |
| 4 | Upper/Lower ×2 | best default for most |
| 5 | Upper/Lower + Push/Pull/Legs, or PPL + Upper/Lower | |
| 6 | Push/Pull/Legs ×2 | advanced, good recovery only |
Each muscle should be trained at least 2× per week.

## 3. Volume, intensity, rest
- Hard sets per muscle per week: beginners 8–12, intermediate 12–18, advanced 15–22. Start at the low end, add sets only if progress stalls and recovery is good.
- Rep ranges: compounds 5–10 (strength 3–6), isolation 10–20. Effort: 1–3 reps in reserve (RIR); last set of isolation can go to failure.
- Rest: heavy compounds 2–3 min, other compounds 90–120 s, isolation 60–90 s.
- Session: 5–8 exercises, 45–75 min. Order: big compound first, then secondary compound, then isolation, core last.

## 4. Exercise selection
- Per session cover the movement patterns of that day: squat / hinge / horizontal push / vertical push / horizontal pull / vertical pull / single-leg / core.
- Use exercises that exist in the library: call `search_exercises` and use their exact names (the plan builder matches them).
- Beginners: stable, easy-to-learn variations (machines, goblet squat, dumbbell press). Respect injuries: swap, do not "push through" (e.g. shoulder pain → neutral-grip press, landmine press; low back → leg press, hip thrust instead of heavy deadlift).

## 5. Progression and deload
- Double progression: stay in the rep range; when every set hits the top of the range with the target RIR, add the smallest weight step (2.5 kg upper / 5 kg lower) and go back to the bottom of the range.
- Review every 4 weeks. Deload every 6–8 weeks or when performance drops 2 sessions in a row: same exercises, half the sets, RIR 3–4.

## 6. Output format
1. One line: split, days, goal.
2. One table per day: `# | Exercise | Sets × reps | Rest | RIR | Coaching cue`.
3. "Progression" (2–3 lines) and "When to change" (1–2 lines).
4. Offer to open the plan builder (`navigate` to /create-workout-plan-v2) — the trainer creates it there.
Write in the trainer's language; keep exercise names as in the library.

## Never
- Medical diagnoses or rehab programs for injuries — refer to a physiotherapist.
- More than ~25 hard sets per muscle per week, or a plan that ignores the days/time the client actually has.
