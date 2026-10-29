---
name: Narrow school configuration updates
description: Avoid oversized full-configuration writes from the browser.
---

School configuration contains nested student and mark data, so small changes should use narrow API requests that read, merge, and write the affected settings on the server. Do not send the entire school configuration from the browser. Term actions should remain term-specific; closing the active term updates its status and advances the active term in one server-side write, while activation updates the shared active-term value immediately.

**Why:** Full configuration requests can exceed the API request-body limit, making ordinary settings such as deadlines appear not to save.

**How to apply:** For settings and term changes, send only the changed fields, merge them into the latest server-side configuration, and refresh school-scoped queries after success.
