# Terms Glossary v10 caption and transcript QA

Decision date: 2026-07-17

Decision source: BMH Institute content QA generation and validation

## Exact binding

- Video source key: `video-slot-02-terms`
- Approved video SHA-256: `6f57600d6ec3a596f96175052eda997503ab9b72aa5b7e9ec02239fe1a125769`
- Caption SHA-256: `7423fd62cc0e253d786e4d6c3295b6286f10e55aa5d8f41714ef050334b8a8f7`
- Transcript SHA-256: `4ae0786d722424b2b854a510c0437bd55e04bb65aa6bbc0e80e296bad8ff6c96`
- Video duration: 449.534 seconds
- Caption cues: 117
- Final cue end: 445.840 seconds

## Review result

The VTT is valid WebVTT with nonempty timed cues. Cue times are monotonic and
non-overlapping, every cue has positive duration, no cue exceeds seven seconds,
no line exceeds 48 characters, and the final cue ends before the approved video
cut ends. The transcript is nonempty and identifies the exact video source key.

Known BMH terminology was checked. The captions contain `BMH Group`, `MLS`, and
`FSBO` consistently. No detached `B.M.H.`, `B M H`, or split known-product name
was found.

The checksum-approved local edit removes the phrase `and let the acquisition
manager know` from 216.612 through 218.772 seconds. The generated caption seam
is continuous and reads:

> Don't hang up, but do note it. Sometimes listed properties don't sell and
> that seller comes back around.

The removed role-title phrase does not appear in either the VTT or transcript.
Property-value examples in the lesson are preserved because they explain the
wholesaling glossary; they are not employee compensation figures or promises.

## Release boundary

This evidence approves only the caption/transcript pair whose hashes are listed
above and only when paired with the listed approved video hash. It does not
approve KPIs v12, any replacement recut, artwork, import, publication, or learner
access. Any changed video, VTT, transcript, or evidence bytes require a new
checksum-distinct record and review.
