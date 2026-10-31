package it.lazzaro.trovatelefono

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import java.security.MessageDigest
import java.util.UUID

class FinderService : Service() {

    companion object {
        // Devono coincidere con watch/utils/config.js
        val SERVICE_UUID: UUID = UUID.fromString("8ac5c137-ecd6-47d4-ba18-56a57bc19f73")
        val CMD_UUID: UUID = UUID.fromString("8ac5c138-ecd6-47d4-ba18-56a57bc19f73")

        const val ACTION_STOP_RING = "it.lazzaro.trovatelefono.STOP_RING"
        const val ACTION_TEST_RING = "it.lazzaro.trovatelefono.TEST_RING"
        const val ACTION_PAIR = "it.lazzaro.trovatelefono.PAIR"
        const val ACTION_UNPAIR = "it.lazzaro.trovatelefono.UNPAIR"
        const val ACTION_PAIRED = "it.lazzaro.trovatelefono.PAIRED"

        const val PREFS = "finder"
        const val PREF_KEY = "pair_key"
        const val PAIR_WINDOW_MS = 60_000L

        private const val CH_SERVICE = "finder_service"
        private const val CH_ALERT = "finder_alert"
        private const val NOTIF_ID = 1
        private const val MIN_CMD_INTERVAL_MS = 1500L
        private const val TAG = "FinderService"
        private val KEY_RE = Regex("^[0-9a-f]{32}$")

        fun isPaired(ctx: Context): Boolean =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_KEY, null) != null

