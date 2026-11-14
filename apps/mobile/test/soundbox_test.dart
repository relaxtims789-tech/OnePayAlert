import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onepay_mobile/core/api_client.dart';
import 'package:onepay_mobile/core/soundbox_label.dart';
import 'package:onepay_mobile/core/token_store.dart';
import 'package:onepay_mobile/data/models.dart';
import 'package:onepay_mobile/data/repository.dart';
import 'package:onepay_mobile/l10n/app_localizations.dart';
import 'package:onepay_mobile/state/app_state.dart';
import 'package:onepay_mobile/ui/soundboxes_screen.dart';

Me member(List<String> permissions) => Me(
  id: 'u-1',
  email: 'owner@shop.kh',
  fullName: 'Sok Dara',
  locale: 'en',
  activeCompanyId: 'co-1',
  activeRole: 'OWNER',
  permissions: permissions,
  memberships: const [Membership(companyId: 'co-1', companyName: 'Sokha Coffee', role: 'OWNER')],
);

class FakeRepo extends Repository {
  FakeRepo({this.boxes = const [], this.online = false}) : super(ApiClient(MemoryTokenStore()));
  List<Soundbox> boxes;
  final bool online;
  final claims = <Map<String, Object?>>[];

  @override
  Future<List<Soundbox>> soundboxes() async => boxes;
  @override
  Future<List<Outlet>> outlets() async => const [];
  @override
  Future<Soundbox> claimSoundbox({required String serialNumber, required String claimCode, String? outletId, String? name, required String locale}) async {
    claims.add({'serial': serialNumber, 'code': claimCode, 'outlet': outletId, 'name': name, 'locale': locale});
    return Soundbox(id: 'd-1', serialNumber: serialNumber, name: name, outletId: outletId, status: 'ACTIVE', locale: locale, online: false, batteryPct: null);
  }

  @override
  Future<bool> testSoundbox(String id) async => online;
}

Widget app(Widget home, FakeRepo repo, {List<String> permissions = const ['device.read', 'device.manage'], String? scanned}) {
  final me = member(permissions);
  return ProviderScope(
    overrides: [
      tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
      repoProvider.overrideWithValue(repo),
      sessionProvider.overrideWith(() => _SignedIn(me)),
      outletsProvider.overrideWith((ref) async => const <Outlet>[]),
      labelScannerProvider.overrideWithValue((_) async => scanned),
    ],
    child: MaterialApp(
      locale: const Locale('en'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: home,
    ),
  );
}

class _SignedIn extends SessionController {
  _SignedIn(this.me);
  final Me me;
  @override
  Future<Me?> build() async => me;
}

void main() {
  test('reads the box label QR, a bare serial, and nothing else', () {
    final l = parseSoundboxLabel(' opasb1:sbx-000123:k7qf2m9x ')!;
    expect([l.serialNumber, l.claimCode], ['SBX-000123', 'K7QF-2M9X']);
    expect(parseSoundboxLabel('WQRJ002019001234')!.claimCode, isNull);
    expect(parseSoundboxLabel('https://example.com/x'), isNull);
    expect(parseSoundboxLabel('OPASB1:SBX-000123:K7QF-2M9I'), isNull);
    expect(normaliseClaimCode('k7qf 2m9x'), 'K7QF-2M9X');
  });

  testWidgets('with no soundbox yet, sells it and offers activation to managers', (tester) async {
    await tester.pumpWidget(app(const SoundboxesScreen(), FakeRepo()));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('soundbox-pitch')), findsOneWidget);
    expect(find.text('Works with payments from any Cambodian bank'), findsOneWidget);
    expect(find.byKey(const Key('activate-soundbox')), findsOneWidget);
  });

  testWidgets('staff who may only view soundboxes get no activate button', (tester) async {
    await tester.pumpWidget(app(const SoundboxesScreen(), FakeRepo(), permissions: const ['device.read']));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('soundbox-pitch')), findsOneWidget);
    expect(find.byKey(const Key('activate-soundbox')), findsNothing);
  });

  testWidgets('scanning the box label fills serial and claim code, then activates and plays a test sound', (tester) async {
    final repo = FakeRepo();
    await tester.pumpWidget(app(const ActivateSoundboxScreen(), repo, scanned: 'OPASB1:SBX-000123:k7qf2m9x'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('scan-label')));
    await tester.pumpAndSettle();
    expect(find.text('SBX-000123'), findsOneWidget);
    expect(find.text('K7QF-2M9X'), findsOneWidget);

    await tester.tap(find.text('中文'));
    await tester.enterText(find.byKey(const Key('soundbox-name')), 'Front counter');
    await tester.scrollUntilVisible(find.byKey(const Key('soundbox-submit')), 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('soundbox-submit')));
    await tester.pumpAndSettle();
    expect(repo.claims.single, {'serial': 'SBX-000123', 'code': 'K7QF-2M9X', 'outlet': null, 'name': 'Front counter', 'locale': 'zh'});
    expect(find.byKey(const Key('soundbox-activated')), findsOneWidget);

    await tester.tap(find.byKey(const Key('soundbox-test')));
    await tester.pumpAndSettle();
    expect(find.text('Sent, but the soundbox is offline. Check its power and connection.'), findsOneWidget);
  });

  testWidgets('explains a wrong scan or a mistyped claim code without calling the API', (tester) async {
    final repo = FakeRepo();
    await tester.pumpWidget(app(const ActivateSoundboxScreen(), repo, scanned: 'https://example.com/not-a-box'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('scan-label')));
    await tester.pumpAndSettle();
    expect(find.text('This is not a soundbox label.'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('soundbox-serial')), 'SBX-000123');
    await tester.enterText(find.byKey(const Key('soundbox-code')), 'K7QF-2M9');
    await tester.scrollUntilVisible(find.byKey(const Key('soundbox-submit')), 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('soundbox-submit')));
    await tester.pumpAndSettle();
    expect(find.text('Check the claim code: 8 letters and digits.'), findsOneWidget);
    expect(repo.claims, isEmpty);
  });
}
