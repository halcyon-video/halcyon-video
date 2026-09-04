import XCTest
@testable import HalcyonRemote

/// `StoreAddress` is the only piece of this app that is pure logic, so it is
/// the only piece worth unit-testing without an Apple TV in the room. These
/// cases are the same ones the Fire TV client's parser is held to.
///
/// If this test target ever gets in the way (it needs its own signing identity
/// to run on a device), delete the `HalcyonRemoteTests` target from
/// project.yml and this directory — nothing in the app depends on it.
final class StoreAddressTests: XCTestCase {
    func testBareHostGetsDefaultPort() {
        XCTAssertEqual(StoreAddress.origin("192.168.1.20"), "http://192.168.1.20:1420")
        XCTAssertEqual(StoreAddress.origin("halcyon.lan"), "http://halcyon.lan:1420")
    }

    func testExplicitPortWins() {
        XCTAssertEqual(StoreAddress.origin("192.168.1.20:8080"), "http://192.168.1.20:8080")
    }

    func testSchemeIsStrippedAndRemembered() {
        XCTAssertEqual(StoreAddress.origin("http://192.168.1.20:1420"), "http://192.168.1.20:1420")
        XCTAssertEqual(StoreAddress.origin("HTTP://192.168.1.20"), "http://192.168.1.20:1420")
        // https with no port keeps 443 implicit rather than inventing 1420.
        XCTAssertEqual(StoreAddress.origin("https://store.example.com"), "https://store.example.com")
    }

    func testPathQueryAndFragmentAreDropped() {
        XCTAssertEqual(
            StoreAddress.origin("http://192.168.1.20:1420/remote.html?tv=1&tvapp=1"),
            "http://192.168.1.20:1420"
        )
        XCTAssertEqual(StoreAddress.origin("192.168.1.20/#anchor"), "http://192.168.1.20:1420")
    }

    func testSurroundingWhitespaceIsForgiven() {
        XCTAssertEqual(StoreAddress.origin("  192.168.1.20  "), "http://192.168.1.20:1420")
    }

    func testIpv6Literals() {
        XCTAssertEqual(StoreAddress.origin("[fe80::1]"), "http://[fe80::1]:1420")
        XCTAssertEqual(StoreAddress.origin("[fe80::1]:1420"), "http://[fe80::1]:1420")
    }

    func testGarbageIsRejected() {
        XCTAssertNil(StoreAddress.origin(nil))
        XCTAssertNil(StoreAddress.origin(""))
        XCTAssertNil(StoreAddress.origin("   "))
        XCTAssertNil(StoreAddress.origin("192.168.1.20:"))
        XCTAssertNil(StoreAddress.origin("192.168.1.20:notaport"))
        XCTAssertNil(StoreAddress.origin("192.168.1.20:99999"))
        XCTAssertNil(StoreAddress.origin("192.168.1.20:0"))
        XCTAssertNil(StoreAddress.origin("ftp://192.168.1.20"))
        XCTAssertNil(StoreAddress.origin("my store"))
    }

    func testViewerURL() {
        XCTAssertEqual(
            StoreAddress.viewerURL("192.168.1.20"),
            "http://192.168.1.20:1420/remote.html?tv=1&tvapp=1"
        )
        XCTAssertNil(StoreAddress.viewerURL("nope:nope"))
    }

    func testBaseURLParses() {
        XCTAssertEqual(StoreAddress.baseURL("192.168.1.20")?.absoluteString, "http://192.168.1.20:1420")
    }
}
