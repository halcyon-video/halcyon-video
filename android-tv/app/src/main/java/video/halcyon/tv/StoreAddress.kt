package video.halcyon.tv

/**
 * Turning what somebody types on a TV remote into the viewer's URL.
 *
 * People type "192.168.1.20", "192.168.1.20:1420", "http://halcyon.lan:1420/"
 * or, having read it off the store's Connection settings, the whole
 * "http://192.168.1.20:1420/remote.html". All five have to arrive at the same
 * place, because re-typing an address on a d-pad keyboard is the worst part of
 * owning a TV app.
 *
 * Deliberately carries no Android imports at all: parsing, not the Activity,
 * is where this breaks, and a pure object is testable on a plain JVM
 * (`gradle test`, app/src/test) with no instrumentation and no device.
 * Persistence lives next door in [StorePrefs].
 */
object StoreAddress {

    /** The kiosk's vite preview port — what the store serves on by default. */
    const val DEFAULT_PORT = 1420

    /**
     * Normalize typed input to a bare origin ("http://host:port"), or null if
     * there is nothing usable in it. Any path, query or fragment is dropped —
     * we always append our own.
     */
    @JvmStatic
    fun origin(raw: String?): String? {
        var s = raw?.trim() ?: return null
        if (s.isEmpty()) return null

        // A scheme has to exist before anything else parses: bare "host:1420"
        // reads as scheme "host" to every URI parser there is.
        val hasScheme = s.startsWith("http://", true) || s.startsWith("https://", true)
        val scheme = if (s.startsWith("https://", true)) "https" else "http"
        if (hasScheme) s = s.substringAfter("://")

        // Drop path/query/fragment — "…:1420/remote.html" is a thing people
        // paste, and so is a trailing slash.
        s = s.substringBefore('/').substringBefore('?').substringBefore('#').trim()
        if (s.isEmpty()) return null

        // Split host from port, minding IPv6 literals ("[::1]:1420").
        val host: String
        var port: Int? = null
        if (s.startsWith("[")) {
            val close = s.indexOf(']')
            if (close < 0) return null
            host = s.substring(0, close + 1)
            val rest = s.substring(close + 1)
            if (rest.startsWith(":")) port = rest.drop(1).toIntOrNull() ?: return null
        } else {
            val colon = s.lastIndexOf(':')
            if (colon >= 0) {
                host = s.substring(0, colon)
                port = s.substring(colon + 1).toIntOrNull() ?: return null
            } else {
                host = s
            }
        }
        if (host.isEmpty()) return null
        if (port != null && (port < 1 || port > 65535)) return null

        // No port given: http means the store's own default; https means the
        // owner put it behind a reverse proxy, so leave 443 alone.
        val effective = port ?: if (scheme == "http") DEFAULT_PORT else null
        return if (effective == null) "$scheme://$host" else "$scheme://$host:$effective"
    }

    /**
     * The page this app exists to show.
     *
     * `tv=1` skips the viewer's user-agent sniff — an Android WebView is a TV
     * here by construction, and nothing should hinge on a UA string. `tvapp=1`
     * says a native shell owns the remote: the viewer drops the on-screen BACK
     * pill and its history-sentinel trap, because this Activity turns the real
     * BACK key into the store's back action (see MainActivity).
     */
    @JvmStatic
    fun viewerUrl(raw: String?): String? = origin(raw)?.let { "$it/remote.html?tv=1&tvapp=1" }
}
