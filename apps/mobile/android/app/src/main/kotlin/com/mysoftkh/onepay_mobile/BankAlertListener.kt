package com.mysoftkh.onepay_mobile

import android.app.Notification
import android.content.pm.ApplicationInfo
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.Executors

/**
 * Reads notifications only after the merchant grants notification access in Android settings, and
 * forwards only those from the bank apps they ticked. Every other app is merely listed by name
 * (so the bank app can be picked) and its content is never sent anywhere.
 *
 * Android calls this service on the app's main thread, which is shared with the UI: everything
 * beyond copying the notification's text (encrypted storage, the app list, the network) runs on a
 * background thread, so a slow keystore or a busy UI can never stall the listener.
 */
class BankAlertListener : NotificationListenerService() {
    private companion object {
        /** Set by Notification.Builder on every notification (the constant itself is not public API). */
        const val APP_INFO_EXTRA = "android.appInfo"
        val background = Executors.newSingleThreadExecutor()
    }

    override fun onListenerConnected() {
        BankAlertSender.flush(applicationContext)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName ?: return
        if (pkg == packageName) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val extras = n.extras ?: return
        // Copy what we need now; Android may recycle the notification after this call returns.
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()
        val postedAt = sbn.postTime
        val appInfo = appInfoOf(n)
        val ctx = applicationContext

        background.execute {
            BankAlertStore.recordSeen(ctx, pkg, labelOf(appInfo, pkg))
            if (pkg !in BankAlertStore.apps(ctx)) return@execute
            if (text.isNullOrBlank() || BankAlertStore.config(ctx) == null) return@execute
            BankAlertSender.forward(ctx, pkg, title, text, postedAt)
        }
    }

    private fun appInfoOf(n: Notification): ApplicationInfo? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            n.extras?.getParcelable(APP_INFO_EXTRA, ApplicationInfo::class.java)
        } else {
            @Suppress("DEPRECATION")
            n.extras?.getParcelable<ApplicationInfo>(APP_INFO_EXTRA)
        }

    private fun labelOf(info: ApplicationInfo?, pkg: String): String =
        runCatching { (info ?: packageManager.getApplicationInfo(pkg, 0)).loadLabel(packageManager).toString() }.getOrDefault(pkg)
}
