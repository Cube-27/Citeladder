"""One offline batch invocation of the production native scorer."""

import asyncio
import json
from pathlib import Path

from app.core.config.measurement import MEASUREMENT_SCORING_SUBJECT

_NATIVE_SCORER = (
    Path(__file__).resolve().parents[3]
    / "frontend/services/api/src/cli/score-measurement.ts"
)


async def score_fixtures(items):
    process = await asyncio.create_subprocess_exec(
        "node",
        str(_NATIVE_SCORER),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    output, _ = await process.communicate(
        json.dumps(
            {"configuration": MEASUREMENT_SCORING_SUBJECT, "items": items}
        ).encode("utf-8")
    )
    if process.returncode:
        raise ValueError("Native fixture scoring failed")
    scores = json.loads(output)
    if not isinstance(scores, list) or len(scores) != len(items):
        raise ValueError("Native fixture scoring count mismatch")
    return scores


def scoring_item(envelope, search_enabled, prompt_text):
    events = list(envelope.get("search_events") or [])
    return {
        "answerText": str(envelope.get("answer_text") or ""),
        "promptText": prompt_text,
        "searchEvents": events,
        "citations": list(envelope.get("citations") or []),
        "searchUsed": search_enabled and bool(events),
    }
