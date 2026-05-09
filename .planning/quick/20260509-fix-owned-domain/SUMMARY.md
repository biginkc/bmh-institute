---
status: complete
completed: 2026-05-09
---

# Fix owned domain references

Completed domain correction:

- Updated default admin email and tests to use `jarrad@bmhgroupkc.com`.
- Updated Server Action allowed origins to `institute.bmhgroupkc.com`.
- Updated `.env.example`, Playwright defaults, AGENTS.md, and the production-readiness tracker.
- Added `institute.bmhgroupkc.com` to the Vercel `sandra-university` project.
- Updated active fallback URL examples and email-link defaults to the currently working legacy Vercel URL, `https://sandra-university.vercel.app`, until `https://institute.bmhgroupkc.com` is configured.

Current DNS action:

- Add `A institute.bmhgroupkc.com 76.76.21.21` at the DNS provider.
- Vercel reported current nameservers as `ns47.domaincontrol.com` and `ns48.domaincontrol.com`.
