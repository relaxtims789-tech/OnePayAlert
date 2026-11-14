import 'package:flutter/services.dart';

/// An app that showed a notification lately (so the merchant can pick their bank app).
class RecentApp {
  const RecentApp({required this.package, required this.label});
  final String package;
  final String label;
}

/// What the native listener reports to the setup screen.
class BankAlertsStatus {
  const BankAlertsStatus({
    required this.permission,
    required this.enrolled,
    required this.relayId,
    required this.phoneName,
    required this.connectionName,
    required this.apps,
    required this.recentApps,
    required this.lastAt,
    required this.lastOutcome,
    required this.lastDetail,
    required this.accepted,
    required this.ignored,
    required this.failed,
    required this.queued,
  });

  /// Android notification access granted to One PayAlert.
  final bool permission;
  final bool enrolled;
  final String? relayId;
  final String? phoneName;
  final String? connectionName;
  final Set<String> apps;
  final List<RecentApp> recentApps;
  final DateTime? lastAt;

  /// accepted · ignored · duplicate · failed · rejected
  final String? lastOutcome;
  final String? lastDetail;
  final int accepted;
  final int ignored;
  final int failed;
  final int queued;

  static const empty = BankAlertsStatus(
    permission: false,
    enrolled: false,
    relayId: null,
    phoneName: null,
    connectionName: null,
    apps: {},
    recentApps: [],
    lastAt: null,
    lastOutcome: null,
    lastDetail: null,
    accepted: 0,
    ignored: 0,
    failed: 0,
    queued: 0,
  );

  factory BankAlertsStatus.fromMap(Map<dynamic, dynamic> m) {
    final stats = Map<dynamic, dynamic>.from((m['stats'] as Map?) ?? const {});
    final lastAt = stats['lastAt'];
    return BankAlertsStatus(
      permission: m['permission'] == true,
      enrolled: m['enrolled'] == true,
      relayId: m['relayId'] as String?,
      phoneName: m['phoneName'] as String?,
      connectionName: m['connectionName'] as String?,
      apps: ((m['apps'] as List?) ?? const []).cast<String>().toSet(),
      recentApps: ((m['recentApps'] as List?) ?? const [])
          .map((e) => Map<dynamic, dynamic>.from(e as Map))
          .map((e) => RecentApp(package: e['package'] as String, label: (e['label'] as String?) ?? e['package'] as String))
          .toList(),
      lastAt: lastAt is int ? DateTime.fromMillisecondsSinceEpoch(lastAt) : null,
      lastOutcome: stats['lastOutcome'] as String?,
      lastDetail: stats['lastDetail'] as String?,
      accepted: (stats['accepted'] as int?) ?? 0,
      ignored: ((stats['ignored'] as int?) ?? 0) + ((stats['duplicate'] as int?) ?? 0),
      failed: ((stats['failed'] as int?) ?? 0) + ((stats['rejected'] as int?) ?? 0),
      queued: (stats['queued'] as int?) ?? 0,
    );
  }
}

/// The native Android notification listener (android/.../BankAlertListener.kt).
abstract class BankAlertsBridge {
  Future<BankAlertsStatus> status();
  Future<void> configure({required String relayId, required String secret, required String apiBase, required String phoneName, required String connectionName});
  Future<void> setApps(Set<String> apps);
  Future<void> openSettings();
  Future<void> flush();
  Future<void> disable();
}

class MethodChannelBankAlerts implements BankAlertsBridge {
  static const _channel = MethodChannel('onepay/bank_alerts');

  @override
  Future<BankAlertsStatus> status() async => BankAlertsStatus.fromMap((await _channel.invokeMapMethod<dynamic, dynamic>('status')) ?? const {});

  @override
  Future<void> configure({
    required String relayId,
    required String secret,
    required String apiBase,
    required String phoneName,
    required String connectionName,
  }) =>
      _channel.invokeMethod('configure', {'relayId': relayId, 'secret': secret, 'apiBase': apiBase, 'phoneName': phoneName, 'connectionName': connectionName});

  @override
  Future<void> setApps(Set<String> apps) => _channel.invokeMethod('setApps', {'apps': apps.toList()});

  @override
  Future<void> openSettings() => _channel.invokeMethod('openSettings');

  @override
  Future<void> flush() => _channel.invokeMethod('flush');

  @override
  Future<void> disable() => _channel.invokeMethod('disable');
}
