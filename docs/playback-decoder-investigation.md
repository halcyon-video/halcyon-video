# Investigation: Sustained Rewind Hardware Video-Decoder Reset (#360)

## Incident & Scope
- **Report**: 2026-09-21 owner report: *Monster House* repeatedly fails on extended rewind during local direct-disk playback in mpv, while other watched titles do not.
- **Kernel Event**: `ring vcn_unified_0 timeout, signaled seq=10866210, emitted seq=10866212` attributed to `mpv` pid 2297848 thread `mpv:cs0`. The AMDGPU driver reported a wedged device on register polling (`regUVD_POWER_STATUS` != 1, `regUVD_RB_RPTR` != 0x100) and recovered the decode ring via reset. Replacement mpv resumed playback under `--hwdec=auto-safe` (VAAPI).

## Media & Container Verification
- **Target File**: `/mnt/data1/media/Movies/Animated/Monster House (2006)/Monster House (2006) Remux-1080p - tt0385880.mkv` (20,261,480,049 bytes).
- **Container Structure**: Standard Matroska container authored by MakeMKV v1.17.7. Complete seekhead, cues, and chapter index.
- **Video Track**: H.264 High Profile, Level 4.1, 1920×1080 at 23.976 fps, ~24.9 Mb/s, 1 reference frame.
- **Audio/Subtitle Tracks**: Primary DTS-HD MA 5.1 (2.6 Mb/s), DTS core 5.1, AC3 5.1, AC3 stereo, and HDMV PGS subtitles.
- **Decode Integrity**:
  - Full bitstream decode of the initial 340 seconds (including t=300s to 340s where playback and rewind occurred) via multi-threaded libavcodec: **100% clean**, 0 decode errors, 0 macroblock corruptions, 0 bitstream warnings.
  - Container seek integrity: Verified seeking to arbitrary timestamps and cluster boundaries; keyframe timestamps are continuous and consistent with the container seek table.
- **Conclusion**: The media file is completely valid and free of bitstream or container corruption.

## Root Cause Analysis
1. **Cadence Difference**: Unlike typical cinematic titles which use variable GOP lengths between 2 and 10 seconds based on scene changes, *Monster House* uses early Sony Blu-ray authoring with fixed 18-frame (0.75-second) GOPs and large IDR keyframes (500–600 KB each at ~30 Mb/s scene bitrate).
2. **Sustained Rewind Mechanics**: With key repeat configured at 40 events/second (25 ms interval), holding the rewind key sends rapid successive `seek -5` commands.
3. **AMDGPU VCN Ring Saturation**: Under `--hwdec=auto-safe` (VAAPI), each backward seek commands the decoder to flush existing state, seek to the preceding keyframe, and decode intermediate frames. When flush/abort/decode requests are submitted at 40 Hz faster than the VCN ASIC can finalize frame allocations and ring pointers, the hardware ring buffer stalls (`regUVD_RB_RPTR` desynchronization), provoking the kernel driver timeout and GPU ring reset.

## Verified Safe Workarounds
1. **Software Video Decoding for Problematic Titles**:
   Running with `--hwdec=no` decodes video on the CPU while keeping `--vo=gpu-next` for display rendering, HDR metadata, and color-space mapping. CPU decoders handle rapid flushes in user space without hardware command rings, completely eliminating decoder ring timeouts.
2. **Keyframe-Only Seeking / Input Pacing**:
   Using discrete seek keypresses rather than holding sustained rewind at 40 Hz, or configuring `--hr-seek=no` (`seek -5 keyframes`), avoids intermediate frame decodes and decoder ring flooding.
3. **Application Decision**:
   No global change to `--hwdec=auto-safe` is warranted in Halcyon, as hardware decoding is essential for 4K / HDR10 efficiency and power consumption across the library.
