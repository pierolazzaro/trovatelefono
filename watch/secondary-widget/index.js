import { createWidget, widget, align } from '@zos/ui'
import { launchApp } from '@zos/router'
import { CFG } from '../utils/config'

// Widget a schermo intero (lista Widget: scorri a sinistra dal quadrante)
SecondaryWidget({
  build() {
    createWidget(widget.TEXT, {
      x: 60, y: 70, w: 360, h: 50, color: 0xffffff, text_size: 34,
      align_h: align.CENTER_H, align_v: align.CENTER_V, text: 'Trova telefono',
    })
    createWidget(widget.BUTTON, {
      x: 80, y: 150, w: 320, h: 110, radius: 55,
      normal_color: 0xff3b30, press_color: 0x992218,
      text: 'FAI SUONARE', text_size: 38, color: 0xffffff,
      click_func: () => launchApp({ appId: CFG.APP_ID, url: 'page/index', params: 'ring' }),
    })
    createWidget(widget.BUTTON, {
      x: 120, y: 290, w: 240, h: 80, radius: 40,
      normal_color: 0x0a84ff, press_color: 0x05437f,
      text: 'Cerca', text_size: 30, color: 0xffffff,
      click_func: () => launchApp({ appId: CFG.APP_ID, url: 'page/index', params: 'find' }),
    })
  },
})
