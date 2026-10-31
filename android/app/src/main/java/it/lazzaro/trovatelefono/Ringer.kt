package it.lazzaro.trovatelefono

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.VibratorManager
import android.util.Log

/**
 * Suoneria forzata sullo speaker interno: USAGE_ALARM + setPreferredDevice(BUILTIN_SPEAKER),
 * così non viene instradata sugli apparecchi/auricolari Bluetooth collegati.
 * Alza temporaneamente il volume ALARM al massimo e lo ripristina allo stop.
 */
class Ringer(private val ctx: Context) {

    private val tag = "Ringer"
    private val am = ctx.getSystemService(AudioManager::class.java)
    private val cam = ctx.getSystemService(CameraManager::class.java)
    private val vibrator = ctx.getSystemService(VibratorManager::class.java).defaultVibrator
    private val handler = Handler(Looper.getMainLooper())

    private var player: MediaPlayer? = null
    private var savedAlarmVolume = -1
    private var torchId: String? = null
    private var torchOn = false

    var onStateChange: ((Boolean) -> Unit)? = null
    val isRinging: Boolean get() = player != null

    private val autoStop = Runnable { stop() }

    private val torchBlink = object : Runnable {
        override fun run() {
            val id = torchId ?: return
            torchOn = !torchOn
            try { cam.setTorchMode(id, torchOn) } catch (e: Exception) { Log.w(tag, "torch: ${e.message}") }
            handler.postDelayed(this, 350)
        }
    }

    fun start(maxDurationMs: Long = 60_000) {
        if (player != null) {
            handler.removeCallbacks(autoStop)
            handler.postDelayed(autoStop, maxDurationMs)
            return
        }

        // Volume ALARM al massimo (ripristinato in stop)
        try {
            savedAlarmVolume = am.getStreamVolume(AudioManager.STREAM_ALARM)
            am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0)
        } catch (e: SecurityException) {
            Log.w(tag, "volume non modificabile (DND?): ${e.message}")
            savedAlarmVolume = -1
        }

        val speaker = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }

        val mp = MediaPlayer()
        try {
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            mp.setDataSource(ctx, pickTone())
            mp.isLooping = true
            mp.prepare()
            if (speaker != null) {
                val ok = mp.setPreferredDevice(speaker)
                Log.i(tag, "preferred speaker set: $ok")
            } else {
                Log.w(tag, "BUILTIN_SPEAKER non trovato")
            }
            mp.start()
            player = mp
        } catch (e: Exception) {
            Log.e(tag, "MediaPlayer: ${e.message}", e)
            mp.release()
            restoreVolume()
            return
        }

        vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 600, 400), 0))

        torchId = findTorch()
        if (torchId != null) handler.post(torchBlink)

        handler.postDelayed(autoStop, maxDurationMs)
        onStateChange?.invoke(true)
    }

    fun stop() {
        handler.removeCallbacks(autoStop)
        handler.removeCallbacks(torchBlink)
        torchId?.let { id -> try { cam.setTorchMode(id, false) } catch (_: Exception) {} }
        torchId = null
        torchOn = false

        player?.let {
            try { it.stop() } catch (_: Exception) {}
            it.release()
        }
        val wasRinging = player != null
        player = null
        vibrator.cancel()
        restoreVolume()
        if (wasRinging) onStateChange?.invoke(false)
    }

    private fun restoreVolume() {
        if (savedAlarmVolume >= 0) {
            try { am.setStreamVolume(AudioManager.STREAM_ALARM, savedAlarmVolume, 0) } catch (_: Exception) {}
            savedAlarmVolume = -1
        }
    }

    private fun pickTone(): Uri =
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

    private fun findTorch(): String? = try {
        cam.cameraIdList.firstOrNull { id ->
            val c = cam.getCameraCharacteristics(id)
            c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true &&
                c.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        }
    } catch (e: Exception) { null }
}
