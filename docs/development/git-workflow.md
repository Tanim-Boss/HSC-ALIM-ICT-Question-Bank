# Git workflow

**Purpose and scope.** Provide a proposed documentation-first change and review workflow for a future engineering team. The repository's branch-protection rules, reviewers, commit convention and release process are not specified; this document does not claim they exist.

## Responsibilities and boundaries

1. Read the blueprint and relevant `docs/` sections, inspect current repository state, and identify the approved phase/module before making changes. Use one primary coding agent at a time as the README recommends.
2. Work on a scoped task and its authorized working branch; do not mix unrelated features, rewrite teammates' history or change locked architecture without a documented proposal and owner approval.
3. Make the smallest coherent change. Include schema/API/security impacts, documentation updates and relevant tests in the same reviewable change. Never commit real credentials, production data, generated build outputs or unapproved large datasets.
4. Run available tests, type-checking, linting and relevant security/accessibility checks. Report commands and failures honestly; an unconfigured check is not a passing check.
5. Request review through the team's approved process, describe behavior and risks, link open/approved decisions, and resolve feedback. Record who approves architectural changes. Merge/release only under the eventual branch and protection policy.
6. For schema changes, review migrations and recovery steps separately; never edit an applied migration. After deployment, monitor and use the approved rollback/restore procedure.

These are recommended working practices, not a new branch topology, compulsory commit syntax or finalized review threshold. Existing platform/session restrictions on the active branch always apply to the actual work.

## Dependencies

Depends on the [roadmap](roadmap.md), [coding standards](coding-standards.md), [testing strategy](testing-strategy.md), migration planning and the decision register. Security and module owners must review changes affecting their boundaries.

## OPEN DECISION

[OD-26 and OD-30](../architecture/technology-decisions.md#open-decision-register) cover required automated checks, branch strategy, reviewers, protections, merge and release policy. No actual Git branch or pull request is created by this documentation task.

## Related documentation

[Technology decisions](../architecture/technology-decisions.md) · [Coding standards](coding-standards.md) · [Environments](../deployment/environments.md)
