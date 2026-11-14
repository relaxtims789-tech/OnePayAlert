package com.mysoftkh.onepay_mobile

import android.app.Notification
import android.content.pm.ApplicationInfo
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Reads notifications only after the merchant grants notification access in Android settings, and
 * forwards only those from the bank apps they ticked. Every other app is merely listed by name
 * (so the bank app can be picked) and its content is never sent anywhere.
 */
class BankAlertListener : NotificationListenerService() {
    private companion object {
        /** Set by Notification.Builder on every notification (the constant itself is not public API). */
        const val APP_INFO_EXTRA = "android.appInfo"
    }

    override fun onListenerConnected() {
        BankAlertSender.flush(applicationContext)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val ctx = applicationContext
        val pkg = sbn.packageName ?: return
        if (pkg == packageName) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        BankAlertStore.recordSeen(ctx, pkg, labelOf(sbn, pkg))
        if (pkg !in BankAlertStore.apps(ctx)) return
        if (BankAlertStore.config(ctx) == null) return

        val extras = n.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()
        if (text.isNullOrBlank()) return
        BankAlertSender.forward(ctx, pkg, title, text, sbn.postTime)
    }

    private fun labelOf(sbn: StatusBarNotification, pkg: String): String {
        val info: ApplicationInfo? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            sbn.notification?.extras?.getParcelable(APP_INFO_EXTRA, ApplicationInfo::class.java)
        } else {
            @Suppress("DEPRECATION")
            sbn.notification?.extras?.getParcelable<ApplicationInfo>(APP_INFO_EXTRA)
        }
        return runCatching { (info ?: packageManager.getApplicationInfo(pkg, 0)).loadLabel(packageManager).toString() }.getOrDefault(pkg)
    }
}
