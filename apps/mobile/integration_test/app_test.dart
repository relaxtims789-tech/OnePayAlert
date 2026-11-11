import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:onepay_mobile/app.dart';
import 'package:onepay_mobile/core/config.dart';
import 'package:onepay_mobile/core/token_store.dart';
import 'package:onepay_mobile/state/app_state.dart';

/// End-to-end on a device/emulator against a running API (API_BASE_URL, default 10.0.2.2:4100).
/// Creates its own throwaway merchant, so it never touches real accounts.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final stamp = DateTime.now().millisecondsSinceEpoch;
  final email = 'mobile.$stamp@e2e.onepay.local';
  const password = 'Str0ngPassw0rd';
  final api = Dio(BaseOptions(baseUrl: '${AppConfig.apiBaseUrl}/api/v1', validateStatus: (_) => true));

  Future<void> pumpUntil(WidgetTester tester, Finder f, {Duration timeout = const Duration(seconds: 30)}) async {
    final end = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 250));
      if (f.evaluate().isNotEmpty) return;
    }
    throw TestFailure('Timed out waiting for $f');
  }

  testWidgets('sign in, then a demo payment arrives live on the home feed', (tester) async {
    final reg = await api.post<Map<String, dynamic>>('/auth/register', data: {
      'fullName': 'Mobile Tester',
      'email': email,
      'password': password,
      'companyName': 'Mobile Shop $stamp',
      'locale': 'en',
    });
    expect(reg.statusCode, 201, reason: '${reg.data}');
    final auth = Options(headers: {'Authorization': 'Bearer ${reg.data!['accessToken']}'});

    await tester.pumpWidget(ProviderScope(
      overrides: [tokenStoreProvider.overrideWithValue(MemoryTokenStore())],
      child: const OnePayAlertApp(),
    ));
    await pumpUntil(tester, find.byKey(const Key('email')));
    await tester.enterText(find.byKey(const Key('email')), email);
    await tester.enterText(find.byKey(const Key('password')), password);
    await tester.pump();
    await tester.tap(find.byKey(const Key('sign-in')));

    await pumpUntil(tester, find.text('Hello, Mobile'));
    await pumpUntil(tester, find.text('Live'));
    expect(find.text('No payments yet'), findsOneWidget);

    final providers = (await api.get<List<dynamic>>('/payment-providers', options: auth)).data!;
    final demo = providers.cast<Map<String, dynamic>>().firstWhere((p) => p['code'] == 'DEMO_SIMULATOR');
    final conn = await api.post<Map<String, dynamic>>('/bank-connections',
        data: {'providerId': demo['id'], 'displayName': 'Counter', 'currency': 'USD'}, options: auth);
    expect(conn.statusCode, 201);
    final sim = await api.post<dynamic>('/bank-connections/${conn.data!['id']}/simulate-payment',
        data: {'amount': '12.50', 'payerName': 'Chan Sophea'}, options: auth);
    expect(sim.statusCode, 202);

    // Arrives over the realtime socket — no pull-to-refresh.
    await pumpUntil(tester, find.text('Chan Sophea'));
    expect(find.text(r'+$12.50'), findsOneWidget);
    expect(find.text('Demo'), findsOneWidget);
    await pumpUntil(tester, find.text(r'$12.50'));

    // Transactions tab lists it too.
    await tester.tap(find.text('Transactions').last);
    await pumpUntil(tester, find.byKey(const Key('transactions-list')));
    expect(find.text('Chan Sophea'), findsWidgets);

    // Sign out returns to the sign-in screen.
    await tester.tap(find.text('Settings').last);
    await pumpUntil(tester, find.byKey(const Key('sign-out')));
    await tester.tap(find.byKey(const Key('sign-out')));
    await pumpUntil(tester, find.byKey(const Key('sign-in')));
  });
}
