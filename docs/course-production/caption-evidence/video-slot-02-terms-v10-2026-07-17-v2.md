# Terms Glossary v10 caption and transcript QA v2

Decision date: 2026-07-17

Decision source: BMH Institute content QA generation and validation

## Exact binding

- Video source key: `video-slot-02-terms`
- Approved video SHA-256: `6f57600d6ec3a596f96175052eda997503ab9b72aa5b7e9ec02239fe1a125769`
- Caption SHA-256: `c5f69a1ee78787d72312acf9bdb88708d0afc9cd847bad6fb2330ad7da72b403`
- Transcript SHA-256: `27bec72a0a5274d6c79c30cbbc37b0ce3b48959992c29e419868dbcfdb831015`
- Video duration: 449.534 seconds
- Caption cues: 117
- Final cue end: 445.840 seconds

## Review result

The VTT is valid WebVTT with nonempty numbered cues. Cue times are monotonic
and non-overlapping, every cue has positive duration, every cue has at most two
lines, no line exceeds 46 characters, and the final cue ends 3.694 seconds
before the approved video ends.

The first generated version exposed seven cues above 21 characters per second.
Their display windows were expanded only into available silence or adjacent cue
boundaries without changing, adding, or removing spoken words. The corrected
file has zero cues above 21 characters per second.

The transcript and cue 98 punctuation were corrected from `existing mortgage,
staying in place` to `existing mortgage staying in place`, matching the
sentence meaning without rewriting the spoken content.

Known BMH terminology was checked. The captions contain `BMH Group`, `MLS`, and
`FSBO` consistently. No detached `B.M.H.`, `B M H`, or split known-product name
was found.

The checksum-approved local edit removes the phrase `and let the acquisition
manager know` from 216.612 through 218.772 seconds. Cue 61 ends at 216.600 and
cue 62 begins at 216.900. The resulting seam reads:

> Don't hang up, but do note it. Sometimes listed properties don't sell and
> that seller comes back around.

The removed role-title phrase does not appear in either the VTT or transcript.
Property-value examples are preserved because they explain the wholesaling
glossary; they are not employee compensation figures or promises.

## Objective alignment

The grouped lesson objectives were revised to match the concepts actually
taught in this approved video, its learner guide, flashcards, and assessment:
distressed and listing terms; wholesaling, assignment, and double close; and
subject-to and seller-financing structures. The release manifest no longer
claims that this video teaches ARV, MAO, equity, title, or foreclosure content
that is absent from the exact cut.

## Release boundary

This evidence approves only the caption/transcript pair whose hashes are listed
above and only when paired with the listed approved video hash. It does not
approve KPIs v12, any replacement recut, artwork, import, publication, or learner
access. Any changed video, VTT, transcript, or evidence bytes require a new
checksum-distinct record and review.
