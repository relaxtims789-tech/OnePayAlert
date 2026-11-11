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

  Future<Summary> todaySummary() async {
    final from = startOfBusinessDay(0).toIso8601String();
    return Summary.fromJson(Map<String, dynamic>.from(await api.request('GET', 'transactions/summary', query: {'from': from}) as Map));
  }

  Future<Page<Txn>> transactions({int page = 1, int pageSize = 20, DateTime? from, String? status}) async {
    final body = await api.request('GET', 'transactions', query: {
      'page': page,
      'pageSize': pageSize,
      if (from != null) 'from': from.toUtc().toIso8601String(),
      if (status != null) 'status': status,
    });
    return Page.fromJson(Map<String, dynamic>.from(body as Map), Txn.fromJson);
  }

  Future<void> registerPushToken(String token, String platform) =>
      api.request('PUT', 'me/push-tokens', data: {'token': token, 'platform': platform});

  Future<void> removePushToken(String token) => api.request('DELETE', 'me/push-tokens', data: {'token': token});
}
