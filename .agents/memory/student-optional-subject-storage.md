---
name: Student optional-subject persistence
description: Backward-compatible storage rules for student subject selections.
---

Store selected optional subjects in the active-term student record. Existing school databases may have older normalized table shapes even when the current migration defines a `subjects` column.

**Why:** Requiring a schema rollout can block student creation for schools still using an older database shape.

**How to apply:** Create, list, and dashboard paths should preserve the active-term selection when a normalized student row has no populated subjects. Do not add a database-column dependency without a rollout plan.
