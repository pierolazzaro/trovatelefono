import { createWidget, widget, prop, align, text_style } from '@zos/ui'
import { mstStartScan, mstStopScan } from '@zos/ble'
import { Compass } from '@zos/sensor'
import { setPageBrightTime, resetPageBrightTime } from '@zos/display'
import BLEMaster from '@silver-zepp/easy-ble'
import { CFG } from '../utils/config'
import { getPairKey, feedEntropy } from '../utils/pairing'

const W = 480
const CX = 240
const CY = 240

// ---------- stato ----------
let ui = {}
let scanning = false
let busy = false
let phoneMac = null
let lastSeen = 0
let ema = null
let history = [] // [{t, v}] per il trend
let autoRing = false
let ringSent = false
let refreshTimer = null

// direzione
let compass = null
let heading = null // 0..360, null se non calibrata
let dirMode = 'off' // off | collect | point
let dirStart = 0
let bins = [] // 36 bin da 10°
let bestHeading = null

// ---------- util ----------
const norm = (s) => String(s || '').toLowerCase().replace(/[^0-9a-f]/g, '')
const SVC = norm(CFG.SERVICE_UUID)
const SVC_REV = SVC.match(/../g).reverse().join('')

function matchesService(arr) {
  if (!arr || !arr.length) return false
  for (let i = 0; i < arr.length; i++) {
    const u = norm(arr[i])
    if (u === SVC || u === SVC_REV) return true
  }
  return false
}

function ab2mac(buf) {
  const b = new Uint8Array(buf)
  const out = []
  for (let i = 0; i < b.length; i++) out.push((b[i] < 16 ? '0' : '') + b[i].toString(16))
  return out.join(':')
}

function estDistance(rssi) {
  const d = Math.pow(10, (CFG.RSSI_1M - rssi) / (10 * CFG.PATH_LOSS_N))
  return d < 10 ? d.toFixed(1) + ' m' : Math.round(d) + ' m'
}

function setText(w, t) {
  if (w) w.setProperty(prop.TEXT, t)
}

function status(t) {
  setText(ui.status, t)
}

// ---------- BLE scan (RSSI) ----------
function onScan(r) {
  if (!r || !matchesService(r.service_uuid_array)) return
  const now = Date.now()
  phoneMac = ab2mac(r.dev_addr)
  lastSeen = now
  ema = ema === null ? r.rssi : ema * 0.75 + r.rssi * 0.25
  feedEntropy(r.rssi)

  if (dirMode === 'collect' && heading !== null) {
    const b = Math.floor(heading / 10) % 36
    bins[b].sum += r.rssi
    bins[b].n++
  }

  if (autoRing && !ringSent && !busy) {
    ringSent = true
    sendCmd('R')
  }
}

function startScan() {
  if (scanning || busy) return
  scanning = mstStartScan(onScan)
  if (!scanning) status('Scansione BLE non avviata')
}

function stopScan() {
  if (!scanning) return
  try { mstStopScan() } catch (e) {}
  scanning = false
}

// ---------- comandi al telefono (GATT write) ----------
function sendCmd(cmd) {
  if (busy) return
  if (!phoneMac || Date.now() - lastSeen > CFG.LOST_AFTER_MS) {
    status('Telefono non in vista')
    if (cmd === 'R') ringSent = false
    return
  }
  busy = true
  stopScan()
  status(cmd === 'R' ? 'Connessione…' : 'Arresto…')

  const ble = new BLEMaster()
  let finished = false
  let guard = null

  const done = (msg) => {
    if (finished) return
    finished = true
    if (guard) clearTimeout(guard)
    try { ble.off.deregisterAll() } catch (e) {}
    try { ble.quit() } catch (e) {}
    busy = false
    status(msg)
    setTimeout(startScan, 700)
  }

  guard = setTimeout(() => done('Timeout connessione'), 10000)

  const services = {}
  services[CFG.SERVICE_UUID] = {}
  services[CFG.SERVICE_UUID][CFG.CMD_UUID] = []

  const ok = ble.connect(phoneMac, (res) => {
    if (finished) return
    if (!res.connected) {
      if (res.status === 'in progress') return
      done('Connessione fallita (' + res.status + ')')
      return
    }
    const profile = ble.generateProfileObject(services)
    ble.startListener(profile, (resp) => {
      if (finished) return
      if (!resp.success) {
        done('Profilo GATT fallito')
        return
      }
      ble.on.charaWriteComplete((uuid, st) => {
        if (st === 0) done(cmd === 'R' ? 'Il telefono suona!' : 'Fermato')
        else done('Premi "Accoppia" sul tel.')
      })
      ble.write.characteristic(CFG.CMD_UUID, cmd + ':' + getPairKey())
    })
  })
  if (!ok) done('Connect non avviato')
}

