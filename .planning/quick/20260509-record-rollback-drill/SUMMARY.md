---
status: complete
completed: 2026-05-09
---

# Record production rollback drill

Recorded Vercel rollback evidence:

- Rolled `sandra-university.vercel.app` from `sandra-university-wlvsahai0-jarrad-5416s-projects.vercel.app` to `sandra-university-muv2z3cz7-jarrad-5416s-projects.vercel.app`.
- Verified the alias moved with `vercel inspect`.
- Restored `sandra-university.vercel.app` to `sandra-university-wlvsahai0-jarrad-5416s-projects.vercel.app`.
- Verified the restored alias with `vercel inspect` and an HTTP 307 response from the app root.
- Recorded GitHub production-readiness run `25590873884` from `main`.

Remaining blocker:

- `university.bmhgroup.com` still needs Cloudflare DNS.
