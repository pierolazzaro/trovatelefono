package it.lazzaro.trovatelefono

import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.URLDecoder

/**
 * Server HTTP minimale in ascolto SOLO su 127.0.0.1: riceve i comandi inoltrati
 * dal side service dell'app Zepp (che gira sullo stesso telefono).
 *
 *   GET /cmd?c=R|S&k=<16 hex>  -> 200 ok | 403 non accoppiato/chiave errata | 400 richiesta non valida
 *   GET /ping                  -> 200
 *
 * La validazione della chiave è la stessa del canale BLE (handler = FinderService.handleCommand).
 */
class LocalCmdServer(
    private val port: Int,
    private val handler: (Char, String) -> Boolean,
) {
    private val tag = "LocalCmdServer"
    @Volatile private var server: ServerSocket? = null
    private var thread: Thread? = null

    fun start() {
        if (thread != null) return
        thread = Thread({ loop() }, "tt-local-http").apply { isDaemon = true; start() }
    }

    fun stop() {
        try { server?.close() } catch (_: Exception) {}
        server = null
        thread?.interrupt()
        thread = null
    }

    private fun loop() {
        try {
            server = ServerSocket(port, 4, InetAddress.getLoopbackAddress())
            Log.i(tag, "in ascolto su 127.0.0.1:$port")
            while (!Thread.currentThread().isInterrupted) {
                val s = server?.accept() ?: break
                try { handle(s) } catch (e: Exception) { Log.w(tag, "richiesta: ${e.message}") }
                finally { try { s.close() } catch (_: Exception) {} }
            }
        } catch (e: Exception) {
            if (server != null) Log.e(tag, "server: ${e.message}")
        }
    }

    private fun handle(s: Socket) {
        s.soTimeout = 3000
        val reader = BufferedReader(InputStreamReader(s.getInputStream(), Charsets.US_ASCII), 1024)
        val line = try { reader.readLine() } catch (_: SocketTimeoutException) { null } ?: return
        if (line.length > 512) { reply(s, 414, "too long"); return }
        // scarto gli header
        var n = 0
        while (n++ < 50) { val h = reader.readLine() ?: break; if (h.isEmpty()) break }

        val parts = line.split(' ')
        if (parts.size < 2 || parts[0] != "GET") { reply(s, 405, "method"); return }
        val target = parts[1]
        val path = target.substringBefore('?')
        val query = target.substringAfter('?', "")
        val params = query.split('&').filter { it.contains('=') }.associate {
            val k = URLDecoder.decode(it.substringBefore('='), "UTF-8")
            val v = URLDecoder.decode(it.substringAfter('='), "UTF-8")
            k to v
        }
        when (path) {
            "/ping" -> reply(s, 200, "ok")
            "/cmd" -> {
                val c = params["c"]
                val k = params["k"]
                if (c == null || c.length != 1 || k == null || k.length > 64) { reply(s, 400, "bad"); return }
                val ok = handler(c[0], k)
                Log.i(tag, "cmd=$c esito=${if (ok) "ok" else "negato"}")
                reply(s, if (ok) 200 else 403, if (ok) "ok" else "denied")
            }
            else -> reply(s, 404, "not found")
        }
    }

    private fun reply(s: Socket, code: Int, body: String) {
        val reason = when (code) { 200 -> "OK"; 400 -> "Bad Request"; 403 -> "Forbidden"; 404 -> "Not Found"; 405 -> "Method Not Allowed"; else -> "Error" }
        val b = body.toByteArray(Charsets.UTF_8)
        val head = "HTTP/1.1 $code $reason\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${b.size}\r\nConnection: close\r\n\r\n"
        s.getOutputStream().apply { write(head.toByteArray(Charsets.US_ASCII)); write(b); flush() }
    }
}
