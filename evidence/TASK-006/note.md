# TASK-006 design note

6a: Escape every untrusted string at the five HTML insertion points, and return structured fetch errors so the UI can distinguish connectivity, HTTP status, and malformed JSON.

6b: Use generation tokens for competing location/search requests, accept only fresh cache entries, render cache status on the visible weather description, keep one favorites cache and one button listener, refresh the map URL from state.city on every open, and use Canvas globalAlpha instead of hex suffixes so CSS colors such as oklch remain valid.
