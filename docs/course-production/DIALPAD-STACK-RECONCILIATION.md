# DialPad operating-stack reconciliation

Status: confirmed for the employee manual workflow on 2026-07-16. The
confirmation expires at `2026-07-23T17:06:57-05:00` and never replaces the
mandatory immediate prepublication stack check.

## Decision

Retain the current DialPad learner content. It accurately describes the manual
employee workflow now in scope:

- Employees place outbound homeowner calls through DialPad.
- Employees send manager-approved seller texts through DialPad.
- Employees send manager-approved seller email through Gmail.
- Sandra remains the CRM and operational record.

This does not claim that DialPad is Sandra's current messaging provider.
Sandra's internal messaging provider is Sendillo. It also does not authorize
employees to use Jitter: Jitter's carrier is Telnyx, but the current operating
record keeps Jarrad as the only operator until the Phase 2 exit and VA
authorization decision.

## Authoritative evidence

Newest evidence wins. The following vault snapshots were read directly on
2026-07-16 and are recorded in
`content/course-manifests/bmh-operating-stack-confirmation.v1.json`:

| Source | Observed update | Evidence used |
| --- | --- | --- |
| `_Active.md` | 2026-07-16 | Sandra uses Sendillo internally; Jitter uses Telnyx but remains Jarrad-only until Phase 2 exit. |
| `projects/BMH Training Course.md` | 2026-07-12 | The 2026-07-01 live content decision explicitly confirms DialPad remains in the employee stack. |
| `BMH Training Course/Thinkific/_master-transcripts.md` | 2026-07-12 snapshot | Employee calls and approved texts use DialPad; approved email uses Gmail; records live in Sandra. |

The confirmation record includes each source's exact SHA-256 snapshot. Those
hashes are evidence of what was reviewed, not permission to ignore newer vault
state.

## Learner-content audit

No statement was contradicted, so no learner text changed and neither approved
video requires a recut.

| Surface | DialPad references | Result |
| --- | ---: | --- |
| Full manifest | 10 | Seven Tech Stack flashcard/quiz string values and three Mission Control quiz values agree with the employee workflow. |
| Tech Stack canary | 7 | Exact deterministic subset of the full-manifest Tech Stack references. |
| Tech Stack caption | 3 | Calls, recording/coaching, and call-activity metrics are in scope. |
| Tech Stack transcript | 3 | Exact semantic match to the caption and approved cut. |
| Mission Control caption | 2 | Approved DialPad text plus DialPad calling are distinguished from Gmail and Sandra. |
| Mission Control transcript | 2 | Exact semantic match to the caption and approved cut. |
| Tech Stack learner guide | 0 | No provider claim; it defers changed procedures to the current SOP and manager. |
| Mission Control learner guide | 0 | No provider claim; it defers changed procedures to the current SOP and manager. |

The confirmation checksum-locks the two approved video cuts, all four caption
and transcript derivatives, and both guides. A changed approved cut or
derivative invalidates the confirmation instead of silently preserving it.

## Fail-closed behavior

The manifest validator clears the DialPad publication blocker only when the
confirmation:

- is present, confirmed, unexpired, and not future-dated;
- preserves the employee/Sandra/Jitter scope boundary above;
- matches the exact DialPad-bearing JSON paths and values for the selected
  import ID;
- matches the required approved media and guide asset paths and checksums;
- includes the three authoritative source snapshots; and
- retains every required recheck trigger.

Missing, expired, scope-changed, manifest-mismatched, or asset-mismatched
records restore the DialPad publication blocker. Publication itself remains a
trigger even while the dated confirmation is otherwise valid.

## Verification

```sh
node scripts/course-content/build-canary-manifest.mjs
node scripts/course-content/validate-manifest.mjs content/course-manifests/bmh-employee-training.v1.json
node --test content/course-manifests/bmh-operating-stack-confirmation.qa.test.mjs
```

No provider call, paid service, upload, video edit, approval change, production
mutation, or publication occurred during this reconciliation.