// ---------- direzione (body shadowing + bussola) ----------
function onCompass() {
  if (!compass) return
  const a = compass.getStatus() ? compass.getDirectionAngle() : 'INVALID'
  heading = a === 'INVALID' || typeof a !== 'number' ? null : a
}

function startDirection() {
  if (!compass) {
    compass = new Compass()
    compass.onChange(onCompass)
    compass.start()
  }
  bins = []
  for (let i = 0; i < 36; i++) bins.push({ sum: 0, n: 0 })
  bestHeading = null
  dirMode = 'collect'
  dirStart = Date.now()
  ui.dot.setProperty(prop.VISIBLE, false)
  setText(ui.hint, 'Braccio davanti al petto,\nruota lentamente 360°')
}

function finishDirection() {
  let covered = 0
  let best = -1
  let bestVal = -999
  for (let i = 0; i < 36; i++) if (bins[i].n) covered++
  if (covered < 18) {
    dirMode = 'off'
    setText(ui.hint, 'Rotazione incompleta, riprova')
    return
  }
  for (let i = 0; i < 36; i++) {
    let s = 0
    let n = 0
    for (let k = -1; k <= 1; k++) {
      const b = bins[(i + k + 36) % 36]
      if (b.n) { s += b.sum / b.n; n++ }
    }
    if (n && s / n > bestVal) { bestVal = s / n; best = i }
  }
  bestHeading = best * 10 + 5
  dirMode = 'point'
  setText(ui.hint, 'Segui il punto (stima)')
}

function coveredBins() {
  let c = 0
  for (let i = 0; i < 36; i++) if (bins[i].n) c++
  return c
}

function updatePointer() {
  if (dirMode !== 'point' || heading === null || bestHeading === null) {
    ui.dot.setProperty(prop.VISIBLE, false)
    return
  }
  const rel = (((bestHeading - heading) % 360) + 360) % 360
  const rad = (rel * Math.PI) / 180
  const r = 168
  ui.dot.setProperty(prop.MORE, {
    center_x: Math.round(CX + r * Math.sin(rad)),
    center_y: Math.round(CY - r * Math.cos(rad)),
    radius: 16,
    color: 0x00e5ff,
  })
  ui.dot.setProperty(prop.VISIBLE, true)
}

// ---------- refresh UI ----------
function refresh() {
  const now = Date.now()
  const lost = !lastSeen || now - lastSeen > CFG.LOST_AFTER_MS

  if (lost || ema === null) {
    setText(ui.big, '--')
    setText(ui.small, '')
    setText(ui.trend, lastSeen ? 'Segnale perso' : 'Cerco il telefono…')
    ui.arc.setProperty(prop.MORE, { end_angle: -90, color: 0x444444 })
  } else {
    const pct = Math.max(0, Math.min(1, (ema + 100) / 60))
    const color = pct > 0.7 ? 0xff3b30 : pct > 0.4 ? 0xff9500 : 0x0a84ff
    ui.arc.setProperty(prop.MORE, { end_angle: Math.round(-90 + 360 * pct), color })
    setText(ui.big, '≈ ' + estDistance(ema))
    setText(ui.small, Math.round(ema) + ' dBm')

    history.push({ t: now, v: ema })
    while (history.length && now - history[0].t > 2500) history.shift()
    const d = ema - history[0].v
    setText(ui.trend, d > 2 ? 'Più caldo ▲' : d < -2 ? 'Più freddo ▼' : 'Stabile')
  }

  if (dirMode === 'collect') {
    if (heading === null) setText(ui.hint, 'Calibra la bussola\n(muovi il polso a 8)')
    else setText(ui.hint, 'Ruota… ' + Math.round((coveredBins() / 36) * 100) + '%')
    if (coveredBins() >= 32 || now - dirStart > CFG.DIR_SCAN_MS) finishDirection()
  }
  updatePointer()
}

