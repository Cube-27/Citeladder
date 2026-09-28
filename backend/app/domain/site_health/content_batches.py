"""Bounded request composition; each question points directly at its own state."""

import json
import re
from collections.abc import Iterator

from app.core.config import site_health_content_structure as config


def candidate_batches(candidates: list[dict]) -> Iterator[list[dict]]:
    batch: list[dict] = []
    size = 0
    for candidate in candidates:
        request_size = len(json.dumps(candidate["request"], ensure_ascii=False))
        if batch and (
            len(batch) >= config.CONTENT_STRUCTURE_JUDGMENTS_PER_REQUEST
            or size + request_size > config.CONTENT_STRUCTURE_MAX_REQUEST_CHARS
        ):
            yield batch
            batch, size = [], 0
        batch.append(candidate)
        size += request_size
    if batch:
        yield batch


def batch_request(candidates: list[dict], dispatched: set[str]) -> tuple[dict, dict]:
    state = {"items": [candidate["request"]["state"] for candidate in candidates]}
    questions = {}
    for index, candidate in enumerate(candidates):
        if candidate["id"] not in dispatched:
            continue
        for name, question in candidate["request"]["questions"].items():
            # Question ids aren't sent to the model. Scope the actual instruction,
            # including every explicit path, rather than relying on the answer key.
            instruction = re.sub(
                r"`(source|target|passage|label_source|labels|label|page)([^`]*)`",
                rf"`items[{index}].\1\2`",
                question["instructions"],
            )
            questions[f"{candidate['id']}:{name}"] = {
                **question,
                "instructions": (
                    f"Use only `items[{index}]` for this question. {instruction}"
                ),
            }
    return state, questions
