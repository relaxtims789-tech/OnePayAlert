import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onepay_mobile/core/api_client.dart';
import 'package:onepay_mobile/core/token_store.dart';
import 'package:onepay_mobile/data/models.dart';
import 'package:onepay_mobile/data/repository.dart';
import 'package:onepay_mobile/l10n/app_localizations.dart';
import 'package:onepay_mobile/l10n/app_localizations_en.dart';
import 'package:onepay_mobile/state/app_state.dart';
import 'package:onepay_mobile/ui/collect_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

const cafe = KhqrAccount(id: 'c-1', displayName: 'Bakong', accountId: 'khqr_cafe@aclb', merchantName: 'KHQR Cafe', currency: 'USD', outletId: null);

KhqrCharge charge(String status, {bool simulated = true}) => KhqrCharge(
  id: 'k-1',
  reference: 'OPA7K2M9QX',
  amountMinor: 750,
  currency: 'USD',
  qr: '00020101021229190015khqr_cafe@aclb52045999530384054047.505802KH5909KHQR Cafe6010Phnom Penh6304ABCD',
  status: status,
  merchantName: 'KHQR Cafe',
  expiresAt: DateTime.now().add(const Duration(minutes: 5)),
  payerAccount: status == 'PAID' ? 'da•••@abaa' : null,
  simulated: simulated,
);

/// Answers the KHQR calls in memory; [statuses] are returned by successive status polls.
class FakeRepo extends Repository {
  FakeRepo({this.mode = 'simulated', this.accounts = const [cafe], this.statuses = const []}) : super(ApiClient(MemoryTokenStore()));
  final String mode;
  final List<KhqrAccount> accounts;
  final List<String> statuses;
  final created = <Map<String, String?>>[];
  int polls = 0;
  int modeCalls = 0;

  @override
  Future<String> khqrMode() async {
    modeCalls++;
    return mode;
  }

  @override
  Future<List<KhqrAccount>> khqrAccounts() async => accounts;
  @override
  Future<KhqrCharge> createKhqr({required String accountId, required String amount, String? outletId}) async {
    created.add({'accountId': accountId, 'amount': amount, 'outletId': outletId});
    return charge('PENDING');
  }

  @override
  Future<KhqrCharge> khqrCharge(String id) async => charge(statuses.isEmpty ? 'PENDING' : statuses[(polls++).clamp(0, statuses.length - 1)]);
  @override
  Future<KhqrCharge> cancelKhqr(String id) async => charge('CANCELED');
  @override
  Future<KhqrCharge> simulateKhqrPaid(String id) async => charge('PAID');
  @override
  Future<List<Outlet>> outlets() async => const [];
}

const owner = Me(
  id: 'u-1',
  email: 'owner@shop.kh',
  fullName: 'Sok Dara',
  locale: 'en',
  activeCompanyId: 'co-1',
  activeRole: 'OWNER',
  permissions: ['payment.collect'],
  memberships: [Membership(companyId: 'co-1', companyName: 'KHQR Cafe', role: 'OWNER')],
);

class SignedOut extends SessionController {
  @override
  Future<Me?> build() async => null;
}

class SignedIn extends SessionController {
  @override
  Future<Me?> build() async => owner;
}

Widget app(FakeRepo repo, {String locale = 'en'}) => ProviderScope(
  overrides: [
    sessionProvider.overrideWith(SignedIn.new),
    tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
    repoProvider.overrideWithValue(repo),
    outletsProvider.overrideWith((ref) async => const <Outlet>[]),
    selectedOutletProvider.overrideWithValue(null),
  ],
  child: MaterialApp(
    locale: Locale(locale),
    supportedLocales: AppLocalizations.supportedLocales,
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: const CollectScreen(pollInterval: Duration(milliseconds: 100)),
  ),
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('asks nothing of the API while signed out (a 401 there would look like an expired session)', () async {
    final repo = FakeRepo();
    final c = ProviderContainer(
      overrides: [tokenStoreProvider.overrideWithValue(MemoryTokenStore()), repoProvider.overrideWithValue(repo), sessionProvider.overrideWith(SignedOut.new)],
    );
    addTearDown(c.dispose);
    expect((await c.read(khqrSetupProvider.future)).mode, 'off');
    expect(repo.modeCalls, 0);
  });

  test('amounts are checked like the API does', () {
    final t = AppLocalizationsEn();
    expect(validateCollectAmount('12.50', 'USD', t), isNull);
    expect(validateCollectAmount('12.505', 'USD', t), t.collectAmountInvalid);
    expect(validateCollectAmount('0.00', 'USD', t), t.collectAmountInvalid);
    expect(validateCollectAmount('40000', 'KHR', t), isNull);
    expect(validateCollectAmount('400.5', 'KHR', t), t.collectAmountInvalidKhr);
  });

  testWidgets('shows a KHQR for the amount and the result once Bakong confirms it', (tester) async {
    final repo = FakeRepo(statuses: ['PENDING', 'PAID']);
    await tester.pumpWidget(app(repo));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('collect-demo')), findsOneWidget);

    await tester.enterText(find.byKey(const Key('collect-amount')), '7.50');
    await tester.pump();
    await tester.tap(find.byKey(const Key('show-khqr')));
    await tester.pump();
    expect(repo.created.single, {'accountId': 'c-1', 'amount': '7.50', 'outletId': null});
    expect(find.byKey(const Key('khqr-card')), findsOneWidget);
    expect(find.byKey(const Key('khqr-qr')), findsOneWidget);
    expect(find.text(r'$7.50'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 250)); // two polls: still pending, then paid
    await tester.pump();
    expect(find.byKey(const Key('khqr-result-PAID')), findsOneWidget);
    expect(find.text('From da•••@abaa'), findsOneWidget);

    await tester.ensureVisible(find.byKey(const Key('new-khqr')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('new-khqr')));
    await tester.pump();
    expect(find.byKey(const Key('show-khqr')), findsOneWidget);
  });

  testWidgets('the demo pay button only exists for simulated codes, and cancel works', (tester) async {
    await tester.pumpWidget(app(FakeRepo()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('collect-amount')), '7.50');
    await tester.pump();
    await tester.tap(find.byKey(const Key('show-khqr')));
    await tester.pump();
    expect(find.byKey(const Key('simulate-paid')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('cancel-khqr')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('cancel-khqr')));
    await tester.pump();
    expect(find.byKey(const Key('khqr-result-CANCELED')), findsOneWidget);
  });

  testWidgets('rejects a bad amount without calling the API', (tester) async {
    final repo = FakeRepo();
    await tester.pumpWidget(app(repo));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('collect-amount')), '1.234');
    await tester.pump();
    await tester.tap(find.byKey(const Key('show-khqr')));
    await tester.pump();
    expect(find.byKey(const Key('collect-error')), findsOneWidget);
    expect(repo.created, isEmpty);
  });

  testWidgets('explains when KHQR is off or no Bakong account is connected (Khmer)', (tester) async {
    await tester.pumpWidget(app(FakeRepo(mode: 'off'), locale: 'km'));
    await tester.pumpAndSettle();
    expect(find.textContaining('KHQR មិនទាន់អាចប្រើបាន'), findsOneWidget);

    await tester.pumpWidget(app(FakeRepo(accounts: const []), locale: 'km'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('collect-notice')), findsOneWidget);
  });
}
