"""
Parses a trainer-authored Hebrew nutrition-plan PDF into a draft set of meal options.

PDFs of this kind are produced by exporting a table (meal slot -> numbered options ->
foods + macros) to PDF. The PDF format discards the table's row/column structure, so a
text extractor can only guess reading order from character position. For this house
style (confirmed against real files) that guess is good enough for:
  - meal slot names and option boundaries (clean, line-anchored)
  - the trailing macro blob per option (digits only, decodable - see split_macro_blob)
but NOT good enough for the individual food/ingredient descriptions inside an option,
which come out with numbers pulled out of their original word position. Those are
captured verbatim as reference text for a human to read, never auto-split.

Pure functions only - no DB/FastAPI imports - so this module is testable standalone.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


class PdfParseError(Exception):
    """Raised when the PDF itself can't be read (encrypted, scanned, empty)."""


@dataclass
class ParsedOption:
    index: int  # 1-based, as printed ("1.", "2." ...)
    name_hebrew_raw: str
    raw_text_lines: List[str] = field(default_factory=list)
    macro_blob: Optional[str] = None

    @property
    def raw_ingredient_text(self) -> str:
        return "\n".join(self.raw_text_lines)

    @property
    def macro_candidates(self) -> List[Tuple[int, int, int, int]]:
        if not self.macro_blob:
            return []
        return split_macro_blob(self.macro_blob)

    @property
    def resolved_macros(self) -> Optional[Tuple[int, int, int, int]]:
        if not self.macro_blob:
            return None
        return resolve_macro_blob(self.macro_blob)


@dataclass
class ParsedSlot:
    raw_name: str
    options: List[ParsedOption] = field(default_factory=list)


@dataclass
class ParsedMenu:
    slots: List[ParsedSlot] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    # (protein, carbs, fat, calories) for the whole day, from the PDF's header line.
    # None when that line isn't found/parseable - the caller must not guess a plan's
    # daily targets, only ever offer what the PDF actually stated.
    daily_targets: Optional[Tuple[int, int, int, int]] = None
    # Per-meal (protein, carbs, fat, calories) from the חלוקה יומית breakdown table,
    # keyed by the same raw meal name used in ParsedSlot.raw_name (e.g. "ארוחת בוקר").
    # Only the 4 option-bearing meals are included - קפה בוקר and the סה"כ יומי grand
    # total are deliberately not parsed (different digit shapes, out of scope).
    meal_targets: Dict[str, Tuple[int, int, int, int]] = field(default_factory=dict)


MEAL_HEADER_RE = re.compile(r"^(ארוחת (?:בוקר|צהריים|ביניים|ערב))\s*$")
OPTION_HEADER_RE = re.compile(r"^(\d+)[.''`]\s*(.+)$")
# Minimum 3 digits (1 each for protein/carbs/fat) + 3 for calories = 6; max 2+2+2+3 = 9.
# The macro blob is usually its own line, but can also be glued onto the end of the last
# ingredient line with no separator - so this matches a trailing run of 6-9 digits
# anywhere at the end of a line, not just a line that's only digits.
MACRO_BLOB_RE = re.compile(r"^(?P<prefix>.*?)(?P<blob>\d{6,9})$")
COLUMN_HEADER_RE = re.compile(r"^אופציה\s*מה\s*אוכלים\s*חלבון\s*פחמימה\s*שומן\s*קלוריות$")
DAILY_BREAKDOWN_HEADER_RE = re.compile(r"^חלוקה יומית$")
STOP_SECTION_RE = re.compile(r"^(טבלת החלפות|כללים חשובים)")
FOOTER_RE = re.compile(r"^ECSHAPE\b")


def split_macro_blob(blob: str) -> List[Tuple[int, int, int, int]]:
    """
    Returns every valid (protein, carbs, fat, calories) split of a concatenated digit
    blob. Calories is always the trailing 3 digits (confirmed from the table's column
    order: חלבון=protein, פחמימה=carbs, שומן=fat, קלוריות=calories, calories always 3
    digits in this plan's calorie range). The remaining digits are tried as every way to
    split into 3 groups of 1-2 digits each (protein, carbs, fat). Most rows resolve to
    exactly one valid split; a fat value under 10 produces multiple candidates - see
    resolve_macro_blob for picking the right one automatically.
    """
    n = len(blob)
    results: List[Tuple[int, int, int, int]] = []
    cal_len = 3
    if n - cal_len < 3:
        return results
    cal = blob[n - cal_len:]
    rest = blob[: n - cal_len]
    rl = len(rest)
    for p_len in (1, 2):
        for c_len in (1, 2):
            f_len = rl - p_len - c_len
            if f_len < 1 or f_len > 2:
                continue
            p = rest[:p_len]
            c = rest[p_len : p_len + c_len]
            f = rest[p_len + c_len :]
            results.append((int(p), int(c), int(f), int(cal)))
    return results


