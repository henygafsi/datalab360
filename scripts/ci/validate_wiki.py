#!/usr/bin/env python3
"""Validate the Obsidian docs vault (docs/**/*.md).

Rules:
  1. Every note has YAML frontmatter with a non-empty `tags:` list.
  2. Every [[wikilink]] resolves to a local note stem or a name listed in
     docs/.external-notes (notes living in the sibling repo / vault root).

Exit code = number of violating files. Run: python3 scripts/ci/validate_wiki.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parents[2] / "docs"
WIKILINK = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")


def frontmatter_tags(text: str) -> list[str]:
    if not text.startswith("---"):
        return []
    end = text.find("\n---", 3)
    if end == -1:
        return []
    head = text[3:end]
    m = re.search(r"^tags:\s*\[([^\]]*)\]", head, re.M)
    if m:
        return [t.strip() for t in m.group(1).split(",") if t.strip()]
    tags, in_tags = [], False
    for line in head.splitlines():
        if re.match(r"^tags:\s*$", line):
            in_tags = True
            continue
        if in_tags:
            item = re.match(r"^\s+-\s+(\S+)", line)
            if item:
                tags.append(item.group(1))
            else:
                in_tags = False
    return tags


def main() -> int:
    if not DOCS.is_dir():
        print(f"no docs/ directory at {DOCS} — nothing to validate")
        return 0
    notes = sorted(DOCS.rglob("*.md"))
    local = {p.stem for p in notes}
    external_file = DOCS / ".external-notes"
    external = set()
    if external_file.exists():
        external = {
            line.strip()
            for line in external_file.read_text().splitlines()
            if line.strip() and not line.startswith("#")
        }
    known = local | external

    bad = 0
    for note in notes:
        text = note.read_text(encoding="utf-8")
        problems = []
        if not frontmatter_tags(text):
            problems.append("missing/empty frontmatter tags")
        for target in WIKILINK.findall(text):
            if target.strip() not in known:
                problems.append(f"broken wikilink [[{target.strip()}]]")
        if problems:
            bad += 1
            rel = note.relative_to(DOCS.parent)
            for p in problems:
                print(f"FAIL {rel}: {p}")
    print(f"validate_wiki: {len(notes)} notes checked, {bad} failing")
    return bad


if __name__ == "__main__":
    sys.exit(main())
