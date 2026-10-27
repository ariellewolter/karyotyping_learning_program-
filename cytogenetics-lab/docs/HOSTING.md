# Free Render pilot

The production entry point is `web.py`; `serve.py` remains the local server.
Student cases and reports remain in browser storage. Browser printing saves PDFs.
The reference SQLite database ships with every release and is opened read-only.

## Publish

1. Review and commit the intended app changes, including `render.yaml` at the repository root and `web.py` and `requirements-web.txt` inside `cytogenetics-lab`. Push the reviewed release to GitHub.
2. Sign into Render, choose New > Blueprint, and connect this repository and the intended branch.
3. Review the proposed service: Free plan, Python runtime, no paid database or disk. Approve creating it.
4. Open its HTTPS URL. Confirm `/healthz` is healthy; test reference search, Draw, Casework, backup/restore, and Save as PDF.
5. Test ten simultaneous reference requests and have a small student group try the app before relying on it for class.

Automatic deployment is disabled: deploy reviewed updates manually from Render.
No Electron installation or Node build is needed for this hosted version.

## Limits and privacy

Free services sleep after 15 minutes without inbound requests; wake-up takes about a minute. They may restart and have usage limits. Avoid relying on the pilot for time-critical graded assessments.

No server-side student accounts or case storage are provided. Clearing browser data removes local work, and saves from localhost or Electron do not transfer automatically. Verify export/import coverage before moving work.

Search and interpretation query text reaches the server. Gunicorn access logging is not enabled by this configuration, but hosting infrastructure may still log requests. Use de-identified educational examples only. Browser-delivered answer keys are inspectable.

The public file routes exclude the reference database, Python source and internal project files. Review source licenses and image permissions before public release.
