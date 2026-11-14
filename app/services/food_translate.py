"""
Tiny built-in food dictionary (Hebrew / French <-> English).

USDA FoodData Central only understands English, so a trainer typing "חזה עוף" or
"blanc de poulet" gets the query translated to "chicken breast" first. The same
table is used the other way round to show a Hebrew / French name next to the
English USDA description when every important word is known.

Each entry: (english, [hebrew forms...], [french forms...]). The first form is
the display form. Multi-word phrases are matched before single words.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Dict, List, Optional, Tuple

ENTRIES: List[Tuple[str, List[str], List[str]]] = [
    # --- Meat & poultry
    ("chicken", ["עוף", "עופות", "תרנגולת"], ["poulet", "volaille"]),
    ("chicken breast", ["חזה עוף"], ["blanc de poulet", "filet de poulet", "escalope de poulet"]),
    ("chicken thigh", ["ירך עוף", "פרגית", "פרגיות", "שוק עוף"], ["cuisse de poulet", "haut de cuisse"]),
    ("chicken wing", ["כנפיים", "כנף עוף"], ["aile de poulet", "ailes de poulet"]),
    ("turkey", ["הודו"], ["dinde"]),
    ("turkey breast", ["חזה הודו"], ["blanc de dinde", "escalope de dinde"]),
    ("beef", ["בקר", "בשר בקר"], ["boeuf", "bœuf"]),
    ("ground beef", ["בשר טחון", "טחון"], ["boeuf haché", "steak haché", "viande hachée"]),
    ("steak", ["סטייק", "אנטריקוט"], ["steak", "entrecôte", "bifteck"]),
    ("veal", ["עגל"], ["veau"]),
    ("lamb", ["כבש", "טלה"], ["agneau"]),
    ("pork", ["חזיר"], ["porc"]),
    ("liver", ["כבד"], ["foie"]),
    ("meat", ["בשר"], ["viande"]),
    ("sausage", ["נקניקייה", "נקניקיות", "נקניק"], ["saucisse", "saucisson"]),
    ("ham", ["נקניק חזיר"], ["jambon"]),
    ("pastrami", ["פסטרמה"], ["pastrami"]),
    # --- Fish & seafood
    ("fish", ["דג", "דגים"], ["poisson"]),
    ("salmon", ["סלמון"], ["saumon"]),
    ("tuna", ["טונה"], ["thon"]),
    ("cod", ["בקלה", "קוד"], ["cabillaud", "morue"]),
    ("tilapia", ["אמנון", "מושט"], ["tilapia"]),
    ("sardine", ["סרדין", "סרדינים"], ["sardine", "sardines"]),
    ("mackerel", ["מקרל"], ["maquereau"]),
    ("trout", ["פורל", "טרוטה"], ["truite"]),
    ("sea bass", ["לברק"], ["loup de mer"]),
    ("sea bream", ["דניס"], ["dorade", "daurade"]),
    ("shrimp", ["שרימפס"], ["crevette", "crevettes"]),
    # --- Eggs & dairy
    ("egg", ["ביצה", "ביצים"], ["oeuf", "œuf", "oeufs", "œufs"]),
    ("egg white", ["חלבון ביצה", "חלבוני ביצה"], ["blanc d'oeuf", "blanc d'œuf", "blancs d'oeuf"]),
    ("egg yolk", ["חלמון"], ["jaune d'oeuf", "jaune d'œuf"]),
    ("milk", ["חלב"], ["lait"]),
    ("yogurt", ["יוגורט", "יוגורטים"], ["yaourt", "yogourt", "yoghourt"]),
    ("greek yogurt", ["יוגורט יווני"], ["yaourt grec"]),
    ("cheese", ["גבינה", "גבינות"], ["fromage"]),
    ("cottage cheese", ["קוטג'", "קוטג"], ["cottage", "fromage cottage"]),
    ("cream cheese", ["גבינת שמנת", "גבינה לבנה"], ["fromage à tartiner", "fromage frais"]),
    ("feta", ["פטה", "בולגרית", "גבינה בולגרית"], ["feta"]),
    ("mozzarella", ["מוצרלה"], ["mozzarella"]),
    ("parmesan", ["פרמזן"], ["parmesan"]),
    ("butter", ["חמאה"], ["beurre"]),
    ("cream", ["שמנת"], ["crème"]),
    ("sour cream", ["שמנת חמוצה"], ["crème aigre"]),
    ("whey", ["מי גבינה", "אבקת חלבון"], ["lactosérum", "whey"]),
    ("tofu", ["טופו"], ["tofu"]),
    # --- Grains, bread, starches
    ("rice", ["אורז"], ["riz"]),
    ("brown rice", ["אורז מלא"], ["riz complet"]),
    ("white rice", ["אורז לבן"], ["riz blanc"]),
    ("oats", ["שיבולת שועל", "קוואקר"], ["avoine", "flocons d'avoine"]),
    ("bread", ["לחם"], ["pain"]),
    ("whole wheat bread", ["לחם מלא", "לחם חיטה מלאה"], ["pain complet"]),
    ("pita", ["פיתה", "פיתות"], ["pita", "pain pita"]),
    ("tortilla", ["טורטייה", "טורטיה"], ["tortilla"]),
    ("pasta", ["פסטה"], ["pâtes", "pates"]),
    ("spaghetti", ["ספגטי"], ["spaghetti", "spaghettis"]),
    ("noodles", ["אטריות", "נודלס"], ["nouilles"]),
    ("couscous", ["קוסקוס"], ["couscous", "semoule"]),
    ("bulgur", ["בורגול"], ["boulgour"]),
    ("quinoa", ["קינואה"], ["quinoa"]),
    ("buckwheat", ["כוסמת"], ["sarrasin"]),
    ("barley", ["גריסים", "שעורה"], ["orge"]),
    ("corn", ["תירס"], ["maïs", "mais"]),
    ("flour", ["קמח"], ["farine"]),
    ("cereal", ["דגני בוקר", "דגנים"], ["céréales", "cereales"]),
    ("granola", ["גרנולה"], ["granola", "muesli croustillant"]),
    ("crackers", ["קרקרים", "פריכיות"], ["crackers", "galettes"]),
    ("rice cakes", ["פריכיות אורז"], ["galettes de riz"]),
    ("potato", ["תפוח אדמה", "תפוחי אדמה", "תפו\"א", "תפוד"], ["pomme de terre", "pommes de terre", "patate"]),
    ("sweet potato", ["בטטה", "בטטות"], ["patate douce"]),
    # --- Legumes
    ("lentils", ["עדשים", "עדשה"], ["lentilles", "lentille"]),
    ("chickpeas", ["חומוס גרגרים", "גרגרי חומוס"], ["pois chiches", "pois chiche"]),
    ("hummus", ["חומוס"], ["houmous", "hoummous"]),
    ("beans", ["שעועית"], ["haricots", "haricot"]),
    ("black beans", ["שעועית שחורה"], ["haricots noirs"]),
    ("kidney beans", ["שעועית אדומה"], ["haricots rouges"]),
    ("green beans", ["שעועית ירוקה"], ["haricots verts"]),
    ("peas", ["אפונה"], ["petits pois", "pois"]),
    ("soybeans", ["סויה", "פולי סויה"], ["soja", "soya"]),
    ("edamame", ["אדממה"], ["edamame"]),
    ("fava beans", ["פול"], ["fèves", "feves"]),
    ("falafel", ["פלאפל"], ["falafel"]),
    # --- Vegetables
    ("vegetables", ["ירקות", "ירק"], ["légumes", "legumes"]),
    ("tomato", ["עגבנייה", "עגבניה", "עגבניות"], ["tomate", "tomates"]),
    ("cherry tomatoes", ["עגבניות שרי", "שרי"], ["tomates cerises"]),
    ("cucumber", ["מלפפון", "מלפפונים"], ["concombre"]),
    ("lettuce", ["חסה"], ["laitue", "salade verte"]),
    ("spinach", ["תרד"], ["épinards", "epinards"]),
    ("broccoli", ["ברוקולי"], ["brocoli"]),
    ("cauliflower", ["כרובית"], ["chou-fleur", "chou fleur"]),
    ("cabbage", ["כרוב"], ["chou"]),
    ("carrot", ["גזר"], ["carotte", "carottes"]),
    ("onion", ["בצל"], ["oignon", "oignons"]),
    ("garlic", ["שום"], ["ail"]),
    ("bell pepper", ["פלפל", "גמבה", "פלפל אדום"], ["poivron"]),
    ("eggplant", ["חציל", "חצילים"], ["aubergine"]),
    ("zucchini", ["קישוא", "קישואים"], ["courgette"]),
    ("pumpkin", ["דלעת"], ["potiron", "citrouille"]),
    ("butternut squash", ["דלורית"], ["courge butternut", "butternut"]),
    ("mushrooms", ["פטריות", "פטרייה", "שמפיניון"], ["champignons", "champignon"]),
    ("beets", ["סלק"], ["betterave"]),
    ("celery", ["סלרי"], ["céleri", "celeri"]),
    ("kale", ["קייל"], ["chou kale"]),
    ("asparagus", ["אספרגוס"], ["asperge", "asperges"]),
    ("artichoke", ["ארטישוק"], ["artichaut"]),
    ("radish", ["צנון", "צנונית"], ["radis"]),
    ("olives", ["זיתים", "זית"], ["olives", "olive"]),
    ("parsley", ["פטרוזיליה"], ["persil"]),
    # --- Fruit
    ("fruit", ["פרי", "פירות"], ["fruit", "fruits"]),
    ("apple", ["תפוח", "תפוח עץ", "תפוחים"], ["pomme", "pommes"]),
    ("banana", ["בננה", "בננות"], ["banane", "bananes"]),
    ("orange", ["תפוז", "תפוזים"], ["orange", "oranges"]),
    ("clementine", ["קלמנטינה", "קלמנטינות"], ["clémentine", "clementine", "mandarine"]),
    ("grapefruit", ["אשכולית"], ["pamplemousse"]),
    ("lemon", ["לימון"], ["citron"]),
    ("grapes", ["ענבים"], ["raisin", "raisins"]),
    ("strawberries", ["תותים", "תות", "תות שדה"], ["fraises", "fraise"]),
    ("blueberries", ["אוכמניות"], ["myrtilles", "bleuets"]),
    ("watermelon", ["אבטיח"], ["pastèque", "pasteque"]),
    ("melon", ["מלון"], ["melon"]),
    ("mango", ["מנגו"], ["mangue"]),
    ("pineapple", ["אננס"], ["ananas"]),
    ("pear", ["אגס", "אגסים"], ["poire"]),
    ("peach", ["אפרסק"], ["pêche", "peche"]),
    ("plum", ["שזיף", "שזיפים"], ["prune"]),
    ("kiwi", ["קיווי"], ["kiwi"]),
    ("pomegranate", ["רימון"], ["grenade"]),
    ("figs", ["תאנים", "תאנה"], ["figues", "figue"]),
    ("dates", ["תמרים", "תמר"], ["dattes", "datte"]),
    ("raisins", ["צימוקים"], ["raisins secs"]),
    ("avocado", ["אבוקדו"], ["avocat"]),
    ("cherries", ["דובדבנים", "דובדבן"], ["cerises", "cerise"]),
    ("apricot", ["משמש"], ["abricot"]),
    # --- Nuts, seeds, fats
    ("nuts", ["אגוזים", "אגוז"], ["noix", "fruits à coque"]),
    ("almonds", ["שקדים", "שקד"], ["amandes", "amande"]),
    ("walnuts", ["אגוזי מלך", "אגוז מלך"], ["noix de grenoble"]),
    ("cashews", ["קשיו"], ["noix de cajou", "cajou"]),
    ("pistachios", ["פיסטוקים", "פיסטוק"], ["pistaches", "pistache"]),
    ("peanuts", ["בוטנים", "בוטן"], ["cacahuètes", "cacahuetes", "arachides"]),
    ("peanut butter", ["חמאת בוטנים"], ["beurre de cacahuète", "beurre de cacahuete", "beurre d'arachide"]),
    ("hazelnuts", ["אגוזי לוז"], ["noisettes"]),
    ("pecans", ["פקאן"], ["noix de pécan"]),
    ("sesame", ["שומשום"], ["sésame", "sesame"]),
    ("tahini", ["טחינה"], ["tahini", "tahin", "crème de sésame"]),
    ("chia seeds", ["צ'יה", "זרעי צ'יה"], ["graines de chia", "chia"]),
    ("flaxseed", ["פשתן", "זרעי פשתן"], ["graines de lin", "lin"]),
    ("sunflower seeds", ["גרעיני חמנייה", "גרעינים"], ["graines de tournesol"]),
    ("pumpkin seeds", ["גרעיני דלעת"], ["graines de courge"]),
    ("olive oil", ["שמן זית"], ["huile d'olive"]),
    ("oil", ["שמן"], ["huile"]),
    ("canola oil", ["שמן קנולה"], ["huile de colza"]),
    ("coconut", ["קוקוס"], ["noix de coco", "coco"]),
    ("mayonnaise", ["מיונז"], ["mayonnaise"]),
    # --- Other
    ("honey", ["דבש"], ["miel"]),
    ("sugar", ["סוכר"], ["sucre"]),
    ("chocolate", ["שוקולד"], ["chocolat"]),
    ("dark chocolate", ["שוקולד מריר"], ["chocolat noir"]),
    ("jam", ["ריבה"], ["confiture"]),
    ("soup", ["מרק"], ["soupe"]),
    ("salad", ["סלט"], ["salade"]),
    ("juice", ["מיץ"], ["jus"]),
    ("coffee", ["קפה"], ["café", "cafe"]),
    ("pizza", ["פיצה"], ["pizza"]),
    ("schnitzel", ["שניצל"], ["escalope panée"]),
    ("shakshuka", ["שקשוקה"], ["chakchouka"]),
    ("popcorn", ["פופקורן"], ["pop-corn", "popcorn"]),
]

# Qualifiers used in USDA descriptions ("Chicken, breast, raw").
QUALIFIERS: Dict[str, Tuple[str, str]] = {
    "raw": ("נא", "cru"),
    "cooked": ("מבושל", "cuit"),
    "boiled": ("מבושל", "bouilli"),
    "roasted": ("צלוי", "rôti"),
    "grilled": ("צלוי על הגריל", "grillé"),
    "baked": ("אפוי", "cuit au four"),
    "fried": ("מטוגן", "frit"),
    "steamed": ("מאודה", "vapeur"),
    "dried": ("מיובש", "séché"),
    "dry": ("יבש", "sec"),
    "canned": ("משומר", "en conserve"),
    "frozen": ("קפוא", "surgelé"),
    "fresh": ("טרי", "frais"),
    "whole": ("שלם", "entier"),
    "breast": ("חזה", "blanc"),
    "thigh": ("ירך", "cuisse"),
    "skinless": ("ללא עור", "sans peau"),
    "boneless": ("ללא עצם", "désossé"),
    "lean": ("רזה", "maigre"),
    "nonfat": ("0% שומן", "0% MG"),
    "low fat": ("דל שומן", "allégé"),
    "lowfat": ("דל שומן", "allégé"),
    "unsalted": ("ללא מלח", "sans sel"),
    "plain": ("טבעי", "nature"),
    "white": ("לבן", "blanc"),
    "brown": ("מלא", "complet"),
    "whole wheat": ("מחיטה מלאה", "complet"),
    "drained": ("מסונן", "égoutté"),
    "in water": ("במים", "au naturel"),
    "light": ("קל", "léger"),
}

_HEB = re.compile(r"[֐-׿]")


def fold(text: str) -> str:
    """Lowercase, strip accents / geresh / quotes, collapse spaces."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("’", "'")
    text = re.sub(r"[\"`׳״]", "", text)
    text = re.sub(r"[^\w\s'֐-׿-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _build_index() -> Tuple[Dict[str, str], Dict[str, Tuple[str, str]]]:
    to_en: Dict[str, str] = {}
    from_en: Dict[str, Tuple[str, str]] = {}
    for en, he_forms, fr_forms in ENTRIES:
        from_en[en] = (he_forms[0], fr_forms[0])
        for form in he_forms + fr_forms:
            to_en.setdefault(fold(form).replace("'", ""), en)
            to_en.setdefault(fold(form), en)
    for en, (he, fr) in QUALIFIERS.items():
        to_en.setdefault(fold(he), en)
        to_en.setdefault(fold(fr), en)
    to_en.setdefault("cuits", "cooked")
    to_en.setdefault("cuites", "cooked")
    to_en.setdefault("crue", "raw")
    to_en.setdefault("crus", "raw")
    to_en.setdefault("complete", "whole wheat")
    to_en.setdefault("completes", "whole wheat")
    to_en.setdefault("מבושלת", "cooked")
    to_en.setdefault("מבושלים", "cooked")
    to_en.setdefault("אפויה", "baked")
    to_en.setdefault("צלויה", "roasted")
    return to_en, from_en


_TO_EN, _FROM_EN = _build_index()
_MAX_PHRASE = 4


def is_hebrew(text: str) -> bool:
    return bool(_HEB.search(text or ""))


def translate_query(query: str) -> Tuple[Optional[str], bool]:
    """Translate a he/fr food query to English.

    Returns (english_query or None, changed). Latin words that are not in the
    dictionary are kept (they are probably English already); unknown Hebrew
    words are dropped. Returns None when nothing usable is left.
    """
    words = fold(query).split()
    if not words:
        return None, False
    out: List[str] = []
    changed = False
    i = 0
    while i < len(words):
        hit = None
        for size in range(min(_MAX_PHRASE, len(words) - i), 0, -1):
            phrase = " ".join(words[i:i + size])
            candidates = [phrase, phrase.replace("'", "")]
            # Hebrew prefixes: ה (the), ו (and), ב (in), מ (from)
            if size == 1 and is_hebrew(phrase) and len(phrase) > 2 and phrase[0] in "הובמ":
                candidates.append(phrase[1:])
            # French plurals: "tomates" -> "tomate"
            if size == 1 and not is_hebrew(phrase) and len(phrase) > 3 and phrase.endswith("s"):
                candidates.append(phrase[:-1])
            for cand in candidates:
                if cand in _TO_EN:
                    hit = (_TO_EN[cand], size)
                    break
            if hit:
                break
        if hit:
            if hit[0] not in out:
                out.append(hit[0])
            changed = True
            i += hit[1]
            continue
        word = words[i]
        if not is_hebrew(word) and not word.isdigit():
            out.append(word)
        elif word.isdigit():
            pass  # "5%" style fat levels are not useful for USDA
        i += 1
    if not out:
        return None, changed
    # Drop a generic word when a more specific phrase contains it ("chicken" + "chicken breast").
    final = [w for w in out if not any(w != o and w in o.split() for o in out)]
    return " ".join(final), changed


def name_for(en_text: str, lang: str) -> Optional[str]:
    """Hebrew / French name for an English USDA description, when the main food is known.

    "Chicken, breast, boneless, skinless, raw" -> "עוף, חזה, ללא עצם, ללא עור, נא".
    Unknown qualifiers are dropped; returns None when the first segment is unknown.
    """
    if lang not in ("he", "fr") or not en_text:
        return None
    idx = 0 if lang == "he" else 1
    segments = [s.strip().lower() for s in en_text.split(",") if s.strip()]
    if not segments:
        return None
    head = segments[0]
    # Try "chicken breast" from the first two segments, then the first one alone.
    pair = f"{segments[0]} {segments[1]}" if len(segments) > 1 else None
    out: List[str] = []
    rest = segments[1:]
    rpair = f"{segments[1]} {segments[0]}" if len(segments) > 1 else None
    singular = re.sub(r"(oes|es|s)$", lambda m: "o" if m.group(1) == "oes" else "", head)
    if pair and pair in _FROM_EN:
        out.append(_FROM_EN[pair][idx])
        rest = segments[2:]
    elif rpair and rpair in _FROM_EN:  # "Oil, olive" -> "olive oil"
        out.append(_FROM_EN[rpair][idx])
        rest = segments[2:]
    elif head in _FROM_EN:
        out.append(_FROM_EN[head][idx])
    elif singular in _FROM_EN:
        out.append(_FROM_EN[singular][idx])
    else:
        return None
    for seg in rest[:4]:
        if seg in QUALIFIERS:
            out.append(QUALIFIERS[seg][idx])
        elif seg in _FROM_EN:
            out.append(_FROM_EN[seg][idx])
    # De-duplicate while keeping order
    seen: List[str] = []
    for part in out:
        if part not in seen:
            seen.append(part)
    return ", ".join(seen)


def dictionary_size() -> int:
    return len(ENTRIES)
