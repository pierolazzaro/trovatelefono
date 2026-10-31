// Configurazione condivisa con l'app Android: gli UUID devono coincidere
// con FinderService.kt (SERVICE_UUID, CMD_UUID).
// Nessun segreto nel codice: la chiave di accoppiamento è generata sull'orologio
// al primo avvio (utils/pairing.js) e accettata dal telefono solo durante la
// finestra "Accoppia orologio" dell'app Android.
export const CFG = {
  APP_ID: 1094572, // deve coincidere con app.json -> app.appId
  SERVICE_UUID: '8ac5c137-ecd6-47d4-ba18-56a57bc19f73',
  CMD_UUID: '8ac5c138-ecd6-47d4-ba18-56a57bc19f73',

  // Stima distanza (modello log-distance). Calibra RSSI_1M misurando
  // l'RSSI con telefono a 1 m (valore mostrato in piccolo sotto la distanza).
  RSSI_1M: -60,
  PATH_LOSS_N: 2.7,

  LOST_AFTER_MS: 6000, // nessun advertising per X ms => "non in vista"
  DIR_SCAN_MS: 25000, // durata massima della scansione direzionale
}
