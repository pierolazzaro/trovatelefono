import { LocalStorage } from '@zos/storage'

const STORAGE_KEY = 'tt_pair_key'

// Entropia: Math.random + clock + accumulo dei valori RSSI (vedi feedEntropy).
let pool = 0x9e3779b9 ^ Date.now()

export function feedEntropy(n) {
  pool = (Math.imul(pool ^ (n | 0), 0x85ebca6b) + Date.now()) | 0
}

function randomHex(len) {
  let out = ''
  while (out.length < len) {
    feedEntropy(Math.floor(Math.random() * 0x7fffffff))
    const r = (pool ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
    out += ('00000000' + r.toString(16)).slice(-8)
  }
  return out.slice(0, len)
}

export function getPairKey() {
  const ls = new LocalStorage()
  let k = ls.getItem(STORAGE_KEY)
  if (typeof k !== 'string' || !/^[0-9a-f]{32}$/.test(k)) {
    k = randomHex(32)
    ls.setItem(STORAGE_KEY, k)
  }
  return k
}

export function resetPairKey() {
  new LocalStorage().removeItem(STORAGE_KEY)
}
