package video.halcyon.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The address box is the only thing anybody types into this app, on the worst
 * input device in the house. Every shape below is one somebody plausibly
 * enters — or pastes off the store's Connection settings — and they all have
 * to land on the same viewer URL.
 */
class StoreAddressTest {

    private val expected = "http://192.168.1.20:1420"

    @Test
    fun `bare host gets the store's default port`() {
        assertEquals(expected, StoreAddress.origin("192.168.1.20"))
    }

    @Test
    fun `host and port pass through`() {
        assertEquals(expected, StoreAddress.origin("192.168.1.20:1420"))
    }

    @Test
    fun `an explicit non-default port is kept`() {
        assertEquals("http://192.168.1.20:8080", StoreAddress.origin("192.168.1.20:8080"))
    }

    @Test
    fun `scheme, trailing slash and pasted path are all shed`() {
        for (typed in listOf(
            "http://192.168.1.20:1420",
            "http://192.168.1.20:1420/",
            "http://192.168.1.20:1420/remote.html",
            "http://192.168.1.20:1420/remote.html?tv=1",
            "  192.168.1.20:1420  ",
        )) {
            assertEquals(typed, expected, StoreAddress.origin(typed))
        }
    }

    @Test
    fun `a hostname works as well as an address`() {
        assertEquals("http://halcyon.lan:1420", StoreAddress.origin("halcyon.lan"))
    }

    @Test
    fun `https means a reverse proxy, so port 443 is left alone`() {
        assertEquals("https://store.example.com", StoreAddress.origin("https://store.example.com"))
        assertEquals("https://store.example.com:8443", StoreAddress.origin("https://store.example.com:8443"))
    }

    @Test
    fun `IPv6 literals keep their brackets`() {
        assertEquals("http://[fd00::1]:1420", StoreAddress.origin("[fd00::1]:1420"))
        assertEquals("http://[fd00::1]:1420", StoreAddress.origin("[fd00::1]"))
    }

    @Test
    fun `nothing usable comes back null rather than a broken URL`() {
        assertNull(StoreAddress.origin(null))
        assertNull(StoreAddress.origin(""))
        assertNull(StoreAddress.origin("   "))
        assertNull(StoreAddress.origin("http://"))
        assertNull(StoreAddress.origin("192.168.1.20:not-a-port"))
        assertNull(StoreAddress.origin("192.168.1.20:99999"))
    }

    @Test
    fun `the viewer URL carries both flags the wrapper depends on`() {
        // tv=1 skips the UA sniff; tvapp=1 is what makes remote-tv.ts drop the
        // on-screen BACK pill and the history sentinel this app replaces.
        assertEquals(
            "http://192.168.1.20:1420/remote.html?tv=1&tvapp=1",
            StoreAddress.viewerUrl("192.168.1.20")
        )
        assertNull(StoreAddress.viewerUrl(""))
    }
}
