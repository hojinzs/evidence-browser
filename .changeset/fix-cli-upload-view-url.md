---
"evidence-browser-cli": patch
---

Fix `eb upload` view URL to include the `/b/` segment so the printed link actually opens the bundle page, and accept snake_case `bundle_id` in the upload response for compatibility with newer API versions.
