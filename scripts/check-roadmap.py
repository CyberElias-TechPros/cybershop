#!/usr/bin/env python3
"""Validate stable IDs, checklist/CSV status, metadata, references and local links."""
import csv
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
roadmap = ROOT / 'docs/implementation-roadmap.md'
text = roadmap.read_text()
with (ROOT / 'docs/roadmap/tasks.csv').open(newline='') as stream:
    rows = list(csv.DictReader(stream))
items = re.findall(r'^- \[([ x])\] \*\*(R\d{2}\.\d{2}) \[(VERIFIED|CODE|TODO)\]\*\* (.+)$', text, re.M)
assert len(rows) == len(items), 'CSV/checklist task counts differ'
by_id = {row['id']: row for row in rows}
assert len(by_id) == len(rows), 'Duplicate CSV task IDs'
assert len({item[1] for item in items}) == len(items), 'Duplicate checklist task IDs'
states = {'VERIFIED': 'verified-local', 'CODE': 'code-present', 'TODO': 'todo'}
for box, task_id, state, task in items:
    row = by_id[task_id]
    assert row['task'] == task, f'Task text mismatch: {task_id}'
    assert row['state'] == states[state], f'State mismatch: {task_id}'
    assert (box == 'x') == (state != 'TODO'), f'Checkbox mismatch: {task_id}'
    for field in ['accountable_roles', 'depends_on_package', 'purpose', 'uses_connects_to', 'acceptance_package']:
        assert row[field], f'Missing {field}: {task_id}'
    if state != 'TODO':
        assert row['evidence'], f'Checked task missing evidence: {task_id}'
for task_id in re.findall(r'R\d{2}\.\d{2}', text):
    assert task_id in by_id, f'Broken task reference: {task_id}'

for filename in ['README.md', 'docs/implementation-roadmap.md', 'docs/roadmap/progress.md', 'docs/production.md', 'docs/operations/release-safety.md']:
    path = ROOT / filename
    source = path.read_text()
    for link in re.findall(r'\]\(([^)]+)\)', source):
        if '://' in link or link.startswith('#'):
            continue
        assert (path.parent / link.split('#')[0]).exists(), f'Broken local link: {filename}: {link}'
print(f'PASS: {len(rows)} matching unique roadmap/CSV tasks with consistent states, evidence, metadata and local links.')
