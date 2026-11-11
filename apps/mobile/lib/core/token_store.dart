import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists only the refresh token, in the platform keystore (Android Keystore / iOS Keychain).
/// The short-lived access token lives in memory.
abstract class TokenStore {
  Future<String?> readRefreshToken();
  Future<void> saveRefreshToken(String token);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _storage;
  static const _key = 'onepay.refresh_token';

  @override
  Future<String?> readRefreshToken() => _storage.read(key: _key);

  @override
  Future<void> saveRefreshToken(String token) => _storage.write(key: _key, value: token);

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

/// For tests.
class MemoryTokenStore implements TokenStore {
  String? token;

  @override
  Future<String?> readRefreshToken() async => token;

  @override
  Future<void> saveRefreshToken(String t) async => token = t;

  @override
  Future<void> clear() async => token = null;
}
