# BMH Institute quiz and Slot 16 guide review

Status: **two separate human decisions required**.

> This page does not approve anything. Quiz approval and guide approval are separate. A bare `approved` is not enough to identify either checksum-bound decision.

## 1. Quiz pools

[Open the full 342-question quiz review](./quiz-content-review.v1.md)

- Exact request: [quiz-content-review-request.v1.json](./quiz-content-review-request.v1.json)
- Request SHA-256: `2ea4fefc97c147210d688a2e41a385509ad96b518eba323844356e6c03a9d29b`
- Full review SHA-256: `56b2f2b9f5c3ab5cf28bac01f9fd98ea0713bcd3c07dea5adcbaa073f2cdc508`
- Scope: 19 pools, 342 questions, 18 per pool, 10 randomized per attempt

**Question:** Do you approve all 19 exact quiz pools shown in the full review?

If approved, respond exactly:

> Approved quizzes: I reviewed and approve all 19 exact quiz pools bound to request SHA-256 2ea4fefc97c147210d688a2e41a385509ad96b518eba323844356e6c03a9d29b.

| Quiz pool | Questions | SHA-256 |
| --- | ---: | --- |
| `quiz-slot-01` | 18 | `c3cf74f2731f8314d9cee4db09f6c6567079886c297f283f7e2514ec91c37e7a` |
| `quiz-slot-02` | 18 | `ede4d6f342aa02da32c2cc3e121a46a80467be796b35a8edb5f4dba9861e9118` |
| `quiz-slot-03` | 18 | `a01ae20c3233b24d6de0fd42664886b079973817e0a369c40fdb00d5a6707f42` |
| `quiz-slot-04` | 18 | `7d341270c1a538cc8d77cda301f0da8600e2d37d180c12f458913a2d0713736f` |
| `quiz-slot-05` | 18 | `f598f449ed82b846ce535830d793e7928b741c1d7223f76d8e7f2b5c265c451b` |
| `quiz-slot-06` | 18 | `79e9d3998242aaeac614b9d759ce9a40c2448bf9a2055d380bd11ff3e010681a` |
| `quiz-slot-07` | 18 | `d54e5329832efaf532cce35ae444f001baf511b98f757ffc6b43ee129dd824e3` |
| `quiz-slot-08` | 18 | `9ae5c2e9a149cad1de2c421b30b44b94893517e648c91aef6d7e66340343e974` |
| `quiz-slot-09` | 18 | `cd7f0d9aa428dd0c6fff36a41dd8571e6e3d65b42e05c969587aa0d6b60ec9f9` |
| `quiz-slot-10` | 18 | `7995b650523a6202c15f8469f0360253b7b459f61f49b3a589f7e5d074b30774` |
| `quiz-slot-11` | 18 | `c00326476ecab5dd818837ee26dbfa0c57d63409803c80fa02383b0ba0d28d48` |
| `quiz-slot-12` | 18 | `f88ec3143cd6a7f2f58ce60470f2b7eb067172c8e9a6aa9cf9a6f4dfb6ff30f4` |
| `quiz-slot-13` | 18 | `6254e3260e6ddeaa7bab32bbcdc60afb15b428b7cde14ec043389bf9d455304b` |
| `quiz-slot-14` | 18 | `191526e22cca05f36a669d2b934335205529f76390c53e4f6bbc816fb37c517d` |
| `quiz-slot-15` | 18 | `12981cc437e3b070eeeffb1b2c7b23a3bd790319299c3c00c3575a8b998602e8` |
| `quiz-slot-16` | 18 | `e9a8219eb5d217074ea4e70482a34adc30143cf25f24ab2c785e2e973c97fc49` |
| `quiz-slot-17` | 18 | `448bd0baa4bbf74279c2840539cede844a4900c413f8a521c5ed97f6b4138cb6` |
| `quiz-slot-18` | 18 | `57bdabd7398275372a2f01144000be49a7a42a4b41381a00c054a58c99f88c4a` |
| `quiz-slot-19` | 18 | `e901eace1d37ed784b3ee2e471457c0e89e52c19d690064a2bd7e17b31b22e7b` |

## 2. Changed Slot 16 learner guide

[Open the current Slot 16 learner guide](../../output/pdf/slot-16-learner-guide.pdf)

- Current SHA-256: `1ea291e1190ba6f990407cff53160ef90c1acf787e5e66ed6686a2d9984d7c5d`
- Current size: 50676 bytes
- Superseded course-QA record SHA-256: `52fba6bfab15ec9b91cf5814b0ab2a04d03189387f96574056852fb778aeaae6`
- Superseded size: 50633 bytes

The current PDF differs from the accepted course-QA record. Human approval permits the controller to perform reacceptance checks; it does not itself rewrite the guide ledger.

**Question:** Do you approve the changed Slot 16 learner guide for course-QA reacceptance?

If approved, respond exactly:

> Approved guide: I reviewed the current Slot 16 learner guide bound to SHA-256 1ea291e1190ba6f990407cff53160ef90c1acf787e5e66ed6686a2d9984d7c5d and size 50676 bytes for course-QA reacceptance.

## What the controller does next

- Quizzes: Preserve the exact human response and create one checksum-bound approval-ledger record for each of the 19 pools; the response itself does not mutate the ledger.
- Guide: After preserving the exact human response, rerun deterministic rebuild, semantic tests, and visual review; then rebuild and reaccept the complete 19-guide ledger. The response alone does not reaccept the guide.
- Neither decision authorizes course import, publication, or employee access.
