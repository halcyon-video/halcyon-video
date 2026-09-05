import UIKit
import XCTest
@testable import HalcyonRemote

/// The remote map is the other piece of this app that is pure logic, and the
/// one most likely to break silently: a wrong `code` doesn't crash, it just
/// makes a button do nothing on a television across the room. These cases are
/// the mapping table in `tvos/README.md` and the keyboard vocabulary in
/// `docs/remote-play-protocol.md`, asserted rather than described.
final class SiriRemoteKeyTests: XCTestCase {

    private func mapping(_ type: UIPress.PressType) -> (key: String, code: String)? {
        SiriRemoteKey.mapping(for: type)
    }

    func testClickPadEdgesBrowse() {
        XCTAssertEqual(mapping(.upArrow)?.key, "ArrowUp")
        XCTAssertEqual(mapping(.upArrow)?.code, "ArrowUp")
        XCTAssertEqual(mapping(.downArrow)?.key, "ArrowDown")
        XCTAssertEqual(mapping(.leftArrow)?.key, "ArrowLeft")
        XCTAssertEqual(mapping(.rightArrow)?.key, "ArrowRight")
    }

    func testSelectIsEnter() {
        XCTAssertEqual(mapping(.select)?.key, "Enter")
        XCTAssertEqual(mapping(.select)?.code, "Enter")
    }

    func testMenuIsEscape() {
        XCTAssertEqual(mapping(.menu)?.key, "Escape")
        XCTAssertEqual(mapping(.menu)?.code, "Escape")
    }

    /// Space, not "Space": `key` is the character a DOM keyboard event carries
    /// and `code` is the physical key's name. Sending "Space" as `key` would
    /// reach `src/input.ts` as an unrecognised string and do nothing at all.
    func testPlayPauseIsSpace() {
        XCTAssertEqual(mapping(.playPause)?.key, " ")
        XCTAssertEqual(mapping(.playPause)?.code, "Space")
    }

    /// Anything without an opinion is handed back to tvOS rather than eaten.
    func testUnmappedPressesAreNil() {
        XCTAssertNil(mapping(.pageUp))
        XCTAssertNil(mapping(.pageDown))
    }

    /// Only a held direction should keep firing. A repeated Enter would open
    /// and re-open a case; a repeated Escape would back out of the whole store.
    func testOnlyDirectionsRepeat() {
        XCTAssertTrue(SiriRemoteKey.repeatsWhenHeld(.upArrow))
        XCTAssertTrue(SiriRemoteKey.repeatsWhenHeld(.downArrow))
        XCTAssertTrue(SiriRemoteKey.repeatsWhenHeld(.leftArrow))
        XCTAssertTrue(SiriRemoteKey.repeatsWhenHeld(.rightArrow))
        XCTAssertFalse(SiriRemoteKey.repeatsWhenHeld(.select))
        XCTAssertFalse(SiriRemoteKey.repeatsWhenHeld(.menu))
        XCTAssertFalse(SiriRemoteKey.repeatsWhenHeld(.playPause))
    }

    /// Nothing this app can send may fall outside the store's vocabulary — the
    /// host ignores anything else, and an ignored key is indistinguishable from
    /// a broken connection when you are holding a remote.
    func testEveryMappedKeyIsInTheStoresVocabulary() {
        let vocabulary: Set<String> = [
            "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
            "w", "a", "s", "d",
            "Enter", " ", "e",
            "Escape", "Backspace", "q",
            "/", "f", "c", "r", "x", "p",
        ]
        let types: [UIPress.PressType] = [
            .upArrow, .downArrow, .leftArrow, .rightArrow,
            .select, .menu, .playPause, .pageUp, .pageDown,
        ]
        for type in types {
            guard let mapped = mapping(type) else { continue }
            XCTAssertTrue(
                vocabulary.contains(mapped.key),
                "press type \(type.rawValue) sends '\(mapped.key)', which src/input.ts does not bind"
            )
        }
    }

    /// The repeat has to be slower than the round trip it triggers and faster
    /// than a person can press twice, or holding a direction either floods the
    /// channel or feels stuck.
    func testRepeatTimingIsSane() {
        XCTAssertGreaterThan(SiriRemoteKey.repeatDelay, SiriRemoteKey.repeatInterval)
        XCTAssertGreaterThan(SiriRemoteKey.repeatInterval, 0.05)
        XCTAssertLessThan(SiriRemoteKey.repeatDelay, 1.0)
        XCTAssertGreaterThan(SiriRemoteKey.menuHold, 0.5)
    }
}
