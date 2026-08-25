package video.halcyon.tv

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * The whole app: a fullscreen WebView on the store's Remote Play viewer.
 *
 * The reason this Activity exists rather than a browser is the BACK key. In
 * any TV browser BACK belongs to the browser — TV Bro spends it leaving d-pad
 * mode, Silk spends it on history — so backing out of an aisle either does
 * nothing or navigates away from the store, and the viewer has to paint an
 * on-screen BACK pill and click it with the browser's virtual cursor. Owning
 * the Activity means we see the key first and can hand it to the page.
 *
 * Everything else about the remote already works in a WebView: the d-pad
 * arrives as arrow keys, OK as Enter, and the media keys under the names
 * src/remote-tv.ts already maps. So this class is BACK, fullscreen, and an
 * error card — deliberately not much.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var errorCard: LinearLayout
    private lateinit var errorDetail: TextView

    /** The URL currently loaded, so onResume can notice the address changed. */
    private var loadedUrl: String? = null

    /** Set once the page actually loads; until then BACK means "go fix it". */
    private var pageLoaded = false

    /**
     * Whether the load in flight already failed. onPageFinished still fires
     * after onReceivedError — on the error page — so without this the success
     * path would clear the error card it had just put up.
     */
    private var loadFailed = false

    /** Guards one BACK press so the long press and the release do not both fire. */
    private var backHandled = false

    private companion object {
        /** Hold BACK this long to reach the address screen. */
        const val LONG_PRESS_MS = 700L

        /**
         * The keys a WebView will not hand to the page, mapped to the names
         * the viewer listens for.
         *
         * Chromium treats the d-pad as focus traversal, not as input: it
         * consumes DPAD_* looking for the next focusable element and, finding
         * none (the viewer is a <video> and some overlays — measured
         * focusable count: zero), drops the event without ever firing a
         * keydown. Media keys have no such role, so those arrive by
         * themselves and are deliberately absent from this table — forwarding
         * them here as well would deliver each one twice.
         *
         * Verified on a Google TV system image, 2026-08-25: without this the
         * d-pad and OK do nothing at all, which is most of a remote.
         */
        val FORWARDED_KEYS: Map<Int, Pair<String, String>> = mapOf(
            KeyEvent.KEYCODE_DPAD_LEFT to ("ArrowLeft" to "ArrowLeft"),
            KeyEvent.KEYCODE_DPAD_RIGHT to ("ArrowRight" to "ArrowRight"),
            KeyEvent.KEYCODE_DPAD_UP to ("ArrowUp" to "ArrowUp"),
            KeyEvent.KEYCODE_DPAD_DOWN to ("ArrowDown" to "ArrowDown"),
            KeyEvent.KEYCODE_DPAD_CENTER to ("Enter" to "Enter"),
            KeyEvent.KEYCODE_ENTER to ("Enter" to "Enter"),
            KeyEvent.KEYCODE_NUMPAD_ENTER to ("Enter" to "Enter"),
            // A paired game controller's A button, which TV boxes commonly
            // report instead of DPAD_CENTER.
            KeyEvent.KEYCODE_BUTTON_A to ("Enter" to "Enter"),
            // MENU is the legend toggle; remote-tv.ts maps ContextMenu to it.
            KeyEvent.KEYCODE_MENU to ("ContextMenu" to "ContextMenu"),
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        errorCard = findViewById(R.id.errorCard)
        errorDetail = findViewById(R.id.errorDetail)

        findViewById<Button>(R.id.retry).setOnClickListener { loadedUrl?.let { load(it) } }
        findViewById<Button>(R.id.changeAddress).setOnClickListener { openSetup() }

        goFullscreen()
        configureWebView()

        // A stream nobody presses a key during is still being watched.
        web.keepScreenOn = true
    }

    override fun onResume() {
        super.onResume()
        goFullscreen()

        val url = StoreAddress.viewerUrl(StorePrefs.saved(this))
        if (url == null) {
            // Nothing configured yet. Hand over to setup and get out of the
            // way: if we stayed on the stack, backing out of setup would
            // land here and re-open it, with no way out but HOME. Setup
            // starts us again itself once it has an address.
            openSetup()
            finish()
            return
        }
        web.onResume()
        if (url != loadedUrl) load(url)
        web.requestFocus() // keys only reach the page while the WebView holds focus
    }

    override fun onPause() {
        super.onPause()
        // Let the page tear its peer connection down rather than leaving the
        // host streaming to nobody; the reaper would get it eventually, but
        // not before wasting a minute of encode. Paired with onResume, not
        // onStart: an Activity that is merely paused (something translucent
        // over it) never sees onStart again, and would come back frozen.
        web.onPause()
    }

    // ---- the BACK key ------------------------------------------------------

    /**
     * Intercepted here, ahead of the view hierarchy, so the WebView never gets
     * a chance to treat it as history and the default
     * "BACK finishes the Activity" never runs.
     *
     * A tap forwards the store's own back action into the page. A hold reaches
     * the address screen — the one bit of app chrome there is. (Leaving the app
     * altogether is HOME, which belongs to the system and always works; an app
     * that could swallow BACK forever should not also own the only way out.)
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode != KeyEvent.KEYCODE_BACK) {
            val mapped = FORWARDED_KEYS[event.keyCode]
            // Only once the store is actually on screen: while the error card
            // is up, the d-pad belongs to its buttons.
            if (mapped == null || !pageLoaded || errorCard.visibility == View.VISIBLE) {
                return super.dispatchKeyEvent(event)
            }
            val (key, code) = mapped
            when (event.action) {
                KeyEvent.ACTION_DOWN ->
                    sendKeyToPage(key, code, down = true, repeat = event.repeatCount > 0)
                KeyEvent.ACTION_UP ->
                    sendKeyToPage(key, code, down = false, repeat = false)
            }
            return true
        }

        when (event.action) {
            KeyEvent.ACTION_DOWN -> {
                if (event.repeatCount == 0) {
                    backHandled = false
                    // Asks the system to mark the repeat that crosses the
                    // long-press timeout with FLAG_LONG_PRESS.
                    event.startTracking()
                } else if (!backHandled && isLongPress(event)) {
                    backHandled = true
                    openSetup()
                }
            }
            KeyEvent.ACTION_UP -> {
                if (!backHandled) {
                    backHandled = true
                    // Never strand somebody on a page that never loaded: with
                    // nothing to back out of, BACK is the way to the address
                    // screen whether or not the remote repeats keys.
                    if (pageLoaded && errorCard.visibility != View.VISIBLE) sendEscapeToPage()
                    else openSetup()
                }
            }
        }
        return true
    }

    /**
     * Held rather than tapped.
     *
     * `isLongPress` is the system's own signal — set on the key repeat that
     * crosses the long-press timeout — and is what a real remote and
     * `adb shell input keyevent --longpress` both produce. The elapsed-time
     * arm is a fallback for remotes that repeat BACK without ever setting the
     * flag; it cannot stand alone, because an injected repeat carries no real
     * wall-clock gap and would never satisfy it.
     */
    private fun isLongPress(event: KeyEvent): Boolean =
        event.isLongPress || event.eventTime - event.downTime >= LONG_PRESS_MS

    /**
     * The store's back action, delivered as the key the viewer already listens
     * for. remote-viewer.ts binds plain `window` keydown/keyup and reads
     * `key`/`code` off the event, so a synthetic one is indistinguishable from
     * a keyboard's — no bridge object, no page-side API to keep in step.
     */
    private fun sendEscapeToPage() = sendKeyPressToPage("Escape", "Escape")

    /** A press and its release, for keys we synthesize whole (BACK). */
    private fun sendKeyPressToPage(key: String, code: String) {
        sendKeyToPage(key, code, down = true, repeat = false)
        sendKeyToPage(key, code, down = false, repeat = false)
    }

    private fun sendKeyToPage(key: String, code: String, down: Boolean, repeat: Boolean) {
        val type = if (down) "keydown" else "keyup"
        web.evaluateJavascript(
            """
            window.dispatchEvent(new KeyboardEvent('$type', {
              key: '$key', code: '$code', repeat: $repeat,
              bubbles: true, cancelable: true
            }));
            """.trimIndent(),
            null
        )
    }

    private fun openSetup() {
        startActivity(Intent(this, SetupActivity::class.java))
    }

    // ---- WebView -----------------------------------------------------------

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        // Debug builds only: makes the box show up in chrome://inspect, which
        // is the only practical way to debug a stream on a TV.
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        web.setBackgroundColor(0xFF06080F.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true // the viewer remembers its private-instance id
            // Without this the WebRTC <video> never starts: there is no "tap to
            // play" gesture on a television, and the stream is the whole app.
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
        }

        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                if (loadFailed) return // this is the error page finishing, not the store
                pageLoaded = true
                errorCard.visibility = View.GONE
                view.requestFocus()
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                // Sub-resource failures are the page's problem, not ours.
                if (!request.isForMainFrame) return
                pageLoaded = false
                loadFailed = true
                showError("${error.description} — ${request.url}")
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                // The viewer only ever receives: it opens a recvonly peer
                // connection and a data channel, and never calls
                // getUserMedia. Nothing here should be asking for a camera or
                // a microphone, so nothing here gets one.
                request.deny()
            }

            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                // The only way to see why a stream failed on a box with no
                // devtools: `adb logcat -s HalcyonTV`.
                android.util.Log.d(
                    "HalcyonTV",
                    "${msg.sourceId()}:${msg.lineNumber()} ${msg.message()}"
                )
                return true
            }
        }
    }

    private fun load(url: String) {
        loadedUrl = url
        pageLoaded = false
        loadFailed = false
        errorCard.visibility = View.GONE
        web.loadUrl(url)
        web.requestFocus()
    }

    private fun showError(detail: String) {
        errorDetail.text = detail
        errorCard.visibility = View.VISIBLE
        findViewById<Button>(R.id.retry).requestFocus()
    }

    // ---- chrome ------------------------------------------------------------

    private fun goFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onDestroy() {
        // A WebView outliving its Activity is the classic leak, and this one
        // holds a live peer connection.
        web.loadUrl("about:blank")
        (web.parent as? android.view.ViewGroup)?.removeView(web)
        web.destroy()
        super.onDestroy()
    }
}
