// Widget (lista Widget: scorri a sinistra dal quadrante): FAI SUONARE e STOP senza aprire l'app.
// Struttura allineata al widget "Bollature" che funziona sullo stesso Balance 2:
// SecondaryWidget(BasePage(...)), API target 4.2, nessuna shortcut card nello stesso pacchetto.
import { createWidget, widget, align, prop, text_style } from '@zos/ui'
import { px } from '@zos/utils'
import { BasePage } from '@zeppos/zml/base-page'
import { getPairKey } from '../utils/pairing'

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

SecondaryWidget(
  BasePage({
    state: { busy: false },

    build() {
      createWidget(widget.TEXT, {
        x: px(40), y: px(70), w: px(400), h: px(50), color: 0xffffff, text_size: px(34),
        align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.NONE,
        text: 'Trova telefono',
      })
      this.statusText = createWidget(widget.TEXT, {
        x: px(40), y: px(122), w: px(400), h: px(40), color: 0xffd60a, text_size: px(24),
        align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.NONE,
        text: '',
      })
      createWidget(widget.BUTTON, {
        x: px(80), y: px(176), w: px(320), h: px(110), radius: px(55),
        normal_color: 0xff3b30, press_color: 0x992218,
        text: 'FAI SUONARE', text_size: px(38), color: 0xffffff,
        click_func: () => this.send('R'),
      })
      createWidget(widget.BUTTON, {
        x: px(130), y: px(304), w: px(220), h: px(80), radius: px(40),
        normal_color: 0x3a3a3c, press_color: 0x1c1c1e,
        text: 'STOP', text_size: px(30), color: 0xffffff,
        click_func: () => this.send('S'),
      })
    },

    setStatus(t) {
      if (this.statusText) this.statusText.setProperty(prop.TEXT, t)
    },

    send(cmd) {
      if (this.state.busy) return
      this.state.busy = true
      this.setStatus(cmd === 'R' ? 'Invio…' : 'Arresto…')
      let req
      try {
        req = this.request({ method: 'tt.cmd', params: { c: cmd, k: getPairKey() } })
      } catch (e) {
        this.state.busy = false
        this.setStatus('Errore: ' + String(e && e.message ? e.message : e).slice(0, 20))
        return
      }
      withTimeout(req, 9000)
        .then((r) => {
          this.state.busy = false
          const st = r && r.status
          if (st === 200) this.setStatus(cmd === 'R' ? 'Il telefono suona!' : 'Fermato')
          else if (st === 403) this.setStatus('Premi Accoppia sul telefono')
          else this.setStatus('Errore telefono ' + st)
        })
        .catch(() => {
          this.state.busy = false
          this.setStatus('Zepp app non raggiungibile')
        })
    },

    onResume() {
      this.setStatus('')
    },
  }),
)
