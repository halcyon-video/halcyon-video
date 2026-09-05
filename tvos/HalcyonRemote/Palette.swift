import SwiftUI

/// The viewer's colours, and only the viewer's.
///
/// These are lifted from `remote.html`'s stylesheet — the same gold-on-navy pill
/// and the same muted-blue legend the browser client shows — so a household that
/// uses the phone viewer and the Apple TV app sees one thing wearing one skin.
///
/// Deliberately NOT a brand palette: this app draws no wordmark and no emblem.
/// The store's own identity is data inside the store (`src/logo-spec.ts`,
/// `src/brand-pack.ts`) and arrives here already rendered, inside the video.
/// Anything a native client painted on top would be a second, frozen copy of a
/// brand that is supposed to be swappable.
enum Palette {
    static let background = Color(red: 0.024, green: 0.031, blue: 0.059) // #06080f
    static let pillText = Color(red: 1.000, green: 0.824, blue: 0.247)   // #ffd23f
    static let pillFill = Color(red: 0.039, green: 0.098, blue: 0.267)   // #0a1944
    static let pillEdge = Color(red: 0.165, green: 0.290, blue: 0.627)   // #2a4aa0
    static let legendText = Color(red: 0.616, green: 0.698, blue: 0.910) // #9db2e8
    static let legendFill = Color(red: 0.024, green: 0.039, blue: 0.094) // #060a18
}
