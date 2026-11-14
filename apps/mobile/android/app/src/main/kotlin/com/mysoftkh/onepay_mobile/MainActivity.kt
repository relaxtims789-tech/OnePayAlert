package com.mysoftkh.onepay_mobile

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Phone bank alerts: the setup screen drives the native listener through this channel.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "onepay/bank_alerts").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "status" -> {
                        val cfg = BankAlertStore.config(this)
                        result.success(
                            mapOf(
                                "permission" to hasAccess(),
                                "enrolled" to (cfg != null),
                                "relayId" to cfg?.relayId,
                                "phoneName" to cfg?.phoneName,
                                "connectionName" to cfg?.connectionName,
                                "apps" to BankAlertStore.apps(this).toList(),
                                "recentApps" to BankAlertStore.recent(this),
                                "stats" to BankAlertStore.stats(this),
                            ),
                        )
                    }
                    "configure" -> {
                        BankAlertStore.saveConfig(
                            this,
                            BankAlertStore.Config(
                                relayId = call.argument<String>("relayId")!!,
                                secret = call.argument<String>("secret")!!,
                                apiBase = call.argument<String>("apiBase")!!,
                                phoneName = call.argument<String>("phoneName") ?: "",
                                connectionName = call.argument<String>("connectionName") ?: "",
                            ),
                        )
                        result.success(null)
                    }
                    "setApps" -> {
                        BankAlertStore.setApps(this, call.argument<List<String>>("apps") ?: emptyList())
                        result.success(null)
                    }
                    "openSettings" -> {
                        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
                                Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                                ComponentName(this, BankAlertListener::class.java).flattenToString(),
                            )
                        } else {
                            Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
                        }
                        startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        result.success(null)
                    }
                    "flush" -> {
                        BankAlertSender.flush(this)
                        result.success(null)
                    }
                    "disable" -> {
                        BankAlertStore.clear(this)
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                result.error("bank_alerts", e.message, null)
            }
        }
    }

    private fun hasAccess(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        val me = ComponentName(this, BankAlertListener::class.java)
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
    }
}
