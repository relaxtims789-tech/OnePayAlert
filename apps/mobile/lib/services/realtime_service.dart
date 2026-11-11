import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../core/api_client.dart';
import '../core/config.dart';
import '../data/models.dart';

enum RealtimeStatus { connecting, live, offline }

class RealtimeEvent {
  const RealtimeEvent(this.txn, {required this.created});
  final Txn txn;
  final bool created;
}

/// Live payment feed over Socket.IO (`/realtime`), authenticated with the access token.
/// When the server drops the socket because the token expired, it refreshes and reconnects.
class RealtimeService {
  RealtimeService(this._api);
  final ApiClient _api;

  io.Socket? _socket;
  Timer? _retry;
  bool _wanted = false;
  final _events = StreamController<RealtimeEvent>.broadcast();
  final _status = StreamController<RealtimeStatus>.broadcast();
  RealtimeStatus _current = RealtimeStatus.offline;

  Stream<RealtimeEvent> get events => _events.stream;
  Stream<RealtimeStatus> get status => _status.stream;
  RealtimeStatus get currentStatus => _current;

  void _set(RealtimeStatus s) {
    _current = s;
    _status.add(s);
  }

  Future<void> connect() async {
    _wanted = true;
    _teardown();
    if (_api.accessToken == null && !await _api.refresh()) {
      _set(RealtimeStatus.offline);
      return;
    }
    _set(RealtimeStatus.connecting);
    final socket = io.io(
      '${AppConfig.apiBaseUrl}/realtime',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': _api.accessToken})
          .disableAutoConnect()
          .disableReconnection() // we reconnect ourselves so each attempt gets a fresh token
          .build(),
    );
    socket.on('ready', (_) => _set(RealtimeStatus.live));
    socket.on('transaction.created', (d) => _emit(d, created: true));
    socket.on('transaction.updated', (d) => _emit(d, created: false));
    socket.on('session.expired', (_) => _scheduleReconnect(refresh: true));
    socket.onConnectError((_) => _scheduleReconnect(refresh: true));
    socket.onDisconnect((_) => _scheduleReconnect(refresh: false));
    _socket = socket;
    socket.connect();
  }

  void _emit(dynamic data, {required bool created}) {
    if (data is Map) _events.add(RealtimeEvent(Txn.fromJson(Map<String, dynamic>.from(data)), created: created));
  }

  void _scheduleReconnect({required bool refresh}) {
    if (!_wanted || (_retry?.isActive ?? false)) return;
    _set(RealtimeStatus.connecting);
    _retry = Timer(const Duration(seconds: 3), () async {
      if (!_wanted) return;
      if (refresh) await _api.refresh();
      await connect();
    });
  }

  void _teardown() {
    _retry?.cancel();
    _socket
      ?..clearListeners()
      ..dispose();
    _socket = null;
  }

  void disconnect() {
    _wanted = false;
    _teardown();
    _set(RealtimeStatus.offline);
  }
}
