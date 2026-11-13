import '../core/api_client.dart';
import '../core/format.dart';
import 'models.dart';

/// Typed access to the API endpoints the app uses.
class Repository {
  Repository(this.api);
  final ApiClient api;

  Future<Me> me() async => Me.fromJson(Map<String, dynamic>.from(await api.request('GET', 'auth/me') as Map));

  Future<Me> setLocale(String locale) async =>
      Me.fromJson(Map<String, dynamic>.from(await api.request('PATCH', 'auth/me', data: {'locale': locale}) as Map));

  Future<Summary> todaySummary({String? outletId}) async {
    final from = startOfBusinessDay(0).toIso8601String();
    final body = await api.request('GET', 'transactions/summary', query: {'from': from, 'outletId': ?outletId});
    return Summary.fromJson(Map<String, dynamic>.from(body as Map));
  }

  /// Active outlets the member may see (the API already limits outlet-restricted staff).
  Future<List<Outlet>> outlets() async {
    final body = await api.request('GET', 'outlets', query: {'pageSize': 100, 'isActive': 'true'});
    return Page.fromJson(Map<String, dynamic>.from(body as Map), Outlet.fromJson).items;
  }

  Future<Page<Txn>> transactions({int page = 1, int pageSize = 20, DateTime? from, String? status, String? outletId}) async {
    final body = await api.request('GET', 'transactions', query: {
      'page': page,
      'pageSize': pageSize,
      'from': ?from?.toUtc().toIso8601String(),
      'status': ?status,
      'outletId': ?outletId,
    });
    return Page.fromJson(Map<String, dynamic>.from(body as Map), Txn.fromJson);
  }

  /// live (real Bakong), simulated (demo build of the API) or off.
  Future<String> khqrMode() async => (Map<String, dynamic>.from(await api.request('GET', 'khqr/status') as Map))['mode'] as String;

  Future<List<KhqrAccount>> khqrAccounts() async => ((await api.request('GET', 'khqr/accounts')) as List)
      .map((e) => KhqrAccount.fromJson(Map<String, dynamic>.from(e as Map)))
      .toList();

  Future<KhqrCharge> createKhqr({required String accountId, required String amount, String? outletId}) async => KhqrCharge.fromJson(
      Map<String, dynamic>.from(await api.request('POST', 'khqr/charges', data: {
        'bankConnectionId': accountId,
        'amount': amount,
        'outletId': ?outletId,
      }) as Map));

  Future<KhqrCharge> khqrCharge(String id) async =>
      KhqrCharge.fromJson(Map<String, dynamic>.from(await api.request('GET', 'khqr/charges/$id') as Map));

  Future<KhqrCharge> cancelKhqr(String id) async =>
      KhqrCharge.fromJson(Map<String, dynamic>.from(await api.request('POST', 'khqr/charges/$id/cancel') as Map));

  /// Demo builds of the API only: act as the customer paying.
  Future<KhqrCharge> simulateKhqrPaid(String id) async =>
      KhqrCharge.fromJson(Map<String, dynamic>.from(await api.request('POST', 'khqr/charges/$id/simulate-paid') as Map));

  Future<void> registerPushToken(String token, String platform) =>
      api.request('PUT', 'me/push-tokens', data: {'token': token, 'platform': platform});

  Future<void> removePushToken(String token) => api.request('DELETE', 'me/push-tokens', data: {'token': token});
}
