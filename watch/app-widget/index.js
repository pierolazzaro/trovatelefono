import * as zui from '@zos/ui'
import { launchApp } from '@zos/router'

// Shortcut card (scorri a destra dal quadrante).
const APP_ID = 1094572
const { createWidget, widget, align, text_style } = zui

function cardSize() {
  try {
    if (typeof zui.getAppWidgetSize === 'function') {
      const s = zui.getAppWidgetSize()
      if (s && s.w && s.h) return s
    }
  } catch (e) {}
  return { w: 392, h: 160 }
}

function open(params) {
  try {
    launchApp({ appId: APP_ID, url: 'page/index', params })
  } catch (e) {}
}

AppWidget({
  build() {
    const { w, h } = cardSize()
    createWidget(widget.FILL_RECT, { x: 0, y: 0, w, h, radius: 24, color: 0x1c1c1e })
    try {
      const pad = 12
      const bh = Math.min(80, h - 2 * pad)
      const by = Math.round((h - bh) / 2)
      const w1 = Math.round(w * 0.62) - pad
      createWidget(widget.BUTTON, {
        x: pad, y: by, w: w1, h: bh, radius: Math.round(bh / 2),
        normal_color: 0xff3b30, press_color: 0x992218,
        text: 'Fai suonare', text_size: 28, color: 0xffffff,
        click_func: () => open('ring'),
      })
      createWidget(widget.BUTTON, {
        x: pad + w1 + pad, y: by, w: w - w1 - 3 * pad, h: bh, radius: Math.round(bh / 2),
        normal_color: 0x0a84ff, press_color: 0x05437f,
        text: 'Apri', text_size: 26, color: 0xffffff,
        click_func: () => open('open'),
      })
    } catch (e) {
      createWidget(widget.TEXT, {
        x: 8, y: 8, w: w - 16, h: h - 16, color: 0xff453a, text_size: 18,
        align_h: align.CENTER_H, align_v: align.CENTER_V, text_style: text_style.WRAP,
        text: 'ERR ' + String(e && e.message ? e.message : e).slice(0, 60),
      })
    }
  },
})
