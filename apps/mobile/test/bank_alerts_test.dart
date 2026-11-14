import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onepay_mobile/core/api_client.dart';
import 'package:onepay_mobile/core/token_store.dart';
import 'package:onepay_mobile/data/models.dart';
import 'package:onepay_mobile/data/repository.dart';
import 'package:onepay_mobile/l10n/app_localizations.dart';
import 'package:onepay_mobile/services/bank_alerts.dart';
import 'package:onepay_mobile/state/app_state.dart';
import 'package:onepay_mobile/ui/bank_alerts_screen.dart';

class FakeBridge implements BankAlertsBridge {
  FakeBridge({this.permission = false});
  bool permission;
  bool enrolled = false;
  Set<String> apps = {};
  Map<String, String>? configured;
  bool openedSettings = false;
  final recent = const [RecentApp(package: 'com.paygo24.ibank', label: 'ABA Mobile'), RecentApp(package: 'com.example.chat', label: 'Chat')];

  @override
  Future<BankAlertsStatus> status() async => BankAlertsStatus(
    permission: permission,
    enrolled: enrolled,
    relayId: enrolled ? 'relay-1' : null,
    phoneName: configured?['phoneName'],
    connectionName: configured?['connectionName'],
    apps: apps,
    recentApps: recent,
    lastAt: null,
    lastOutcome: null,
    lastDetail: null,
    accepted: 3,
    ignored: 1,
    failed: 0,
    queued: 0,
  );

  @override
  Future<void> configure({
    required String relayId,
    required String secret,
    required String apiBase,
    required String phoneName,
    required String connectionName,
  }) async {
    enrolled = true;
    configured = {'relayId': relayId, 'secret': secret, 'phoneName': phoneName, 'connectionName': connectionName};
  }

  @override
  Future<void> setApps(Set<String> next) async => apps = next;
  @override
  Future<void> openSettings() async => openedSettings = true;
  @override
  Future<void> flush() async {}
  @override
  Future<void> disable() async {
    enrolled = false;
    apps = {};
  }
}

class FakeRepo extends Repository {
  FakeRepo() : super(ApiClient(MemoryTokenStore()));
  final enrolled = <String>[];
  final revoked = <String>[];

  @override
  Future<List<RelayConnection>> relayConnections() async => const [RelayConnection(id: 'c-usd', displayName: 'Bank alerts', currency: 'USD')];
  @override
  Future<RelayEnrollment> enrollPhone(String connectionId, String name) async {
    enrolled.add('$connectionId:$name');
    return const RelayEnrollment(relayId: 'relay-1', secret: 'secret-value');
  }

  @override
  Future<void> revokePhone(String relayId) async => revoked.add(relayId);
}

Widget app(FakeBridge bridge, FakeRepo repo) => ProviderScope(
  overrides: [
    tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
    repoProvider.overrideWithValue(repo),
    bankAlertsBridgeProvider.overrideWithValue(bridge),
  ],
  child: const MaterialApp(
    locale: Locale('en'),
    supportedLocales: AppLocalizations.supportedLocales,
    localizationsDelegates: [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: BankAlertsScreen(),
  ),
);

void main() {
  testWidgets('sets up this phone on a phone-alert connection and hands the secret to the native listener', (tester) async {
    final bridge = FakeBridge();
    final repo = FakeRepo();
    await tester.pumpWidget(app(bridge, repo));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('bank-alerts-connection')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('bank-alerts-name')), 'Counter phone');
    await tester.tap(find.byKey(const Key('bank-alerts-setup')));
    await tester.pumpAndSettle();
    expect(repo.enrolled, ['c-usd:Counter phone']);
    expect(bridge.configured, containsPair('secret', 'secret-value'));
    expect(bridge.configured, containsPair('connectionName', 'Bank alerts · USD'));
    // Next: notification access and which bank apps to forward.
    expect(find.byKey(const Key('bank-alerts-open-settings')), findsOneWidget);
    expect(find.text('ABA Mobile'), findsOneWidget);
  });

  testWidgets('forwards only the bank apps the merchant ticks', (tester) async {
    final bridge = FakeBridge(permission: true)..enrolled = true;
    await tester.pumpWidget(app(bridge, FakeRepo()));
    await tester.pumpAndSettle();
    expect(find.text('Allowed'), findsOneWidget);
    await tester.tap(find.byKey(const Key('bank-alerts-app-com.paygo24.ibank')));
    await tester.pumpAndSettle();
    expect(bridge.apps, {'com.paygo24.ibank'});
    expect(find.text('3 payments · 1 skipped · 0 failed'), findsOneWidget);
  });

  testWidgets('opens Android notification access, and stopping removes the phone everywhere', (tester) async {
    final bridge = FakeBridge()..enrolled = true;
    final repo = FakeRepo();
    await tester.pumpWidget(app(bridge, repo));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bank-alerts-open-settings')));
    expect(bridge.openedSettings, isTrue);

    await tester.scrollUntilVisible(find.byKey(const Key('bank-alerts-stop')), 200);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bank-alerts-stop')));
    await tester.pumpAndSettle();
    expect(repo.revoked, ['relay-1']);
    expect(bridge.enrolled, isFalse);
    expect(find.byKey(const Key('bank-alerts-setup')), findsOneWidget);
  });
}
