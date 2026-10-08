# Working principles

- **Iterative atomic commits:** commit small, coherent, independently
  understandable increments as work progresses; do not wait until the entire
  task is finished or mix unrelated changes.
- Before each commit, review the complete staged diff and run the smallest
  relevant verification. Keep the worktree organized so each commit is
  independently understandable.
- Inspect the repository before modifying it.
- Prefer the smallest change that satisfies the requirement.
- Preserve existing behavior unless explicitly changing it.
- Do not guess when repository state is ambiguous; clarify or document the
  limitation.
- Keep secrets out of source control.
- Review the complete diff before committing.
- Verify behavior after structural changes.
- Keep documentation synchronized with architectural changes.
- Avoid unnecessary abstractions, refactors, dependencies, or infrastructure.
- Make changes easy to review and revert.
