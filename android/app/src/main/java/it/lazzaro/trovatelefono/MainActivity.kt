package it.lazzaro.trovatelefono

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat

class MainActivity : Activity() {

    private lateinit var status: TextView

    private val perms = arrayOf(
        Manifest.permission.BLUETOOTH_ADVERTISE,
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.POST_NOTIFICATIONS,
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (16 * resources.displayMetrics.density).toInt()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(pad, pad * 3, pad, pad)
        }
        status = TextView(this).apply { textSize = 16f; setPadding(0, 0, 0, pad) }
        root.addView(status)

        fun btn(label: String, action: () -> Unit) = root.addView(
            Button(this).apply { text = label; setOnClickListener { action() } },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        )

        btn("1. Concedi permessi") { requestPermissions(perms, 1) }
        btn("2. Escludi da ottimizzazione batteria") { askBatteryExemption() }
        btn("3. Avvia servizio") { startFinder() }
        btn("4. Accoppia orologio (60 s)") {
            send(FinderService.ACTION_PAIR)
            status.text = "Accoppiamento aperto per 60 s:\npremi FAI SUONARE sull'orologio."
        }
        btn("Test suoneria (8 s, speaker)") { send(FinderService.ACTION_TEST_RING) }
        btn("Stop suoneria") { send(FinderService.ACTION_STOP_RING) }
        btn("Dimentica orologio") { send(FinderService.ACTION_UNPAIR); status.postDelayed({ refresh() }, 300) }
        btn("Ferma servizio") { stopService(Intent(this, FinderService::class.java)); refresh() }

        setContentView(root)
    }

    private val pairedReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: android.content.Context?, i: Intent?) { refresh() }
    }

    override fun onResume() {
        super.onResume()
        ContextCompat.registerReceiver(
            this, pairedReceiver, android.content.IntentFilter(FinderService.ACTION_PAIRED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        refresh()
        if (allGranted()) startFinder()
    }

    override fun onPause() {
        try { unregisterReceiver(pairedReceiver) } catch (_: Exception) {}
        super.onPause()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (allGranted()) startFinder()
        refresh()
    }

    private fun allGranted() = perms.all {
        ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }

    private fun startFinder() {
        if (!FinderService.hasBlePermissions(this)) { refresh(); return }
        ContextCompat.startForegroundService(this, Intent(this, FinderService::class.java))
        refresh()
    }

    private fun send(action: String) {
        if (!FinderService.hasBlePermissions(this)) return
        ContextCompat.startForegroundService(this, Intent(this, FinderService::class.java).setAction(action))
    }

    @SuppressLint("BatteryLife")
    private fun askBatteryExemption() {
        val pm = getSystemService(PowerManager::class.java)
        if (pm.isIgnoringBatteryOptimizations(packageName)) { refresh(); return }
        startActivity(
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
        )
    }

    private fun refresh() {
        val pm = getSystemService(PowerManager::class.java)
        status.text = buildString {
            appendLine("Permessi: " + if (allGranted()) "OK" else "MANCANTI")
            appendLine("Orologio: " + if (FinderService.isPaired(this@MainActivity)) "accoppiato" else "NON accoppiato")
            appendLine("Ottimizzazione batteria: " + if (pm.isIgnoringBatteryOptimizations(packageName)) "esclusa" else "attiva (sconsigliato)")
            appendLine()
            append("Il servizio pubblica un beacon BLE: l'app sull'orologio lo usa per misurare la vicinanza e per far suonare il telefono dallo speaker interno.")
        }
    }
}
