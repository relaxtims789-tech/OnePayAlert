import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../core/token_store.dart';
import '../data/models.dart';
import '../data/repository.dart';
import '../services/alert_service.dart';
import '../services/push_service.dart';
import '../services/realtime_service.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());
final apiProvider = Provider<ApiClient>((ref) => ApiClient(ref.watch(tokenStoreProvider)));
final repoProvider = Provider<Repository>((ref) => Repository(ref.watch(apiProvider)));
final realtimeProvider = Provider<RealtimeService>((ref) {
  final s = RealtimeService(ref.watch(apiProvider));
  ref.onDispose(s.disconnect);
  return s;
});
final alertProvider = Provider<AlertService>((ref) => AlertService());
final pushProvider = Provider<PushService>((ref) => PushService(ref.watch(repoProvider)));

/// True after the server ended the session (shown once on the sign-in screen).
class SessionExpiredFlag extends Notifier<bool> {
  @override
  bool build() => false;
  void set(bool v) => state = v;
}

final sessionExpiredProvider = NotifierProvider<SessionExpiredFlag, bool>(SessionExpiredFlag.new);

/// The signed-in user (null = signed out).
class SessionController extends AsyncNotifier<Me?> {
  ApiClient get _api => ref.read(apiProvider);
  Repository get _repo => ref.read(repoProvider);

  @override
  Future<Me?> build() async {
    final sub = ref.read(apiProvider).sessionExpired.listen((_) {
      ref.read(realtimeProvider).disconnect();
      ref.read(sessionExpiredProvider.notifier).set(true);
      state = const AsyncData(null);
    });
    ref.onDispose(sub.cancel);

    if (!await _api.restore()) return null;
    final me = await _repo.me();
    _afterSignIn();
    return me;
  }

  void _afterSignIn() {
    unawaited(ref.read(realtimeProvider).connect());
    unawaited(ref.read(pushProvider).register());
  }

  Future<void> signIn(String email, String password) async {
    await _api.login(email, password);
    final me = await _repo.me();
    ref.read(sessionExpiredProvider.notifier).set(false);
    state = AsyncData(me);
    _afterSignIn();
  }

  Future<void> signOut() async {
    await ref.read(pushProvider).unregister();
    ref.read(realtimeProvider).disconnect();
    await _api.logout();
    state = const AsyncData(null);
  }

  /// Language is stored on the profile so push notifications use it too.
  Future<void> setLocale(String locale) async {
    state = AsyncData(await _repo.setLocale(locale));
  }

  Future<void> switchCompany(String companyId) async {
    await _api.switchCompany(companyId);
    state = AsyncData(await _repo.me());
    unawaited(ref.read(realtimeProvider).connect());
    ref.invalidate(todaySummaryProvider);
    ref.invalidate(feedProvider);
  }
}

final sessionProvider = AsyncNotifierProvider<SessionController, Me?>(SessionController.new);

/// UI language: the profile's language once signed in, Khmer before that.
final localeProvider = Provider<String>((ref) {
  final me = ref.watch(sessionProvider);
  final locale = (me.hasValue ? me.requireValue?.locale : null) ?? 'km';
  ref.read(apiProvider).language = locale;
  return locale;
});

class SoundSetting extends Notifier<bool> {
  static const _key = 'onepay.sound_alerts';

  @override
  bool build() {
    Future(() async {
      final prefs = await SharedPreferences.getInstance();
      state = prefs.getBool(_key) ?? true;
    });
    return true; // alerts are the point of the app: on by default
  }

  Future<void> set(bool v) async {
    state = v;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_key, v);
  }
}

final soundProvider = NotifierProvider<SoundSetting, bool>(SoundSetting.new);

final realtimeStatusProvider = StreamProvider<RealtimeStatus>((ref) async* {
  final rt = ref.watch(realtimeProvider);
  yield rt.currentStatus;
  yield* rt.status;
});

/// Outlets of the active company that this member may see.
final outletsProvider = FutureProvider.autoDispose<List<Outlet>>((ref) async {
  final companyId = ref.watch(sessionProvider.select((s) => s.value?.activeCompanyId));
  if (companyId == null) return const [];
  return ref.watch(repoProvider).outlets();
});

/// The outlet this phone follows (null = all outlets). Remembered per company, because a
/// counter phone usually belongs to one shop.
class OutletChoice extends Notifier<String?> {
  String? _companyId;
  String get _key => 'onepay.outlet.$_companyId';

  @override
  String? build() {
    _companyId = ref.watch(sessionProvider.select((s) => s.value?.activeCompanyId));
    if (_companyId != null) {
      Future(() async {
        final prefs = await SharedPreferences.getInstance();
        final saved = prefs.getString(_key);
        if (ref.mounted && saved != null) state = saved;
      });
    }
    return null;
  }

  Future<void> set(String? outletId) async {
    state = outletId;
    if (_companyId == null) return;
    final prefs = await SharedPreferences.getInstance();
    if (outletId == null) {
      await prefs.remove(_key);
    } else {
      await prefs.setString(_key, outletId);
    }
  }
}

final outletChoiceProvider = NotifierProvider<OutletChoice, String?>(OutletChoice.new);

/// The outlet filter actually applied: a remembered outlet that was closed or is no longer
/// visible to this member falls back to all outlets.
final selectedOutletProvider = Provider<String?>((ref) {
  final id = ref.watch(outletChoiceProvider);
  if (id == null) return null;
  final outlets = ref.watch(outletsProvider);
  if (!outlets.hasValue) return id;
  return outlets.requireValue.any((o) => o.id == id) ? id : null;
});

final todaySummaryProvider = FutureProvider.autoDispose<Summary>(
    (ref) => ref.watch(repoProvider).todaySummary(outletId: ref.watch(selectedOutletProvider)));

/// Latest payments, kept current by the realtime feed.
class FeedController extends AsyncNotifier<List<Txn>> {
  @override
  Future<List<Txn>> build() async {
    final sub = ref.watch(realtimeProvider).events.listen(_onEvent);
    ref.onDispose(sub.cancel);
    final outletId = ref.watch(selectedOutletProvider);
    return (await ref.watch(repoProvider).transactions(pageSize: 20, outletId: outletId)).items;
  }

  void _onEvent(RealtimeEvent e) {
    // Following one outlet: other outlets' payments are neither listed nor announced.
    final outletId = ref.read(selectedOutletProvider);
    if (outletId != null && e.txn.outletId != outletId) return;
    final current = state.hasValue ? state.requireValue : const <Txn>[];
    final next = [...current];
    final i = next.indexWhere((t) => t.id == e.txn.id);
    if (i >= 0) {
      next[i] = e.txn;
    } else {
      next.insert(0, e.txn);
    }
    state = AsyncData(next.take(50).toList());
    ref.invalidate(todaySummaryProvider);
    if (e.created) {
      unawaited(ref.read(alertProvider).paymentReceived(e.txn, ref.read(localeProvider), speak: ref.read(soundProvider)));
    }
  }

  Future<void> reload() async {
    final outletId = ref.read(selectedOutletProvider);
    state = AsyncData((await ref.read(repoProvider).transactions(pageSize: 20, outletId: outletId)).items);
    ref.invalidate(todaySummaryProvider);
  }
}

final feedProvider = AsyncNotifierProvider<FeedController, List<Txn>>(FeedController.new);

/// Maps API errors to a short, translated message.
String errorMessage(Object error, {required String network, required String generic}) {
  if (error is ApiException) return error.isNetwork ? network : error.message;
  return generic;
}
