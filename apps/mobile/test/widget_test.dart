import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onepay_mobile/data/models.dart';
import 'package:onepay_mobile/l10n/app_localizations.dart';
import 'package:onepay_mobile/state/app_state.dart';
import 'package:onepay_mobile/ui/login_screen.dart';
import 'package:onepay_mobile/ui/widgets.dart';

Widget wrap(Widget child, {String locale = 'en', List<Override> overrides = const []}) => ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        locale: Locale(locale),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: child,
      ),
    );

Txn txn({String status = 'SUCCESS', bool simulated = false}) => Txn(
      id: 't1',
      outletId: null,
      providerCode: 'DEMO_SIMULATOR',
      providerTxnId: 'SIM-1',
      status: status,
      amountMinor: 1250,
      currency: 'USD',
      payerName: 'Chan Sophea',
      payerAccountMasked: null,
      reference: null,
      isSimulated: simulated,
      occurredAt: DateTime.utc(2026, 11, 11, 7, 12),
    );

void main() {
  testWidgets('sign-in button stays disabled until both fields are filled', (tester) async {
    await tester.pumpWidget(wrap(const LoginScreen()));
    FilledButton button() => tester.widget<FilledButton>(find.byKey(const Key('sign-in')));
    expect(button().onPressed, isNull);
    await tester.enterText(find.byKey(const Key('email')), 'owner@shop.kh');
    await tester.pump();
    expect(button().onPressed, isNull);
    await tester.enterText(find.byKey(const Key('password')), 'secret');
    await tester.pump();
    expect(button().onPressed, isNotNull);
  });

  testWidgets('login screen is fully translated to Khmer', (tester) async {
    await tester.pumpWidget(wrap(const LoginScreen(), locale: 'km'));
    expect(find.text('ចូលគណនី'), findsOneWidget); // Sign in
    expect(find.text('ពាក្យសម្ងាត់'), findsOneWidget); // Password
  });

  testWidgets('shows the session-expired notice when the server ended the session', (tester) async {
    final container = ProviderContainer();
    container.read(sessionExpiredProvider.notifier).set(true);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [AppLocalizations.delegate, GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate],
        locale: const Locale('en'),
        home: const LoginScreen(),
      ),
    ));
    expect(find.byKey(const Key('session-expired')), findsOneWidget);
  });

  testWidgets('a payment tile shows amount, status and the demo flag', (tester) async {
    await tester.pumpWidget(wrap(Scaffold(body: TxnTile(txn(simulated: true), locale: 'en'))));
    expect(find.text(r'+$12.50'), findsOneWidget);
    expect(find.text('Successful'), findsOneWidget);
    expect(find.text('Demo'), findsOneWidget);
    expect(find.text('Chan Sophea'), findsOneWidget);
  });

  testWidgets('pending payments are labelled, not shown as received', (tester) async {
    await tester.pumpWidget(wrap(Scaffold(body: TxnTile(txn(status: 'PENDING'), locale: 'zh'))));
    expect(find.text('处理中'), findsOneWidget);
    expect(find.text('Demo'), findsNothing);
  });
}