        fun hasBlePermissions(ctx: Context): Boolean =
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.BLUETOOTH_ADVERTISE) == PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(ctx, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var btManager: BluetoothManager
    private lateinit var ringer: Ringer
    private var gattServer: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var advertising = false
    private var lastCmdAt = 0L
    @Volatile private var pairUntil = 0L
    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        btManager = getSystemService(BluetoothManager::class.java)
        ringer = Ringer(this).apply { onStateChange = { updateNotification(it) } }
        createChannels()
        startForeground(NOTIF_ID, buildNotification(false), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)

        ContextCompat.registerReceiver(
            this, btStateReceiver, IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        startBle()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP_RING -> ringer.stop()
            ACTION_TEST_RING -> ringer.start(8_000)
            ACTION_PAIR -> pairUntil = SystemClock.elapsedRealtime() + PAIR_WINDOW_MS
            ACTION_UNPAIR -> { prefs.edit().remove(PREF_KEY).apply(); pairUntil = 0L }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        ringer.stop()
        stopBle()
        try { unregisterReceiver(btStateReceiver) } catch (_: Exception) {}
        super.onDestroy()
    }

    // ---------------- BLE ----------------

    @SuppressLint("MissingPermission")
    private fun startBle() {
        if (!hasBlePermissions(this)) {
            Log.w(TAG, "permessi BLE mancanti")
            stopSelf()
            return
        }
        val adapter = btManager.adapter ?: return
        if (!adapter.isEnabled) {
            Log.i(TAG, "Bluetooth spento, attendo")
            return
        }

        if (gattServer == null) {
            gattServer = btManager.openGattServer(this, gattCallback)?.also { srv ->
                val svc = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
                val cmd = BluetoothGattCharacteristic(
                    CMD_UUID,
                    BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
                    BluetoothGattCharacteristic.PERMISSION_WRITE
                )
                svc.addCharacteristic(cmd)
                srv.addService(svc)
            }
        }
        advertiser = adapter.bluetoothLeAdvertiser
        startAdvertising()
    }

    @SuppressLint("MissingPermission")
    private fun startAdvertising() {
        if (advertising || !hasBlePermissions(this)) return
        val adv = advertiser ?: return
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .setTimeout(0)
            .build()
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()
        try {
            adv.startAdvertising(settings, data, advCallback)
        } catch (e: Exception) {
            Log.e(TAG, "startAdvertising: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopAdvertising() {
        if (!advertising) return
        try { advertiser?.stopAdvertising(advCallback) } catch (_: Exception) {}
        advertising = false
    }

    private fun restartAdvertising() {
        stopAdvertising()
        handler.postDelayed({ startAdvertising() }, 300)
    }

    @SuppressLint("MissingPermission")
    private fun stopBle() {
        stopAdvertising()
        try { gattServer?.close() } catch (_: Exception) {}
        gattServer = null
    }

    private val advCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            advertising = true
            Log.i(TAG, "advertising attivo")
        }

        override fun onStartFailure(errorCode: Int) {
            advertising = errorCode == ADVERTISE_FAILED_ALREADY_STARTED
            Log.e(TAG, "advertising fallito: $errorCode")
            if (!advertising) handler.postDelayed({ startAdvertising() }, 5_000)
        }
    }

    private val gattCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            Log.i(TAG, "GATT state=$newState status=$status")
            // Alcuni stack fermano l'advertising legacy alla connessione: lo riavvio
            if (newState == BluetoothProfile.STATE_DISCONNECTED || newState == BluetoothProfile.STATE_CONNECTED) {
                handler.post { restartAdvertising() }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice, requestId: Int, characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean, responseNeeded: Boolean, offset: Int, value: ByteArray?
        ) {
            val cmd = parseCommand(characteristic.uuid, offset, value)
            if (responseNeeded) {
                gattServer?.sendResponse(
                    device, requestId,
                    if (cmd != null) BluetoothGatt.GATT_SUCCESS else BluetoothGatt.GATT_WRITE_NOT_PERMITTED,
                    0, null
                )
            }
            if (cmd == null) return

            val now = SystemClock.elapsedRealtime()
            if (cmd == 'R' && now - lastCmdAt < MIN_CMD_INTERVAL_MS) return
            lastCmdAt = now

            handler.post {
                when (cmd) {
                    'R' -> ringer.start()
                    'S' -> ringer.stop()
                }
            }
        }
    }

    /**
     * Formato atteso: "R:<key>" oppure "S:<key>", key = 32 caratteri hex generati dall'orologio.
     * Se nessuna chiave è salvata, o se la finestra di accoppiamento è aperta,
     * la chiave ricevuta viene memorizzata (trust on first use controllato dall'utente).
     */
    private fun parseCommand(uuid: UUID, offset: Int, value: ByteArray?): Char? {
        if (uuid != CMD_UUID || offset != 0 || value == null || value.size !in 3..64) return null
        val s = try { String(value, Charsets.UTF_8).trim() } catch (_: Exception) { return null }
        if (s.length != 34 || s[1] != ':') return null
        val op = s[0]
        if (op != 'R' && op != 'S') return null
        val key = s.substring(2)
        if (!KEY_RE.matches(key)) return null

        val stored = prefs.getString(PREF_KEY, null)
        val pairing = SystemClock.elapsedRealtime() < pairUntil
        if (pairing) {
            prefs.edit().putString(PREF_KEY, key).apply()
            pairUntil = 0L
            Log.i(TAG, "orologio accoppiato")
            sendBroadcast(Intent(ACTION_PAIRED).setPackage(packageName))
            return op
        }
        if (stored == null) {
            Log.w(TAG, "nessun orologio accoppiato: premi Accoppia nell'app")
            return null
        }
        if (!MessageDigest.isEqual(key.toByteArray(Charsets.US_ASCII), stored.toByteArray(Charsets.US_ASCII))) {
            Log.w(TAG, "chiave non valida")
            return null
        }
        return op
    }

    private val btStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1)) {
                BluetoothAdapter.STATE_ON -> handler.postDelayed({ startBle() }, 500)
                BluetoothAdapter.STATE_TURNING_OFF, BluetoothAdapter.STATE_OFF -> {
                    advertising = false
                    gattServer = null
                }
            }
        }
    }

    // ---------------- Notifiche ----------------

    private fun createChannels() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CH_SERVICE, "Servizio Trova Telefono", NotificationManager.IMPORTANCE_MIN)
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_ALERT, "Telefono in suoneria", NotificationManager.IMPORTANCE_HIGH)
        )
    }

    private fun buildNotification(ringing: Boolean): Notification {
        val openApp = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val b = Notification.Builder(this, if (ringing) CH_ALERT else CH_SERVICE)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentIntent(openApp)
            .setOngoing(true)
        if (ringing) {
            val stop = PendingIntent.getService(
                this, 1, Intent(this, FinderService::class.java).setAction(ACTION_STOP_RING),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            b.setContentTitle("Il telefono sta suonando")
                .setContentText("Avviato dall'orologio")
                .setCategory(Notification.CATEGORY_ALARM)
                .addAction(Notification.Action.Builder(null, "STOP", stop).build())
        } else {
            b.setContentTitle("Trova Telefono attivo")
                .setContentText("In ascolto dell'orologio")
                .setCategory(Notification.CATEGORY_SERVICE)
        }
        return b.build()
    }

    private fun updateNotification(ringing: Boolean) {
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification(ringing))
    }
}
