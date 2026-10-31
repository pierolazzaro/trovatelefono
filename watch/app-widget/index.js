import * as zui from '@zos/ui'
import { launchApp } from '@zos/router'
import { CFG } from '../utils/config'

const { createWidget, widget, align } = zui

function cardSize() {
  try {
    if (typeof zui.getAppWidgetSize === 'function') {
      const s = zui.getAppWidgetSize()
      if (s && s.w && s.h) return s
    }
  } catch (e) {}
  return { w: 392, h: 160 }
}

AppWidget({
  build() {
    const { w, h } = cardSize()
    const pad = 12
    const bh = Math.min(72, h - 2 * pad)

    createWidget(widget.BUTTON, {
      x: pad, y: Math.round((h - bh) / 2), w: Math.round(w * 0.62) - pad, h: bh, radius: bh / 2,
      normal_color: 0xff3b30, press_color: 0x992218,
      text: 'Fai suonare', text_size: 28, color: 0xffffff,
      click_func: () => launchApp({ appId: CFG.APP_ID, url: 'page/index', params: 'ring' }),
    })
    createWidget(widget.BUTTON, {
      x: Math.round(w * 0.62) + pad / 2, y: Math.round((h - bh) / 2),
      w: w - Math.round(w * 0.62) - pad * 1.5, h: bh, radius: bh / 2,
      normal_color: 0x0a84ff, press_color: 0x05437f,
      text: 'Cerca', text_size: 26, color: 0xffffff,
      click_func: () => launchApp({ appId: CFG.APP_ID, url: 'page/index', params: 'find' }),
    })
  },
})
