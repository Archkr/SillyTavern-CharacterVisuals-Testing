# Long-message detection failure

## Symptom
When an assistant message streams beyond a few thousand characters, Costume Switcher stops issuing `/costume` commands even when the character has already been mentioned. Users see the switcher working on short replies but "give up" once the output grows long enough.

## Root cause
The stream handler keeps only the last `maxBufferChars` characters of the in-flight message. On every token it appends the new text, slices the combined buffer down to the limit, and bumps the window offset accordingly. With the default profile settings the buffer is capped at 3,000 characters, so anything earlier is discarded before the detectors run:

- Profile default `maxBufferChars` is 3,000 characters. 【F:index.js†L353-L366】
- Each token append slices the buffer to that maximum and advances the offset, meaning detections only consider the trailing window. 【F:index.js†L10769-L10795】
- The resolver for the limit simply falls back to that default when the profile does not override it. 【F:index.js†L4285-L4291】

Because the detectors only see the truncated window, a long response can push the initial speaker mention outside the window before the resolver scores it, and `/costume` is never issued once the mention is trimmed away.

## Fix plan
1. Add a regression test that streams a long message (longer than `maxBufferChars`) with an early speaker mention and asserts that a `/costume` call still occurs before the window drops the match.
2. Rework the stream handler so trimming the buffer does not erase matches that were already detected (for example by processing new tokens before slicing or by persisting detections that land before the trim boundary).
3. Make the limit more forgiving for long-form prose: raise the default `maxBufferChars`, expose a clearer warning in the UI when the buffer would drop earlier text, or both, so users can tune the window intentionally.
