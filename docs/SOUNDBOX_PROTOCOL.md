# One PayAlert Soundbox — MQTT protocol (v1)

For firmware developers. A soundbox is a speaker at the counter that announces every successful payment. It connects to the One PayAlert MQTT broker (EMQX) and only ever talks to its own topics.

## 1. Identity and connection

| Setting | Value |
|---|---|
| Broker | `mqtts://<broker host>:8883` in production (TLS); `mqtt://localhost:1883` in development |
| Protocol | MQTT 5 (3.1.1 works, but commands then have no expiry) |
| Client ID | the serial number, e.g. `SBX-000123` |
| Username | the serial number (same as the client ID; any other client ID is refused) |
| Password | the device password issued by MysoftKH when the device is registered (shown once; flash it at the factory) |
| Clean start | `true` |
| Keep alive | 30–60 s |
| Last will | topic `onepay/d/<serial>/status`, payload `offline`, QoS 1, **retained** |

Serial numbers are 5–32 characters: `A–Z`, `0–9` and `-`, starting with a letter or digit.

The box label carries the **claim code** (`XXXX-XXXX`). The merchant types the serial number and the claim code into the One PayAlert dashboard to add the device to their shop. The firmware never needs the claim code.

A device that MysoftKH disables, or whose password is rotated, is refused at its next connection (`Not authorized`). It should keep retrying with back-off (for example 5 s, 10 s, 30 s, then every 60 s) and not erase its configuration.

## 2. Topics

| Topic | Direction | QoS | Retained | Payload |
|---|---|---|---|---|
| `onepay/d/<serial>/cmd` | platform → device | 1 | no | JSON command (§3) |
| `onepay/d/<serial>/status` | device → platform | 1 | **yes** | `online` or `offline` |
| `onepay/d/<serial>/telemetry` | device → platform | 0 or 1 | no | JSON telemetry (§4) |

The broker refuses everything else, including other devices' topics, wildcards and publishing to `cmd`.

On every (re)connect, the device:
1. publishes `online` (retained) to `status`,
2. subscribes to `cmd` with QoS 1,
3. publishes one telemetry message, then one every 60 s while connected.

Before a deliberate shutdown, publish `offline` (retained) yourself; a clean disconnect does not trigger the last will.

## 3. Commands (`cmd`)

UTF-8 JSON. Unknown `type` values and unknown fields must be ignored (the platform may add some). With MQTT 5, commands expire after 60 seconds: a device that was offline never announces an old payment when it reconnects.

### `payment` — announce money received
```json
{
  "type": "payment",
  "id": "2f0c…",
  "amountMinor": 1250,
  "currency": "USD",
  "amount": "12.50",
  "text": "បានទទួលប្រាក់ 12.50$",
  "locale": "km",
  "volume": 80,
  "simulated": false,
  "verified": true,
  "occurredAt": "2026-11-12T05:08:27.000Z"
}
```
- Sent only when a payment becomes **successful**. Pending, failed and reversed payments are never announced.
- `amount` is a plain decimal string (USD: 2 decimals; KHR: whole riel with `.00`). Devices that compose audio from recorded number clips should use `amount`, `currency` and `locale`. Devices with text-to-speech or a display may use `text`.
- `locale`: `km`, `en` or `zh`. `volume`: 0–100.
- `simulated: true` marks demo payments (never in production). Devices may play them normally.
- `verified: false` marks a payment read from a bank app notification on the merchant's phone ("phone bank alerts"), not confirmed by the bank. The merchant chooses per soundbox whether these are sent at all; when one arrives, announce it like any other (a device may add a short distinct tone).
- The same `id` may arrive twice (QoS 1). Remember the last 20 ids and do not announce a repeat.

### `test` — play a test sound (merchant pressed "Play test sound")
```json
{ "type": "test", "text": "One PayAlert sound test", "locale": "en", "volume": 80 }
```

### `config` — settings changed in the dashboard
```json
{ "type": "config", "locale": "zh", "volume": 35, "name": "Front counter" }
```
Store the language and volume and use them for local sounds (boot chime, low battery). Payment and test commands always carry their own `locale` and `volume`.

## 4. Telemetry
```json
{ "firmware": "1.4.2", "batteryPct": 87, "signalDbm": -61 }
```
All fields are optional. `batteryPct` is 0–100 (values outside are clamped); `signalDbm` is −150 to 0. The dashboard shows them with the online state and the last-seen time.

## 5. Testing without hardware
```bash
docker compose --profile soundbox up -d emqx      # broker, wired to the local API
npm run dev:api
node tools/soundbox-sim.mjs --serial SBX-000123 --password <device password> [--speak] [--probe]
```
`--probe` attempts forbidden topics and prints the broker's refusals. `--speak` reads announcements aloud on Windows.
