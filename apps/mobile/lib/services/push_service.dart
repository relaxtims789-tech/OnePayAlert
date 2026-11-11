import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../core/config.dart';
import '../data/repository.dart';

/// Firebase Cloud Messaging for alerts while the app is closed.
///
/// Enabled only when the build is given Firebase project settings (see [AppConfig]); otherwise
/// [enabled] is false and nothing is registered — push is never simulated.
class PushService {
  PushService(this._repo);
  final Repository _repo;
  String? _token;
  bool _initialised = false;

  bool get enabled => AppConfig.pushConfigured;

  Future<void> _init() async {
    if (_initialised) return;
    await Firebase.initializeApp(
      options: const FirebaseOptions(
        apiKey: AppConfig.firebaseApiKey,
        appId: AppConfig.firebaseAppId,
        messagingSenderId: AppConfig.firebaseSenderId,
        projectId: AppConfig.firebaseProjectId,
      ),
    );
    _initialised = true;
  }

  /// Registers this device for the signed-in user. Safe to call repeatedly.
  Future<void> register() async {
    if (!enabled) return;
    try {
      await _init();
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      final token = await messaging.getToken();
      if (token == null) return;
      _token = token;
      await _repo.registerPushToken(token, Platform.isIOS ? 'IOS' : 'ANDROID');
      messaging.onTokenRefresh.listen((t) {
        _token = t;
        _repo.registerPushToken(t, Platform.isIOS ? 'IOS' : 'ANDROID');
      });
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }

  /// Call before signing out so the next user of this phone does not get our alerts.
  Future<void> unregister() async {
    final t = _token;
    if (!enabled || t == null) return;
    try {
      await _repo.removePushToken(t);
    } catch (_) {}
    _token = null;
  }
}
