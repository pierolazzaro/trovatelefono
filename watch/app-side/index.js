import { BaseSideService } from '@zeppos/zml/base-side'

// Side service: gira dentro la Zepp app sul telefono. Inoltra i comandi
// dell'orologio all'app Android "Trova Telefono" via HTTP su loopback.
const LOCAL_URL = 'http://127.0.0.1:47811/cmd'

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    onRequest(req, res) {
      if (req && req.method === 'tt.ping') {
        this.fetch({ method: 'GET', url: 'http://127.0.0.1:47811/ping' })
          .then((r) => res(null, { status: r && r.status ? r.status : 0 }))
          .catch((e) => res(null, { status: 0, error: String(e) }))
        return
      }
      if (!req || req.method !== 'tt.cmd') {
        res({ status: 'error', message: 'metodo sconosciuto' })
        return
      }
      const p = req.params || {}
      const c = String(p.c || '')
      const k = String(p.k || '')
      if (!/^[RS]$/.test(c) || !/^[0-9a-f]{16}$/.test(k)) {
        res(null, { status: 400, reason: 'c=' + c + ' klen=' + k.length })
        return
      }
      this.fetch({ method: 'GET', url: LOCAL_URL + '?c=' + c + '&k=' + k })
        .then((r) => {
          const body = r && r.body !== undefined ? (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) : ''
          res(null, { status: r && r.status ? r.status : 0, reason: body.slice(0, 20) })
        })
        .catch((e) => res(null, { status: 0, reason: String(e).slice(0, 40) }))
    },
  }),
)
