package it.lazzaro.trovatelefono

import android.content.Context
import android.media.RingtoneManager
import android.net.Uri

/** Suono scelto dall'utente (suoneria di sistema o file audio), salvato nelle preferenze. */
object SoundPrefs {
    private const val KEY_URI = "sound_uri"

    fun defaultUri(): Uri =
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

    fun get(ctx: Context): Uri? =
        ctx.getSharedPreferences(FinderService.PREFS, Context.MODE_PRIVATE)
            .getString(KEY_URI, null)?.let { runCatching { Uri.parse(it) }.getOrNull() }

    fun set(ctx: Context, uri: Uri?) {
        ctx.getSharedPreferences(FinderService.PREFS, Context.MODE_PRIVATE).edit().apply {
            if (uri == null) remove(KEY_URI) else putString(KEY_URI, uri.toString())
        }.apply()
    }

    fun effective(ctx: Context): Uri = get(ctx) ?: defaultUri()

    fun label(ctx: Context): String {
        val uri = get(ctx) ?: return "Predefinito (sveglia)"
        return runCatching { RingtoneManager.getRingtone(ctx, uri)?.getTitle(ctx) }.getOrNull()
            ?: uri.lastPathSegment ?: "Personalizzato"
    }
}