def resolve_macro_blob(blob: str) -> Optional[Tuple[int, int, int, int]]:
    """
    Picks the single most plausible (protein, carbs, fat, calories) split for a blob,
    so ambiguity never needs to be surfaced as a choice to a human.

    When split_macro_blob returns more than one candidate (always a case where the fat
    digit group could be 1 or 2 digits), the correct one is picked using the standard
    4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat estimate: the candidate whose
    estimated calories is closest to the blob's own stated calories wins. Verified
    against all 3 ambiguous rows found in real client PDFs during testing: the correct
    candidate's estimate is within 5 kcal of the stated total, every wrong candidate is
    off by 580+ kcal - a decisive, non-borderline signal, not a coin flip.
    """
    candidates = split_macro_blob(blob)
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    return min(
        candidates,
        key=lambda c: abs(4 * c[0] + 4 * c[1] + 9 * c[2] - c[3]),
    )


# Matches the daily-targets header line, e.g. (as actually extracted from a real file):
# "2120 קלוריות   חלבון |   170    פחמימה|   ' ג180    שומן|   ' ג80' ג" - garbled
# spacing/punctuation, but each number is directly labeled rather than glued, so each
# value is found independently instead of trying to parse the line as one structure.
_DAILY_CALORIES_RE = re.compile(r"(\d+)\s*קלוריות")
_DAILY_PROTEIN_RE = re.compile(r"חלבון\D*?(\d+)")
_DAILY_CARBS_RE = re.compile(r"פחמימה\D*?(\d+)")
_DAILY_FAT_RE = re.compile(r"שומן\D*?(\d+)")

# A חלוקה יומית table row: meal name immediately followed by its glued macro digits,
# e.g. "ארוחת בוקר434617510" (no space, unlike the bare MEAL_HEADER_RE match used while
# walking meal-option content). Reuses the same 4 meal names and the same digit-length
# bounds as MACRO_BLOB_RE/split_macro_blob.
_DAILY_MEAL_ROW_RE = re.compile(r"^(ארוחת (?:בוקר|צהריים|ביניים|ערב))(\d{6,9})$")


def _parse_daily_targets(full_text: str) -> Optional[Tuple[int, int, int, int]]:
    """
    Extracts (protein, carbs, fat, calories) for the whole day from the PDF's header
    line. Searches the full text once rather than line-by-line, since the extractor can
    wrap this header across more than one line. Returns None if any of the four values
    isn't found - never guesses a partial result.
    """
    cal = _DAILY_CALORIES_RE.search(full_text)
    protein = _DAILY_PROTEIN_RE.search(full_text)
    carbs = _DAILY_CARBS_RE.search(full_text)
    fat = _DAILY_FAT_RE.search(full_text)
    if not (cal and protein and carbs and fat):
        return None
    return (int(protein.group(1)), int(carbs.group(1)), int(fat.group(1)), int(cal.group(1)))


def _parse_meal_targets(full_text: str) -> Dict[str, Tuple[int, int, int, int]]:
    """
    Extracts per-meal (protein, carbs, fat, calories) from the חלוקה יומית breakdown
    table, keyed by raw meal name. Only matches the 4 option-bearing meal names; קפה
    בוקר (different row shape) and סה"כ יומי (12-digit blob, doesn't fit the 3-digit-
    calories assumption) are intentionally not parsed.
    """
    targets: Dict[str, Tuple[int, int, int, int]] = {}
    for raw_line in full_text.split("\n"):
        line = raw_line.strip()
        match = _DAILY_MEAL_ROW_RE.match(line)
        if not match:
            continue
        resolved = resolve_macro_blob(match.group(2))
        if resolved:
            targets[match.group(1)] = resolved
    return targets


def _finalize_option(
    option: Optional[ParsedOption], slot: Optional[ParsedSlot], warnings: List[str]
) -> None:
    if option is None or slot is None:
        return
    if not option.macro_blob:
        warnings.append(
            f"Option '{option.name_hebrew_raw}' in {slot.raw_name} has no parseable macro line"
        )
    slot.options.append(option)


