package com.mysoftkh.onepay_mobile

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import org.json.JSONArray
import org.json.JSONObject

/**
 * Phone bank alerts: what this phone forwards and where to.
 * The phone secret lives in Android's encrypted storage; everything else is plain app-private data.
 */
object BankAlertStore {
    private const val SECURE_FILE = "onepay_bank_alerts_secure"
    private const val PLAIN_FILE = "onepay_bank_alerts"
    private const val MAX_RECENT = 40
    private const val RECENT_DAYS_MS = 7L * 24 * 3600 * 1000
    private const val MAX_QUEUE = 50
    const val MAX_QUEUE_AGE_MS = 24L * 3600 * 1000

    data class Config(val relayId: String, val secret: String, val apiBase: String, val phoneName: String, val connectionName: String)

    @Volatile private var secureCache: SharedPreferences? = null

    private fun secure(ctx: Context): SharedPreferences =
        secureCache ?: synchronized(this) {
            secureCache ?: EncryptedSharedPreferences.create(
                SECURE_FILE,
                MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
                ctx.applicationContext,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            ).also { secureCache = it }
        }

    private fun plain(ctx: Context): SharedPreferences = ctx.applicationContext.getSharedPreferences(PLAIN_FILE, Context.MODE_PRIVATE)

    fun config(ctx: Context): Config? {
        val s = secure(ctx)
        val id = s.getString("relayId", null) ?: return null
        val secret = s.getString("secret", null) ?: return null
        val base = s.getString("apiBase", null) ?: return null
        return Config(id, secret, base, s.getString("phoneName", "") ?: "", s.getString("connectionName", "") ?: "")
    }

    fun saveConfig(ctx: Context, c: Config) {
        secure(ctx).edit()
            .putString("relayId", c.relayId).putString("secret", c.secret).putString("apiBase", c.apiBase)
            .putString("phoneName", c.phoneName).putString("connectionName", c.connectionName)
            .apply()
        plain(ctx).edit().remove("queue").remove("lastError").apply()
    }

    /** Forget the phone: secret, chosen apps, queue and counters. */
    fun clear(ctx: Context) {
        secure(ctx).edit().clear().apply()
        plain(ctx).edit().clear().apply()
    }

    fun apps(ctx: Context): Set<String> = plain(ctx).getStringSet("apps", emptySet()) ?: emptySet()

    fun setApps(ctx: Context, apps: Collection<String>) {
        plain(ctx).edit().putStringSet("apps", apps.toSet()).apply()
    }

    /** Apps that showed a notification lately, so the merchant can pick their bank app from a short list. */
    @Synchronized
    fun recordSeen(ctx: Context, pkg: String, label: String) {
        val p = plain(ctx)
        val all = JSONObject(p.getString("recent", "{}") ?: "{}")
        all.put(pkg, JSONObject().put("label", label).put("at", System.currentTimeMillis()))
        val cutoff = System.currentTimeMillis() - RECENT_DAYS_MS
        val keep = all.keys().asSequence().toList()
            .map { it to all.getJSONObject(it) }
            .filter { it.second.optLong("at") >= cutoff }
            .sortedByDescending { it.second.optLong("at") }
            .take(MAX_RECENT)
        val out = JSONObject()
        keep.forEach { out.put(it.first, it.second) }
        p.edit().putString("recent", out.toString()).apply()
    }

    fun recent(ctx: Context): List<Map<String, Any>> {
        val all = JSONObject(plain(ctx).getString("recent", "{}") ?: "{}")
        return all.keys().asSequence().toList()
            .map { mapOf("package" to it, "label" to all.getJSONObject(it).optString("label", it), "at" to all.getJSONObject(it).optLong("at")) }
            .sortedByDescending { it["at"] as Long }
    }

    // ── Outbox: notifications not yet delivered (no network, server down). Re-signed when sent.

    @Synchronized
    fun enqueue(ctx: Context, body: String) {
        val p = plain(ctx)
        val q = JSONArray(p.getString("queue", "[]") ?: "[]")
        q.put(JSONObject().put("body", body).put("at", System.currentTimeMillis()))
        val cutoff = System.currentTimeMillis() - MAX_QUEUE_AGE_MS
        val kept = (0 until q.length()).map { q.getJSONObject(it) }.filter { it.optLong("at") >= cutoff }.takeLast(MAX_QUEUE)
        p.edit().putString("queue", JSONArray(kept).toString()).apply()
    }

    @Synchronized
    fun takeQueue(ctx: Context): List<String> {
        val p = plain(ctx)
        val q = JSONArray(p.getString("queue", "[]") ?: "[]")
        p.edit().putString("queue", "[]").apply()
        val cutoff = System.currentTimeMillis() - MAX_QUEUE_AGE_MS
        return (0 until q.length()).map { q.getJSONObject(it) }.filter { it.optLong("at") >= cutoff }.map { it.getString("body") }
    }

    fun queueSize(ctx: Context): Int = JSONArray(plain(ctx).getString("queue", "[]") ?: "[]").length()

    // ── What the merchant sees on the setup screen.

    @Synchronized
    fun recordResult(ctx: Context, outcome: String, detail: String?) {
        val p = plain(ctx)
        val e = p.edit().putLong("lastAt", System.currentTimeMillis()).putString("lastOutcome", outcome)
        if (detail != null) e.putString("lastDetail", detail) else e.remove("lastDetail")
        e.putInt("count_$outcome", p.getInt("count_$outcome", 0) + 1)
        e.apply()
    }

    fun stats(ctx: Context): Map<String, Any?> {
        val p = plain(ctx)
        return mapOf(
            "lastAt" to p.getLong("lastAt", 0L).takeIf { it > 0 },
            "lastOutcome" to p.getString("lastOutcome", null),
            "lastDetail" to p.getString("lastDetail", null),
            "accepted" to p.getInt("count_accepted", 0),
            "ignored" to p.getInt("count_ignored", 0),
            "duplicate" to p.getInt("count_duplicate", 0),
            "failed" to p.getInt("count_failed", 0),
            "rejected" to p.getInt("count_rejected", 0),
            "queued" to queueSize(ctx),
        )
    }
}
