# TASK-010a evidence

The health endpoint was exercised with `node evidence/TASK-010a/health-check.cjs`.
That script starts the real server with `--env-file=.env`, requests the live
endpoint, and separately closes a SQLite connection to verify the handler's
database-error response.

