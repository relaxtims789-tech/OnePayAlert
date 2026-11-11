import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onepay_mobile/core/api_client.dart';
import 'package:onepay_mobile/core/token_store.dart';

/// Scriptable fake backend for Dio.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler);
  final Future<ResponseBody> Function(RequestOptions o) handler;
  final calls = <String>[];

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? body, Future<void>? cancel) {
    calls.add('${o.method} ${o.path}');
    return handler(o);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody json(int status, Object? body) => ResponseBody.fromString(
      body == null ? '' : jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

Map<String, dynamic> tokens(String suffix) => {'accessToken': 'at-$suffix', 'refreshToken': 'rt-$suffix', 'accessTokenExpiresIn': 900};

ApiClient client(FakeAdapter adapter, MemoryTokenStore store) {
  final dio = Dio(BaseOptions(baseUrl: 'http://api.test/api/v1', validateStatus: (_) => true))..httpClientAdapter = adapter;
  return ApiClient(store, dio: dio);
}

void main() {
  test('login stores the refresh token and keeps the access token in memory', () async {
    final store = MemoryTokenStore();
    final api = client(FakeAdapter((o) async => json(200, tokens('1'))), store);
    await api.login(' Owner@Shop.KH ', 'pw');
    expect(store.token, 'rt-1');
    expect(api.accessToken, 'at-1');
  });

  test('a 401 triggers one refresh, then the request is retried', () async {
    final store = MemoryTokenStore()..token = 'rt-0';
    var meCalls = 0;
    final adapter = FakeAdapter((o) async {
      if (o.path == 'auth/refresh') return json(200, tokens('2'));
      meCalls++;
      return o.headers['Authorization'] == 'Bearer at-2' ? json(200, {'ok': true}) : json(401, {'message': 'expired'});
    });
    final api = client(adapter, store);
    expect(await api.request('GET', 'auth/me'), {'ok': true});
    expect(meCalls, 1); // no access token yet → refreshed first, then a single call
    expect(store.token, 'rt-2');
  });

  test('concurrent requests share a single refresh (refresh tokens are single-use)', () async {
    final store = MemoryTokenStore()..token = 'rt-0';
    var refreshes = 0;
    final gate = Completer<void>();
    final adapter = FakeAdapter((o) async {
      if (o.path == 'auth/refresh') {
        refreshes++;
        await gate.future;
        return json(200, tokens('3'));
      }
      return json(200, {'path': o.path});
    });
    final api = client(adapter, store);
    final all = Future.wait([api.request('GET', 'a'), api.request('GET', 'b'), api.request('GET', 'c')]);
    gate.complete();
    await all;
    expect(refreshes, 1);
  });

  test('an unrecoverable 401 clears tokens and signals session expiry', () async {
    final store = MemoryTokenStore()..token = 'rt-0';
    final adapter = FakeAdapter((o) async => json(401, {'message': 'nope'}));
    final api = client(adapter, store);
    var expired = 0;
    api.sessionExpired.listen((_) => expired++);
    await expectLater(api.request('GET', 'auth/me'), throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
    await Future<void>.delayed(Duration.zero);
    expect(store.token, isNull);
    expect(expired, 1);
  });

  test('network failure while refreshing keeps the saved session (offline is not sign-out)', () async {
    final store = MemoryTokenStore()..token = 'rt-0';
    final adapter = FakeAdapter((o) async => throw DioException.connectionError(requestOptions: o, reason: 'offline'));
    final api = client(adapter, store);
    expect(await api.refresh(), isFalse);
    expect(store.token, 'rt-0');
  });

  test('API validation messages are surfaced', () async {
    final store = MemoryTokenStore()..token = 'rt-0';
    final adapter = FakeAdapter((o) async {
      if (o.path == 'auth/refresh') return json(200, tokens('4'));
      return json(400, {
        'message': ['amount must be a decimal string', 'currency invalid'],
      });
    });
    final api = client(adapter, store);
    await expectLater(
      api.request('POST', 'x'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'amount must be a decimal string\ncurrency invalid')),
    );
  });

  test('logout always clears locally, even if the server is unreachable', () async {
    final store = MemoryTokenStore()..token = 'rt-0';
    final adapter = FakeAdapter((o) async => throw DioException.connectionError(requestOptions: o, reason: 'offline'));
    await client(adapter, store).logout();
    expect(store.token, isNull);
  });
}
