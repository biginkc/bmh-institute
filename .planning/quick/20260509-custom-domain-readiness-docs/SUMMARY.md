---
status: complete
task: custom-domain-readiness-docs
date: 2026-05-09
---

# Summary

Recorded custom-domain readiness evidence after `institute.bmhgroupkc.com` was configured.

Evidence:
- DNS record `A institute.bmhgroupkc.com 76.76.21.21` exists.
- HTTPS returns the BMH Institute app through Vercel.
- Vercel certificate `cert_KhnuksU3ftVPXtOglGh0EmKv` exists for `institute.bmhgroupkc.com`.
- GitHub secret `E2E_PROD_BASE_URL` now points to `https://institute.bmhgroupkc.com`.
- GitHub Actions production-readiness run `25596039223` passed from `main`.

Remaining blocker:
- Production email-link capture for invite acceptance, password reset, and set-password UI proof.
