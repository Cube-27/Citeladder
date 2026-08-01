# Generation receipts: proof that the backend produced a prompt's text.
#
# The onboarding flow generates prompts from verified brand-website evidence
# and then persists them through the ordinary manual-create endpoint. Those
# prompts must skip the topical-binding gate — binding is word-overlap against
# the project's stored vocabulary, and a correct measurement prompt is
# brand-NEUTRAL by design (the same text is run for the brand AND its
# competitors, so a prompt naming the brand measures nothing). Correct prompts
# therefore bind only on category wording, and legitimate synonyms
# ("agencies offering experimentation services" vs "digital marketing") share
# no literal token.
#
# But ``origin`` arrives in the request body, so a client could simply claim
# ``generated`` and bypass the gate for arbitrary text. A receipt closes that:
# the suggestion endpoints return an HMAC over each prompt's NORMALIZED text,
# and ``create_prompt`` honours the exemption only when the receipt verifies.
# Forging one requires the signing secret, so the gate still holds for every
# text the backend did not itself generate.
#
# Scope is deliberately the text alone — not the workspace or prompt set. The
# receipt asserts exactly one thing: "this agent, grounded in evidence,
# produced this string." Replaying it in another workspace still only admits a
# string the backend generated, which is the property being protected.
from __future__ import annotations

import hmac
from hashlib import sha256

from app.core.config import settings
from app.domain.prompts.normalization import prompt_text_hash

# Domain separation: this key must never collide with another HMAC use of the
# same secret.
_RECEIPT_CONTEXT = b"searchify.prompt-generation-receipt.v1"


def issue_prompt_receipt(text: str) -> str:
    """Mint a receipt proving the backend generated ``text``.

    Keyed on the normalized text hash (the same canonical form the DB uniqueness
    constraint uses), so trivial whitespace/case edits do not invalidate a
    receipt while a genuine text change does.
    """
    message = _RECEIPT_CONTEXT + prompt_text_hash(text).encode("ascii")
    return hmac.new(
        settings.jwt_secret_key.encode("utf-8"), message, sha256
    ).hexdigest()


def verify_prompt_receipt(text: str, receipt: str | None) -> bool:
    """Whether ``receipt`` is a valid backend-issued receipt for ``text``.

    Constant-time comparison; a missing or malformed receipt is simply False
    (the caller then applies the ordinary binding gate).
    """
    if not receipt:
        return False
    return hmac.compare_digest(issue_prompt_receipt(text), str(receipt))
