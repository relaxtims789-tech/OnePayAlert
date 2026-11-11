# One PayAlert Webhook Specification — `ONEPAY_WEBHOOK_V1`

This is for payment gateways, bank middleware and partners that send real-time payment events to One PayAlert.

## 1. Get an endpoint
A merchant creates a bank connection with the **Signed Webhook (Gateway / Partner)** provider. The response contains two values:

- `webhookUrl`, for example `https://api.onepayalert.com/api/v1/webhooks/{bankConnectionId}`
- `webhookSecret` (`whsec_…`). It is shown **once**. Store it securely. Rotate it with `POST /bank-connections/{id}/rotate-webhook-secret`. The old secret stops working immediately.

The connection stays `PENDING` until the first valid event arrives. After that it becomes `ACTIVE`.

## 2. Send an event
```
POST {webhookUrl}
Content-Type: application/json
X-OnePay-Timestamp: 1794384000
X-OnePay-Signature: v1=5f2b…(hex)
```

The signature is `hex(HMAC_SHA256(webhookSecret, "<X-OnePay-Timestamp>.<raw request body>"))`. Sign the exact bytes you send. Requests whose timestamp differs from server time by more than **300 seconds** are rejected.

```json
{
  "eventId": "evt_8a1c…",
  "type": "payment.succeeded",
  "transactionId": "TXN-2026-000123",
  "amount": "12.50",
  "currency": "USD",
  "occurredAt": "2026-11-11T15:04:05+07:00",
  "payer": { "name": "Sok Dara", "account": "000123456789" },
  "reference": "INV-1001",
  "description": "Coffee",
  "outletCode": "BKK1"
}
```

| Field | Rules |
|-------|-------|
| `eventId` | Required, max 128 characters, unique per event. Used to deduplicate. |
| `type` | `payment.pending`, `payment.succeeded`, `payment.failed` or `payment.reversed` |
| `transactionId` | Required. Your transaction id. Several events may refer to the same transaction. |
| `amount` | **Decimal string**, never a JSON number. At most 2 decimal places for USD and KHR. |
| `currency` | `USD` or `KHR`. Must match the connection's currency. |
| `occurredAt` | ISO-8601 with a timezone offset. Must not be in the future. |
| `payer.account` | Optional. One PayAlert stores only the last 4 digits. |
| `outletCode` | Optional. Assigns the payment to the outlet with this code. Otherwise the connection's default outlet is used. |

Unknown fields are rejected.

## 3. Responses
| Status | Meaning | Retry? |
|--------|---------|--------|
| `202` `{status:"accepted", webhookEventId, duplicate:false}` | Stored durably and queued | No |
| `202` `{… duplicate:true}` | This `eventId` was already received | No |
| `400` | Invalid payload (the message explains why) | No, fix the payload |
| `401` | Bad signature or timestamp outside the window | No, check the secret and clock |
| `404` | Unknown or disconnected endpoint | No |
| `429` / `5xx` | Rate limited or temporary error | **Yes**, with exponential backoff and the **same `eventId`** |

## 4. Processing semantics
- Each `eventId` is stored exactly once. Each `(connection, transactionId)` becomes exactly one transaction.
- Allowed status changes are `pending → succeeded | failed` and `succeeded → reversed`. Out-of-order or stale events, such as `pending` arriving after `succeeded`, are recorded and ignored.
- An event that reports a different amount or currency for an existing `transactionId` is rejected as `FAILED`.
- Successful payments are pushed to the merchant's dashboard over WebSocket and to the mobile app over FCM within seconds.
