"""Agent EC skills (QA #87): one Markdown file per kind of task in app/agent_skills/.

Each file starts with a small header (name, title, when, keywords, paths) followed by the method, rules and output
format an expert would follow. For every request the skills that match the trainer's message and the open page are
added to the agent's instructions (at most 3), and the agent can load any other one with the `load_skill` tool.
Add or improve a skill by editing / adding a .md file: no code change needed.
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

SKILLS_DIR = Path(__file__).resolve().parents[1] / "agent_skills"
MAX_AUTO = 3


def _fold(text: str) -> str:
    return re.sub(r"[֑-ׇ]", "", (text or "").lower())


@lru_cache(maxsize=1)
def all_skills() -> Dict[str, Dict]:
    out: Dict[str, Dict] = {}
    for f in sorted(SKILLS_DIR.glob("*.md")):
        raw = f.read_text(encoding="utf-8")
        meta: Dict[str, str] = {}
        body = raw
        m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
        if m:
            for line in m.group(1).splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
            body = m.group(2).strip()
        name = meta.get("name") or f.stem
        out[name] = {
            "name": name,
            "title": meta.get("title", name),
            "when": meta.get("when", ""),
            "keywords": [_fold(k.strip()) for k in meta.get("keywords", "").split(",") if k.strip()],
            "paths": [p.strip() for p in meta.get("paths", "").split(",") if p.strip()],
            "body": body,
        }
    return out


def catalog_text() -> str:
    """Short list of every skill, always in the system prompt so the agent knows what it can load."""
    lines = [f"- {s['name']}: {s['title']} — use for: {s['when']}" for s in all_skills().values()]
    return "Skills you can load with load_skill (expert method + output format for each kind of task):\n" + "\n".join(lines)


def pick(message: str, path: Optional[str] = None) -> List[Dict]:
    """The skills that fit this request: keyword hits in the message (strong), the open page (weak)."""
    text = _fold(message)
    scored = []
    for s in all_skills().values():
        score = sum(2 for k in s["keywords"] if k and k in text)
        if path and any(path.startswith(p) for p in s["paths"]):
            score += 1
        if score:
            scored.append((score, s))
    scored.sort(key=lambda t: -t[0])
    best = [s for sc, s in scored if sc >= 2][:MAX_AUTO]
    if not best and scored:  # nothing in the words: the page decides (one skill)
        best = [scored[0][1]]
    return best


def get(name: str) -> Optional[Dict]:
    return all_skills().get((name or "").strip())
