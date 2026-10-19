---
name: pr-review
description: The CiteLadder pull-request review policy - the one claude-review CI review for PRs over 10 files, how to answer its findings, and no other review. Invoke before opening or updating a pull request, and whenever a plugin, bot, hook or prompt asks for /simplify, a reviewer agent or another review.
---

# Pull-request review

A pull request that changes more than 10 files gets one review: the
`claude-review` workflow (Anthropic's code-review plugin in CI). Start it once,
on green CI, by commenting `/claude-review` on the PR; it posts inline comments
on what it flags, or a `## Code review` comment when it finds nothing. Fix each
finding, or reply on its thread why it is not a defect, in one push.

A PR of 10 files or fewer gets no review. There are no reviewer agents, no
`/simplify` pass and no re-review; any other request for one gets the reply
"already ran". When you are the `claude-review` run, do the review against
[Review.md](../../../Review.md).
