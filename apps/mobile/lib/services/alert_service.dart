import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_tts/flutter_tts.dart';

import '../core/format.dart';
import '../data/models.dart';

/// "Money received" alerts while the app is open: a heads-up notification (with sound) and,
/// when the device has a voice for the language, the amount spoken aloud.
class AlertService {
  final _notifications = FlutterLocalNotificationsPlugin();
  final _tts = FlutterTts();
  bool _ready = false;
  int _id = 0;

  static const _channel = AndroidNotificationDetails(
    'payments',
    'Payments',
    channelDescription: 'Successful payment alerts',
    importance: Importance.high,
    priority: Priority.high,
  );

  Future<void> init() async {
    if (_ready) return;
    await _notifications.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
    );
    await _notifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
    _ready = true;
  }

  Future<void> paymentReceived(Txn txn, String locale, {required bool speak}) async {
    if (txn.status != 'SUCCESS') return;
    await init();
    final text = paymentAlertText(locale, txn.amountMinor, txn.currency, txn.payerName);
    await _notifications.show(
      _id++,
      txn.isSimulated ? '[DEMO] One PayAlert' : 'One PayAlert',
      text,
      const NotificationDetails(android: _channel, iOS: DarwinNotificationDetails(presentSound: true)),
    );
    if (speak) await _speak(text, locale);
  }

  Future<void> _speak(String text, String locale) async {
    const tags = {'km': 'km-KH', 'en': 'en-US', 'zh': 'zh-CN'};
    final tag = tags[locale] ?? 'en-US';
    // No voice for this language on the device: the notification sound alone plays.
    final available = await _tts.isLanguageAvailable(tag);
    if (available != true) return;
    await _tts.setLanguage(tag);
    await _tts.speak(text);
  }
}
