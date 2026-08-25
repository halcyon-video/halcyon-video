package video.halcyon.tv

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Where the store's address gets typed. Manual entry only, on purpose: mDNS
 * discovery is the nicer answer and it is on the issue's own "later" list, but
 * a box that cannot be told an address is useless the first time discovery
 * misses, and discovery misses across VLANs and on guest networks.
 *
 * Typing on a d-pad keyboard is miserable, so this screen tries to be typed at
 * exactly once: what you enter is normalized generously (see [StoreAddress])
 * and remembered, and the app opens straight into the store forever after.
 */
class SetupActivity : AppCompatActivity() {

    private lateinit var address: EditText
    private lateinit var message: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        address = findViewById(R.id.address)
        message = findViewById(R.id.message)

        // Re-typing an address to change one digit of it is the common case.
        StorePrefs.saved(this)?.let { address.setText(it) }

        val connect = findViewById<Button>(R.id.connect)
        connect.setOnClickListener { commit() }

        // The on-screen keyboard's own "Go" key, so a d-pad user never has to
        // dismiss the keyboard and hunt for the button.
        address.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO) { commit(); true } else false
        }

        address.requestFocus()
    }

    private fun commit() {
        val typed = address.text.toString()
        val url = StoreAddress.viewerUrl(typed)
        if (url == null) {
            message.text = getString(R.string.setup_empty)
            message.visibility = View.VISIBLE
            return
        }
        // Store what was typed, not the derived URL: the next visit re-shows a
        // field the owner recognizes, and the viewer URL is rebuilt from it.
        StorePrefs.save(this, typed.trim())

        startActivity(
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        )
        finish()
    }
}