def parse_menu_text(full_text: str) -> ParsedMenu:
    """
    Core parser, operating on already-extracted text (all pages joined with "\\n").
    Split out from parse_menu_pdf_bytes so it can be unit-tested without a real PDF file.
    """
    slots: List[ParsedSlot] = []
    warnings: List[str] = []

    current_slot: Optional[ParsedSlot] = None
    current_option: Optional[ParsedOption] = None
    stopped = False

    for raw_line in full_text.split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        if stopped:
            break
        if FOOTER_RE.match(line):
            continue

        if STOP_SECTION_RE.match(line):
            stopped = True
            _finalize_option(current_option, current_slot, warnings)
            current_option = None
            continue

        if DAILY_BREAKDOWN_HEADER_RE.match(line):
            # The "חלוקה יומית" daily-targets summary table is a different table, not
            # meal content - skip past it entirely rather than misreading it as a slot.
            _finalize_option(current_option, current_slot, warnings)
            current_slot = None
            current_option = None
            continue

        meal_match = MEAL_HEADER_RE.match(line)
        if meal_match:
            _finalize_option(current_option, current_slot, warnings)
            current_option = None
            current_slot = ParsedSlot(raw_name=meal_match.group(1))
            slots.append(current_slot)
            continue

        if current_slot is None:
            # Title, overall-targets paragraph, the "קפה בוקר (קבוע)" fixed-item note,
            # or a row from the חלוקה יומית summary table (DAILY_BREAKDOWN_ROW_RE) -
            # anything before the first real meal header. Not meal option content.
            continue

        collapsed = line.replace(" ", "")
        if COLUMN_HEADER_RE.match(line) or "אופציהמהאוכלים" in collapsed:
            continue  # repeated glued column-header line, including on later pages

        # The macro blob is sometimes its own line, but can also be glued onto the end
        # of an option-header line or an ingredient line with no separator at all. Peel
        # it off the end of the line first (if present) so the option-header/ingredient
        # matching below only ever sees the text portion.
        blob_match = MACRO_BLOB_RE.match(line)
        pending_blob: Optional[str] = None
        if blob_match:
            pending_blob = blob_match.group("blob")
            line = blob_match.group("prefix").strip().rstrip(",").strip()

        option_match = OPTION_HEADER_RE.match(line) if line else None
        if option_match:
            _finalize_option(current_option, current_slot, warnings)
            idx = int(option_match.group(1))
            name = option_match.group(2).strip()
            current_option = ParsedOption(index=idx, name_hebrew_raw=name)
            if pending_blob:
                current_option.macro_blob = pending_blob
                _finalize_option(current_option, current_slot, warnings)
                current_option = None
            continue

        if current_option is None:
            # Stray line before any option started within this meal - ignore.
            continue

        if line:
            # Remaining text portion (if any) is an ingredient description line.
            current_option.raw_text_lines.append(line)

        if pending_blob:
            current_option.macro_blob = pending_blob
            _finalize_option(current_option, current_slot, warnings)
            current_option = None

    _finalize_option(current_option, current_slot, warnings)  # flush a trailing option
    return ParsedMenu(
        slots=slots,
        warnings=warnings,
        daily_targets=_parse_daily_targets(full_text),
        meal_targets=_parse_meal_targets(full_text),
    )


def _extract_lines(raw: bytes) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(raw))
    except Exception as e:
        raise PdfParseError(f"Could not read this file as a PDF: {e}")

    if reader.is_encrypted:
        raise PdfParseError("PDF is password-protected")

    pages_text = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n".join(pages_text)
    if not full_text.strip():
        raise PdfParseError("No extractable text found - this PDF may be a scanned image")
    return full_text


def parse_menu_pdf_bytes(raw: bytes) -> ParsedMenu:
    """Extract text from a PDF's raw bytes, then parse it. Raises PdfParseError on
    unreadable files (encrypted, scanned, corrupt)."""
    full_text = _extract_lines(raw)
    return parse_menu_text(full_text)


# ===== Meal-slot matching =====

HEBREW_MEAL_SYNONYMS = {
    "ארוחת בוקר": ["בוקר", "breakfast"],
    "ארוחת צהריים": ["צהריים", "lunch"],
    "ארוחת ביניים": ["ביניים", "snack"],
    "ארוחת ערב": ["ערב", "dinner"],
}


@dataclass
class SlotMatch:
    raw_name: str
    matched_meal_slot_id: Optional[int]
    match_confidence: str  # "exact" | "fuzzy" | "none"
    candidate_meal_slot_ids: List[int] = field(default_factory=list)


def match_parsed_slots_to_plan(
    parsed_slots: List[ParsedSlot], plan_slots: List[dict]
) -> List[SlotMatch]:
    """
    Match each PDF meal section to one of the plan's actual meal_slots_v2 rows.

    plan_slots: list of {"id": int, "name": str, "order_index": int}.
    Exact name match wins; otherwise a synonym/substring match if unambiguous; otherwise
    every not-yet-claimed plan slot is offered as a candidate for the trainer to pick from.
    """
    results: List[SlotMatch] = []
    used_plan_ids: set = set()

    for ps in parsed_slots:
        exact = next(
            (s for s in plan_slots if s["name"].strip() == ps.raw_name.strip() and s["id"] not in used_plan_ids),
            None,
        )
        if exact:
            results.append(SlotMatch(ps.raw_name, exact["id"], "exact"))
            used_plan_ids.add(exact["id"])
            continue

        synonyms = HEBREW_MEAL_SYNONYMS.get(ps.raw_name, [])
        fuzzy_candidates = [
            s
            for s in plan_slots
            if s["id"] not in used_plan_ids
            and (
                any(syn in s["name"] for syn in synonyms)
                or ps.raw_name in s["name"]
                or s["name"] in ps.raw_name
            )
        ]
        if len(fuzzy_candidates) == 1:
            results.append(SlotMatch(ps.raw_name, fuzzy_candidates[0]["id"], "fuzzy"))
            used_plan_ids.add(fuzzy_candidates[0]["id"])
        elif len(fuzzy_candidates) > 1:
            results.append(
                SlotMatch(ps.raw_name, None, "fuzzy", [c["id"] for c in fuzzy_candidates])
            )
        else:
            remaining = [s["id"] for s in plan_slots if s["id"] not in used_plan_ids]
            results.append(SlotMatch(ps.raw_name, None, "none", remaining))

    return results
