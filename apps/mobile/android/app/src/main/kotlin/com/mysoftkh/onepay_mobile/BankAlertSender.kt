package com.mysoftkh.onepay_mobile

import android.content.Context
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.time.Instant
import java.util.concurrent.Executors
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Sends bank app notifications to One PayAlert, one at a time, signed like the signed webhook:
 * X-OnePay-Signature: v1=hex(HMAC_SHA256(secret, "<unix seconds>.<raw body>")).
 * Network failures are kept in the outbox and re-sent (re-signed) with the next notification or when the app opens.
 */
object BankAlertSender {
    private val worker = Executors.newSingleThreadExecutor()

    fun forward(ctx: Context, pkg: String, title: String?, text: String, postedAtMs: Long) {
        val app = ctx.applicationContext
        val body = JSONObject()
            .put("key", sha256("$pkg|$postedAtMs|${title ?: ""}|$text").take(40))
            .put("app", pkg.take(160))
            .put("title", title?.take(300) ?: JSONObject.NULL)
            .put("text", text.take(2000))
            .put("postedAt", Instant.ofEpochMilli(postedAtMs).toString())
            .toString()
        worker.execute {
            flushNow(app)
            send(app, body)
        }
    }

    fun flush(ctx: Context) {
        val app = ctx.applicationContext
        worker.execute { flushNow(app) }
    }

    private fun flushNow(ctx: Context) {
        for (body in BankAlertStore.takeQueue(ctx)) send(ctx, body)
    }

    private fun send(ctx: Context, body: String) {
        val cfg = BankAlertStore.config(ctx) ?: return
        val ts = System.currentTimeMillis() / 1000
        try {
            val conn = (URL("${cfg.apiBase.trimEnd('/')}/api/v1/relay/notifications").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10_000
                readTimeout = 10_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("x-onepay-relay-id", cfg.relayId)
                setRequestProperty("x-onepay-timestamp", ts.toString())
                setRequestProperty("x-onepay-signature", "v1=" + hmac(cfg.secret, "$ts.$body"))
            }
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val response = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            conn.disconnect()
            when {
                code in 200..299 -> {
                    val json = runCatching { JSONObject(response) }.getOrNull()
                    val status = json?.optString("status").orEmpty().ifEmpty { "accepted" }
                    BankAlertStore.recordResult(ctx, status, json?.optString("reason")?.takeIf { it.isNotEmpty() })
                }
                // The phone was removed in the dashboard (or its secret is wrong): retrying will not help.
                code == 401 -> BankAlertStore.recordResult(ctx, "rejected", "HTTP 401")
                // A malformed notification: drop it, keep going.
                code in 400..499 && code != 429 -> BankAlertStore.recordResult(ctx, "failed", "HTTP $code")
                else -> {
                    BankAlertStore.enqueue(ctx, body)
                    BankAlertStore.recordResult(ctx, "failed", "HTTP $code")
                }
            }
        } catch (e: IOException) {
            BankAlertStore.enqueue(ctx, body)
            BankAlertStore.recordResult(ctx, "failed", e.javaClass.simpleName)
        }
    }

    private fun hmac(secret: String, data: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(data.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    private fun sha256(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}