// ---------- pagina ----------
Page({
  onInit(params) {
    const p = typeof params === 'string' ? params : ''
    autoRing = p.indexOf('ring') >= 0
  },

  build() {
    try { setPageBrightTime({ brightTime: 120000 }) } catch (e) {}

    createWidget(widget.ARC, {
      x: 20, y: 20, w: 440, h: 440,
      start_angle: -90, end_angle: 270, color: 0x222222, line_width: 18,
    })
    ui.arc = createWidget(widget.ARC, {
      x: 20, y: 20, w: 440, h: 440,
      start_angle: -90, end_angle: -90, color: 0x444444, line_width: 18,
    })
    ui.dot = createWidget(widget.CIRCLE, { center_x: CX, center_y: 72, radius: 16, color: 0x00e5ff })
    ui.dot.setProperty(prop.VISIBLE, false)

    ui.status = createWidget(widget.TEXT, {
      x: 90, y: 78, w: 300, h: 40, color: 0xaaaaaa, text_size: 24,
      align_h: align.CENTER_H, align_v: align.CENTER_V, text: 'Trova telefono',
    })
    ui.big = createWidget(widget.TEXT, {
      x: 60, y: 120, w: 360, h: 80, color: 0xffffff, text_size: 64,
      align_h: align.CENTER_H, align_v: align.CENTER_V, text: '--',
    })
    ui.small = createWidget(widget.TEXT, {
      x: 140, y: 196, w: 200, h: 30, color: 0x888888, text_size: 22,
      align_h: align.CENTER_H, align_v: align.CENTER_V, text: '',
    })
    ui.trend = createWidget(widget.TEXT, {
      x: 90, y: 228, w: 300, h: 40, color: 0xffd60a, text_size: 30,
      align_h: align.CENTER_H, align_v: align.CENTER_V, text: 'Cerco il telefono…',
    })
    ui.hint = createWidget(widget.TEXT, {
      x: 100, y: 266, w: 280, h: 52, color: 0x00e5ff, text_size: 20,
      align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.WRAP, text: '',
    })

    createWidget(widget.BUTTON, {
      x: 100, y: 322, w: 280, h: 64, radius: 32,
      normal_color: 0xff3b30, press_color: 0x992218,
      text: 'FAI SUONARE', text_size: 30, color: 0xffffff,
      click_func: () => sendCmd('R'),
    })
    createWidget(widget.BUTTON, {
      x: 112, y: 396, w: 124, h: 52, radius: 26,
      normal_color: 0x333333, press_color: 0x1a1a1a,
      text: 'STOP', text_size: 24, color: 0xffffff,
      click_func: () => sendCmd('S'),
    })
    createWidget(widget.BUTTON, {
      x: 244, y: 396, w: 124, h: 52, radius: 26,
      normal_color: 0x0a84ff, press_color: 0x05437f,
      text: 'DIREZ.', text_size: 24, color: 0xffffff,
      click_func: () => startDirection(),
    })

    startScan()
    refreshTimer = setInterval(refresh, 300)
  },

  onDestroy() {
    if (refreshTimer) clearInterval(refreshTimer)
    stopScan()
    if (compass) {
      try { compass.offChange(onCompass); compass.stop() } catch (e) {}
      compass = null
    }
    try { resetPageBrightTime() } catch (e) {}
    ui = {}
    phoneMac = null; lastSeen = 0; ema = null; history = []
    busy = false; ringSent = false; dirMode = 'off'
  },
})
