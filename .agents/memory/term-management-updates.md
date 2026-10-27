---
name: Term management persistence
description: Persist term status and activation without sending all school records from the browser.
---

Term actions must use term-specific API requests instead of replacing the full school configuration from the browser. Closing the active term should update its status and advance the active term in one server-side write. Activating a selected term should update the school's shared active-term value immediately.

**Why:** The full configuration includes student and mark records and can exceed the API request-body limit, causing term controls to appear unresponsive.

**How to apply:** Keep term create, close/reopen, activate, and clear/delete operations on narrow endpoints. Refresh school-scoped queries after a successful mutation and let other sessions observe active-term changes through config refresh.
