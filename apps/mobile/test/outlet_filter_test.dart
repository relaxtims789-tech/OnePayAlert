import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onepay_mobile/core/token_store.dart';
import 'package:onepay_mobile/data/models.dart';
import 'package:onepay_mobile/l10n/app_localizations.dart';
import 'package:onepay_mobile/state/app_state.dart';
import 'package:onepay_mobile/ui/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

const riverside = Outlet(id: 'o-1', name: 'Riverside', code: 'RS');
const airport = Outlet(id: 'o-2', name: 'Airport', code: 'AP');

ProviderContainer containerWith(List<Outlet> outlets) => ProviderContainer(overrides: [
      tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
      outletsProvider.overrideWith((ref) async => outlets),
    ]);

Widget app(ProviderContainer c) => UncontrolledProviderScope(
      container: c,
      child: const MaterialApp(
        locale: Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: [AppLocalizations.delegate, GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate],
        home: Scaffold(body: OutletChips()),
      ),
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('a remembered outlet the member can no longer see falls back to all outlets', () async {
    final c = containerWith([riverside, airport]);
    addTearDown(c.dispose);
    await c.read(outletsProvider.future);

    await c.read(outletChoiceProvider.notifier).set('o-2');
    expect(c.read(selectedOutletProvider), 'o-2');

    await c.read(outletChoiceProvider.notifier).set('closed-outlet');
    expect(c.read(selectedOutletProvider), isNull);
  });

  testWidgets('the outlet switch is hidden for a single-outlet member', (tester) async {
    final c = containerWith([riverside]);
    addTearDown(c.dispose);
    await tester.pumpWidget(app(c));
    await tester.pumpAndSettle();
    expect(find.text('All outlets'), findsNothing);
  });

  testWidgets('choosing an outlet narrows the app to it', (tester) async {
    final c = containerWith([riverside, airport]);
    addTearDown(c.dispose);
    await tester.pumpWidget(app(c));
    await tester.pumpAndSettle();
    expect(find.text('All outlets'), findsOneWidget);
    expect(c.read(selectedOutletProvider), isNull);

    await tester.tap(find.text('Airport'));
    await tester.pumpAndSettle();
    expect(c.read(selectedOutletProvider), 'o-2');
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('outlet-o-2'))).selected, isTrue);
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('outlet-all'))).selected, isFalse);
  });
}
