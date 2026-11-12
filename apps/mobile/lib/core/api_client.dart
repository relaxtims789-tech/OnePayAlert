import 'dart:async';

import 'package:dio/dio.dart';

import '../data/models.dart';
import 'config.dart';
import 'token_store.dart';

class ApiException implements Exception {
  const ApiException(this.status, this.message, {this.code});
  final int status;
  final String message;
  final String? code;

  bool get isNetwork => status == 0;

  @override
  String toString() => 'ApiException($status, $message)';
}

/// Connection settings for the API. The trailing slash matters: Dio joins base URL and path
/// as plain text, so without it `auth/login` would become `/api/v1auth/login`.
BaseOptions apiBaseOptions({String baseUrl = AppConfig.apiBaseUrl}) => BaseOptions(
      baseUrl: '$baseUrl/api/v1/',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      contentType: Headers.jsonContentType,
      // Status handling is ours, not Dio's.
      validateStatus: (_) => true,
    );

/// REST client for the One PayAlert API.
///
/// - Access token in memory, refresh token in the platform keystore.
/// - On 401 it refreshes once and retries. Concurrent requests share ONE refresh, because
///   refresh tokens are single-use and reuse revokes every session.
/// - If the session cannot be renewed, [sessionExpired] fires and tokens are cleared.
class ApiClient {
  ApiClient(this._tokens, {Dio? dio})
      : _dio = dio ?? Dio(apiBaseOptions());

  final TokenStore _tokens;
  final Dio _dio;
  String? _accessToken;

  /// App language (km/en/zh); the API translates its error messages into it.
  String language = 'km';
  Future<bool>? _refreshing;
  final _expired = StreamController<void>.broadcast();

  Stream<void> get sessionExpired => _expired.stream;
  String? get accessToken => _accessToken;

  Future<void> _store(AuthTokens t) async {
    _accessToken = t.accessToken;
    await _tokens.saveRefreshToken(t.refreshToken);
  }

  Future<void> _clear() async {
    _accessToken = null;
    await _tokens.clear();
  }

  Future<Response<dynamic>> _send(String method, String path, {Object? data, Map<String, dynamic>? query, String? token}) async {
    try {
      return await _dio.request<dynamic>(
        path,
        data: data,
        queryParameters: query,
        options: Options(method: method, headers: {'Accept-Language': language, if (token != null) 'Authorization': 'Bearer $token'}),
      );
    } on DioException catch (e) {
      throw ApiException(0, e.message ?? 'NETWORK');
    }
  }

  ApiException _error(Response<dynamic> r) {
    final body = r.data;
    var message = r.statusMessage ?? 'Request failed';
    String? code;
    if (body is Map) {
      final m = body['message'];
      if (m is String && m.trim().isNotEmpty) message = m;
      if (m is List && m.isNotEmpty) message = m.whereType<String>().join('\n');
      if (body['code'] is String) code = body['code'] as String;
    }
    return ApiException(r.statusCode ?? 0, message, code: code);
  }

  Future<void> login(String email, String password) async {
    final r = await _send('POST', 'auth/login', data: {'email': email.trim().toLowerCase(), 'password': password});
    if (r.statusCode != 200) throw _error(r);
    await _store(AuthTokens.fromJson(Map<String, dynamic>.from(r.data as Map)));
  }

  Future<void> switchCompany(String companyId) async {
    final r = await request('POST', 'auth/switch-company', data: {'companyId': companyId});
    await _store(AuthTokens.fromJson(Map<String, dynamic>.from(r as Map)));
  }

  /// Restores a saved session on app start. Returns false when the user must sign in.
  Future<bool> restore() async {
    if (await _tokens.readRefreshToken() == null) return false;
    return refresh();
  }

  /// Single-flight refresh. Network failures keep the saved token (offline is not sign-out).
  Future<bool> refresh() {
    return _refreshing ??= () async {
      try {
        final rt = await _tokens.readRefreshToken();
        if (rt == null) return false;
        final r = await _send('POST', 'auth/refresh', data: {'refreshToken': rt});
        if (r.statusCode == 200) {
          await _store(AuthTokens.fromJson(Map<String, dynamic>.from(r.data as Map)));
          return true;
        }
        if (r.statusCode == 401 || r.statusCode == 403) await _clear();
        return false;
      } on ApiException {
        return false;
      } finally {
        _refreshing = null;
      }
    }();
  }

  /// Authenticated request returning the decoded JSON body (null for 204).
  Future<dynamic> request(String method, String path, {Object? data, Map<String, dynamic>? query}) async {
    if (_accessToken == null) await refresh();
    var r = await _send(method, path, data: data, query: query, token: _accessToken);
    if (r.statusCode == 401 && await refresh()) {
      r = await _send(method, path, data: data, query: query, token: _accessToken);
    }
    if (r.statusCode == 401) {
      await _clear();
      _expired.add(null);
      throw const ApiException(401, 'Session expired', code: 'SESSION_EXPIRED');
    }
    if ((r.statusCode ?? 0) >= 400) throw _error(r);
    return r.statusCode == 204 ? null : r.data;
  }

  Future<void> logout() async {
    final rt = await _tokens.readRefreshToken();
    if (rt != null) {
      try {
        await _send('POST', 'auth/logout', data: {'refreshToken': rt});
      } on ApiException {
        // Signing out locally must always work, even offline.
      }
    }
    await _clear();
  }
}
