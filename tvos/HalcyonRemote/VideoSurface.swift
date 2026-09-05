import SwiftUI
import WebRTC

/// The store, full screen.
///
/// `RTCMTLVideoView` is the SDK's Metal renderer: the decoded frames never leave
/// the GPU on their way to the screen, which on an Apple TV is the difference
/// between a 4K stream and a slideshow.
struct VideoSurface: UIViewRepresentable {

    let track: RTCVideoTrack?

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView(frame: .zero)
        // The store renders a fixed aspect; letterboxing it is right and
        // cropping it would hide shelf edges the browse cursor moves along.
        view.videoContentMode = .scaleAspectFit
        context.coordinator.attach(track, to: view)
        return view
    }

    func updateUIView(_ view: RTCMTLVideoView, context: Context) {
        context.coordinator.attach(track, to: view)
    }

    static func dismantleUIView(_ view: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.detach(from: view)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    /// Renderers are added to a track, not set on it, so the previous one has to
    /// come off by hand at every swap — a reconnect delivers a brand new track
    /// and the old one would otherwise keep this view on its renderer list for
    /// as long as it lived.
    final class Coordinator {
        private var attached: RTCVideoTrack?

        func attach(_ track: RTCVideoTrack?, to view: RTCMTLVideoView) {
            guard attached !== track else { return }
            attached?.remove(view)
            attached = track
            track?.add(view)
        }

        func detach(from view: RTCMTLVideoView) {
            attached?.remove(view)
            attached = nil
        }
    }
}
