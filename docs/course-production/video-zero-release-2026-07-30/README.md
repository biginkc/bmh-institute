# Video Zero release evidence

This package binds the user-approved Video Zero master to the first lesson of
the BMH employee training course.

## Approved master

- Local path: `course-assets/review-lessonA/LESSON-1A-v11-VIDEO-ZERO-FINAL-AUDIO-QC.mp4`
- SHA-256: `06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b`
- Size: 74,404,741 bytes
- Duration: 318.351 seconds
- Video: 1600 by 900, 30 fps, H.264
- Audio: AAC stereo, 48 kHz
- User approval: Jarrad Henry, 2026-07-30
- Approval scope: user-approved picture and requested ending-audio correction

The approved continuous HeyGen ending is video
`b1595ef9db0141d1a81fb69154da1040`. The parking-arrival interval from
61.125 through 65.167 seconds is effectively silent: 3.992 seconds of silence
in a 4.042 second sample, with a mean level of -64.2 dB.

## Ending loudness correction

The supplied 19.351-second HeyGen ending measured -28.7 LUFS while the preceding
narration measured approximately -17 to -18 LUFS. The release master corrects
only the audio from 04:59.000 through the end. The corrected ending measures
-17.8 LUFS with a -1.5 dB true peak. The full corrected master measures
-17.7 LUFS.

The H.264 video elementary stream is unchanged from the user-approved v10
picture. Both the v10 and v11 video streams hash to
`eac1eb5cef0f54acf79ed366dcb95cfa95ab1fff2d27e9dde999426537b0797a`.

## Transcript and captions

The exact final master was transcribed with Whisper and compared with the
approved source recordings. The source-corrected full transcript is in
`transcript.txt`.

Whisper dropped the word `Solve` at the edit boundary near 01:05. Waveform
correlation against the approved source recording
`course-assets/heygen/lessonV0/n08_thework.wav` confirmed that the final master
contains the complete approved line:

> Solve the problem, and the profit follows. Every time.

The learner caption uses the confirmed source line rather than the incomplete
automatic transcription. No duplicate narrator appears in the ending.

## Caption asset

- Local path: `course-assets/captions/video-slot-01-welcome.vtt`
- SHA-256: `bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939`
- Size: 7,629 bytes
- Duration coverage: 00:00.000 through 05:18.000

## Visual review

The final master passed decode validation and contact-sheet review. The review
covered the corrected white skin treatment, blue-background edge cleanup,
parking arrival, headset character correction, and the continuous Andrea
ending. The reviewed sheets are retained with this release:

- `visual-qc/final-contact-sheet.jpg` — SHA-256
  `492329fef928e57b7bdc677a76e9207f8a002813fe501f2438d7fabb2c37da45`
- `visual-qc/detail-contact-sheet.jpg` — SHA-256
  `c0aea74458c53b7900a50995b4f30e1e5f45984f8e4a2d8e454d489700f10876`
