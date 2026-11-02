import { createWidget, widget, align, text_style } from '@zos/ui'
import { launchApp } from '@zos/router'

// Widget a schermo intero (lista Widget: scorri a sinistra dal quadrante).
// Nessuna dipendenza da altri moduli dell'app; in caso di errore lo mostra a schermo.
const APP_ID = 1094572

function open(params) {
  try {
    launchApp({ appId: APP_ID, url: 'page/index', params })
  } catch (e) {
    // niente: il click non deve mai far crashare il widget
  }
}

SecondaryWidget({
  onInit() {},
  build() {
    // sfondo pieno: il widget resta visibile anche se qualcosa sotto fallisce
    createWidget(widget.FILL_RECT, { x: 0, y: 0, w: 480, h: 480, color: 0x101014 })
    try {
      createWidget(widget.TEXT, {
        x: 60, y: 70, w: 360, h: 50, color: 0xffffff, text_size: 34,
        align_h: align.CENTER_H, align_v: align.CENTER_V, text: 'Trova telefono',
      })
      createWidget(widget.BUTTON, {
        x: 80, y: 150, w: 320, h: 110, radius: 55,
        normal_color: 0xff3b30, press_color: 0x992218,
        text: 'FAI SUONARE', text_size: 38, color: 0xffffff,
        click_func: () => open('ring'),
      })
      createWidget(widget.BUTTON, {
        x: 120, y: 290, w: 240, h: 80, radius: 40,
        normal_color: 0x0a84ff, press_color: 0x05437f,
        text: 'Apri', text_size: 30, color: 0xffffff,
        click_func: () => open('open'),
      })
    } catch (e) {
      createWidget(widget.TEXT, {
        x: 40, y: 380, w: 400, h: 80, color: 0xff453a, text_size: 20,
        align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.WRAP,
        text: 'ERR ' + String(e && e.message ? e.message : e).slice(0, 60),
      })
    }
  },
  onResume() {},
  onPause() {},
  onDestroy() {},
})
