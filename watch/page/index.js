import { createWidget, widget, prop, align, text_style } from '@zos/ui'
import { setPageBrightTime, resetPageBrightTime } from '@zos/display'
import { BasePage } from '@zeppos/zml/base-page'
import { getPairKey } from '../utils/pairing'

// Percorso dei comandi: orologio -> Zepp app (side service) -> app Android su 127.0.0.1.
// La ricerca BLE diretta è stata rimossa: sul Balance 2 lo scan delle app di terze
// parti non vede il telefono in modo affidabile.

let ui = {}
let busy = false
let autoRing = false
let ringSent = false
let pageRef = null

function setText(w, t) {
  if (w) w.setProperty(prop.TEXT, t)
}

function setLink(t, color) {
  if (!ui.link) return
  ui.link.setProperty(prop.MORE, { text: t, color })
}

function status(t) {
  setText(ui.status, t)
}

function errText(e) {
  return String(e && e.message ? e.message : e).slice(0, 26)
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

function request(method, params, ms) {
  if (!pageRef || typeof pageRef.request !== 'function') {
    return Promise.reject(new Error('zml non disponibile'))
  }
  let req
  try {
    req = pageRef.request({ method, params })
  } catch (e) {
    return Promise.reject(e)
  }
  return withTimeout(req, ms)
}

function sendCmd(cmd) {
  if (busy) return
  busy = true
  status(cmd === 'R' ? 'Invio…' : 'Arresto…')
  let key
  try {
    key = getPairKey()
  } catch (e) {
    busy = false
    status('Err: ' + errText(e))
    return
  }
  request('tt.cmd', { c: cmd, k: key }, 9000)
    .then((r) => {
      busy = false
      const st = r && r.status
      if (st === 200) {
        status(cmd === 'R' ? 'Il telefono suona!' : 'Fermato')
        setLink('Collegato ✓', 0x30d158)
      } else if (st === 403) {
        status('Premi "Accoppia" sul telefono')
        if (cmd === 'R') ringSent = false
      } else {
        status('Errore tel ' + st + (r && r.reason ? ' ' + String(r.reason).slice(0, 16) : ''))
        if (cmd === 'R') ringSent = false
      }
    })
    .catch((e) => {
      busy = false
      status('Zepp: ' + errText(e))
      if (cmd === 'R') ringSent = false
    })
}

// Test all'apertura: orologio -> Zepp app -> app Android
function checkLink() {
  setLink('Verifica collegamento…', 0x888888)
  request('tt.ping', {}, 8000)
    .then((r) => {
      const st = r && r.status
      if (st === 200) setLink('Collegato ✓', 0x30d158)
      else setLink('App telefono non attiva (' + st + ')', 0xff9500)
    })
    .catch((e) => setLink('Zepp app non raggiungibile', 0xff9500))
}

Page(BasePage({
  onInit(params) {
    pageRef = this
    const p = typeof params === 'string' ? params : ''
    autoRing = p.indexOf('ring') >= 0
  },

  build() {
    pageRef = this
    try { setPageBrightTime({ brightTime: 60000 }) } catch (e) {}

    createWidget(widget.TEXT, {
      x: 60, y: 62, w: 360, h: 50, color: 0xffffff, text_size: 34,
      align_h: align.CENTER_H, align_v: align.CENTER_V, text: 'Trova telefono',
    })
    ui.link = createWidget(widget.TEXT, {
      x: 60, y: 112, w: 360, h: 34, color: 0x888888, text_size: 22,
      align_h: align.CENTER_H, align_v: align.CENTER_V, text: '',
    })
    ui.status = createWidget(widget.TEXT, {
      x: 60, y: 146, w: 360, h: 60, color: 0xffd60a, text_size: 24,
      align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.WRAP, text: '',
    })

    createWidget(widget.BUTTON, {
      x: 70, y: 214, w: 340, h: 110, radius: 55,
      normal_color: 0xff3b30, press_color: 0x992218,
      text: 'FAI SUONARE', text_size: 40, color: 0xffffff,
      click_func: () => sendCmd('R'),
    })
    createWidget(widget.BUTTON, {
      x: 130, y: 342, w: 220, h: 76, radius: 38,
      normal_color: 0x3a3a3c, press_color: 0x1c1c1e,
      text: 'STOP', text_size: 30, color: 0xffffff,
      click_func: () => sendCmd('S'),
    })

    if (autoRing && !ringSent) {
      ringSent = true
      setTimeout(() => sendCmd('R'), 300)
    } else {
      setTimeout(checkLink, 300)
    }
  },

  onDestroy() {
    try { resetPageBrightTime() } catch (e) {}
    ui = {}
    busy = false
    ringSent = false
    pageRef = null
  },
}))
