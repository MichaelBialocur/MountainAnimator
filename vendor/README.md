# Video muxers

Vendored from the upstream build files on 2026-09-14:

- https://github.com/Vanilagy/mp4-muxer (build/mp4-muxer.mjs)
- https://github.com/Vanilagy/webm-muxer (build/webm-muxer.mjs)

MIT licenses are preserved beside each file. These frozen libraries provide only
container packaging; WebCodecs performs encoding. Upstream has deprecated them
in favour of Mediabunny. There are no runtime CDN dependencies for the muxers.

Local WebM fix: include the final frame duration in Segment Duration when the
video track supplies a frame rate. Verified with ffprobe: 30 decoded frames,
30/1 fps, exactly 1.000000 seconds for a one-second test (rather than 0.966 s).
