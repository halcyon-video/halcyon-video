package video.halcyon.tv

import android.content.Context

/**
 * The one thing this app remembers: where the store is.
 *
 * What gets stored is the raw text the owner typed, not the derived URL — so
 * the setup screen can re-show a field they recognize, and so a change to how
 * [StoreAddress] normalizes input takes effect on the next launch instead of
 * being frozen into a saved string.
 */
object StorePrefs {
    private const val PREFS = "halcyon_tv"
    private const val KEY_ADDRESS = "store_address"

    fun saved(ctx: Context): String? =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ADDRESS, null)

    fun save(ctx: Context, address: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_ADDRESS, address).apply()
    }
}
