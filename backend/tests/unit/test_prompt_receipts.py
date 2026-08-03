"""Generation receipts are scoped to their exact persistence destination."""

import uuid

from app.domain.prompts.receipts import issue_prompt_receipt, verify_prompt_receipt


def test_prompt_receipt_verifies_all_bound_values() -> None:
    workspace_id = uuid.uuid4()
    project_id = uuid.uuid4()
    prompt_set_id = uuid.uuid4()
    text = "Which analytics platforms support attribution?"
    receipt = issue_prompt_receipt(
        workspace_id=workspace_id,
        project_id=project_id,
        prompt_set_id=prompt_set_id,
        cohort="core",
        text=text,
    )

    assert verify_prompt_receipt(
        workspace_id=workspace_id,
        project_id=project_id,
        prompt_set_id=prompt_set_id,
        cohort="core",
        text=text,
        receipt=receipt,
    )


def test_prompt_receipt_rejects_changed_binding() -> None:
    workspace_id = uuid.uuid4()
    project_id = uuid.uuid4()
    prompt_set_id = uuid.uuid4()
    text = "Which analytics platforms support attribution?"
    receipt = issue_prompt_receipt(
        workspace_id=workspace_id,
        project_id=project_id,
        prompt_set_id=prompt_set_id,
        cohort="core",
        text=text,
    )

    assert not verify_prompt_receipt(
        workspace_id=uuid.uuid4(),
        project_id=project_id,
        prompt_set_id=prompt_set_id,
        cohort="core",
        text=text,
        receipt=receipt,
    )
    assert not verify_prompt_receipt(
        workspace_id=workspace_id,
        project_id=uuid.uuid4(),
        prompt_set_id=prompt_set_id,
        cohort="core",
        text=text,
        receipt=receipt,
    )
    assert not verify_prompt_receipt(
        workspace_id=workspace_id,
        project_id=project_id,
        prompt_set_id=uuid.uuid4(),
        cohort="core",
        text=text,
        receipt=receipt,
    )
    assert not verify_prompt_receipt(
        workspace_id=workspace_id,
        project_id=project_id,
        prompt_set_id=prompt_set_id,
        cohort="comparison",
        text=text,
        receipt=receipt,
    )
    assert not verify_prompt_receipt(
        workspace_id=workspace_id,
        project_id=project_id,
        prompt_set_id=prompt_set_id,
        cohort="core",
        text="Which commerce platform is best?",
        receipt=receipt,
    )
