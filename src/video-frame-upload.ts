/** The media clock advances between decoded frames. Keep it as a final
 * fallback only when neither native texture callbacks nor frame counts work. */
export interface VideoFrameSource {
  currentTime: number;
  webkitDecodedFrameCount?: number;
  requestVideoFrameCallback?: unknown;
  getVideoPlaybackQuality?: () => { totalVideoFrames: number };
}

export class VideoFrameUploadGate {
  private textureVersion = -1;
  private decodedFrames = -1;
  private mediaTime = -1;
  private lastNativeFrame = 0;
  private lastFallback = -Infinity;

  needsUpload(video: VideoFrameSource, version: number, now: number): boolean {
    const nativeFrame = version !== this.textureVersion;
    this.textureVersion = version;
    if (nativeFrame) this.lastNativeFrame = now;
    // WebKit's numeric property needs no per-frame result object. Native
    // callbacks already marked a fresh frame dirty, so never mark it twice.
    const cheapFrames = video.webkitDecodedFrameCount;
    if (typeof cheapFrames === 'number' && Number.isFinite(cheapFrames)) {
      const changed = cheapFrames !== this.decodedFrames;
      this.decodedFrames = cheapFrames;
      this.mediaTime = video.currentTime;
      return !nativeFrame && changed;
    }
    if (nativeFrame) return false;
    // Preserve Tauri's post-seek repair without polling/allocating during a
    // healthy requestVideoFrameCallback chain. Repair polling is capped at 30Hz.
    if (typeof video.requestVideoFrameCallback === 'function' && now - this.lastNativeFrame < 250) return false;
    if (now - this.lastFallback < 1000 / 30) return false;
    this.lastFallback = now;
    const frames = video.getVideoPlaybackQuality?.().totalVideoFrames;
    if (typeof frames === 'number' && Number.isFinite(frames)) {
      const changed = frames !== this.decodedFrames;
      this.decodedFrames = frames;
      return changed;
    }
    const changed = video.currentTime !== this.mediaTime;
    this.mediaTime = video.currentTime;
    return changed;
  }

  /** A manual repair is not evidence that the native callback chain recovered. */
  uploaded(version: number): void {
    this.textureVersion = version;
  }
}
