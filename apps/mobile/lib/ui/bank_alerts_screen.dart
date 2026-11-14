import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config.dart';
import '../core/format.dart';
import '../data/models.dart';
import '../l10n/app_localizations.dart';
import '../services/bank_alerts.dart';
import '../state/app_state.dart';
import 'theme.dart';
import 'widgets.dart';

final bankAlertsBridgeProvider = Provider<BankAlertsBridge>((ref) => MethodChannelBankAlerts());

/// Phone bank alerts: forward the bank app's "money received" notifications on this phone to
/// One PayAlert, so the soundbox and dashboard hear about payments from any bank.
class BankAlertsScreen extends ConsumerStatefulWidget {
  const BankAlertsScreen({super.key});

  @override
  ConsumerState<BankAlertsScreen> createState() => _BankAlertsScreenState();
}

class _BankAlertsScreenState extends ConsumerState<BankAlertsScreen> with WidgetsBindingObserver {
  BankAlertsStatus? _status;
  List<RelayConnection>? _connections;
  String? _connectionId;
  final _name = TextEditingController(text: 'Phone');
  bool _busy = false;
  Object? _error;

  BankAlertsBridge get _bridge => ref.read(bankAlertsBridgeProvider);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _name.dispose();
    super.dispose();
  }

  // Coming back from Android's notification-access settings: show the new state.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    try {
      final status = await _bridge.status();
      final connections = status.enrolled ? _connections : await ref.read(repoProvider).relayConnections();
      if (!mounted) return;
      setState(() {
        _status = status;
        _connections = connections;
        _connectionId ??= connections != null && connections.isNotEmpty ? connections.first.id : null;
        _error = null;
      });
      if (status.enrolled) await _bridge.flush();
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      await _load();
    } catch (e) {
      if (mounted) {
        final t = AppLocalizations.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage(e, network: t.networkError, generic: t.somethingWrong)),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createConnection(String currency) => _run(() async {
    final c = await ref.read(repoProvider).createRelayConnection(currency, 'Bank alerts ($currency)');
    _connections = [...?_connections, c];
    _connectionId = c.id;
  });

  Future<void> _setUp() => _run(() async {
    final connection = _connections!.firstWhere((c) => c.id == _connectionId);
    final name = _name.text.trim().isEmpty ? 'Phone' : _name.text.trim();
    final e = await ref.read(repoProvider).enrollPhone(connection.id, name);
    await _bridge.configure(
      relayId: e.relayId,
      secret: e.secret,
      apiBase: AppConfig.apiBaseUrl,
      phoneName: name,
      connectionName: '${connection.displayName} · ${connection.currency}',
    );
  });

  Future<void> _stop() => _run(() async {
    final id = _status?.relayId;
    if (id != null) {
      try {
        await ref.read(repoProvider).revokePhone(id);
      } catch (_) {
        // Already removed in the dashboard: forgetting it here is all that is left.
      }
    }
    await _bridge.disable();
    _connections = null;
  });

  Future<void> _toggleApp(String package, bool on) async {
    final apps = {...?_status?.apps};
    on ? apps.add(package) : apps.remove(package);
    await _bridge.setApps(apps);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final s = _status;
    return Scaffold(
      appBar: AppBar(
        title: Text(t.bankAlerts, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(t.bankAlertsIntro, style: const TextStyle(color: Brand.ink2)),
            const SizedBox(height: 16),
            if (_error != null && s == null)
              ErrorView(
                message: errorMessage(_error!, network: t.networkError, generic: t.somethingWrong),
                onRetry: _load,
              )
            else if (s == null)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (!s.enrolled)
              _setUpCard(t)
            else ...[
              if (s.lastOutcome == 'rejected')
                Card(
                  key: const Key('bank-alerts-removed'),
                  color: Brand.failedBg,
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Text(t.bankAlertsRemoved, style: const TextStyle(color: Brand.failed)),
                  ),
                ),
              _accessCard(t, s),
              const SizedBox(height: 12),
              _appsCard(t, s),
              const SizedBox(height: 12),
              _activityCard(t, s),
              const SizedBox(height: 12),
              Text(t.bankAlertsKeepOn, style: const TextStyle(color: Brand.ink3, fontSize: 12.5)),
              const SizedBox(height: 8),
              TextButton.icon(
                key: const Key('bank-alerts-stop'),
                onPressed: _busy ? null : _stop,
                icon: const Icon(Icons.link_off_rounded, color: Brand.failed),
                label: Text(t.bankAlertsStop, style: const TextStyle(color: Brand.failed)),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _setUpCard(AppLocalizations t) {
    final connections = _connections ?? const [];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (connections.isNotEmpty)
              DropdownButtonFormField<String>(
                key: const Key('bank-alerts-connection'),
                initialValue: _connectionId,
                isExpanded: true,
                decoration: InputDecoration(labelText: t.bankAlertsAccount),
                items: [for (final c in connections) DropdownMenuItem(value: c.id, child: Text('${c.displayName} · ${c.currency}'))],
                onChanged: (v) => setState(() => _connectionId = v),
              ),
            Wrap(
              spacing: 8,
              children: [
                for (final cur in ['USD', 'KHR'])
                  if (!connections.any((c) => c.currency == cur))
                    OutlinedButton(
                      key: Key('bank-alerts-create-$cur'),
                      onPressed: _busy ? null : () => _createConnection(cur),
                      child: Text(t.bankAlertsCreate(cur)),
                    ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('bank-alerts-name'),
              controller: _name,
              decoration: InputDecoration(labelText: t.bankAlertsPhoneName),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              key: const Key('bank-alerts-setup'),
              onPressed: _busy || _connectionId == null ? null : _setUp,
              icon: const Icon(Icons.phonelink_ring_rounded),
              label: Text(t.bankAlertsSetUp),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _accessCard(AppLocalizations t, BankAlertsStatus s) => Card(
    child: ListTile(
      key: const Key('bank-alerts-access'),
      leading: Icon(s.permission ? Icons.check_circle_rounded : Icons.notifications_off_outlined, color: s.permission ? Brand.success : Brand.pending),
      title: Text(t.bankAlertsAccess, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(s.permission ? t.bankAlertsAccessOn : t.bankAlertsAccessOff),
      trailing: s.permission
          ? null
          : TextButton(key: const Key('bank-alerts-open-settings'), onPressed: _bridge.openSettings, child: Text(t.bankAlertsOpenSettings)),
    ),
  );

  Widget _appsCard(AppLocalizations t, BankAlertsStatus s) {
    // Ticked apps first, then the rest as Android last saw them.
    final known = {for (final a in s.recentApps) a.package: a};
    final apps = [
      for (final p in s.apps) known[p] ?? RecentApp(package: p, label: p),
      for (final a in s.recentApps)
        if (!s.apps.contains(a.package)) a,
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 2),
              child: Text(t.bankAlertsApps, style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
              child: Text(t.bankAlertsAppsHint, style: const TextStyle(color: Brand.ink2, fontSize: 12.5)),
            ),
            for (final a in apps)
              CheckboxListTile(
                key: Key('bank-alerts-app-${a.package}'),
                value: s.apps.contains(a.package),
                onChanged: (v) => _toggleApp(a.package, v ?? false),
                title: Text(a.label),
                subtitle: Text(a.package, style: const TextStyle(fontSize: 11.5, color: Brand.ink3)),
                controlAffinity: ListTileControlAffinity.leading,
                dense: true,
              ),
          ],
        ),
      ),
    );
  }

  Widget _activityCard(AppLocalizations t, BankAlertsStatus s) {
    final locale = ref.watch(localeProvider);
    return Card(
      child: ListTile(
        key: const Key('bank-alerts-activity'),
        leading: const Icon(Icons.swap_vert_rounded, color: Brand.primary),
        title: Text(t.bankAlertsActivity, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (s.lastAt != null) Text(t.bankAlertsLast('${formatDateTime(s.lastAt!, locale)} · ${s.lastOutcome ?? ''}')),
            Text(t.bankAlertsCounts(s.accepted, s.ignored, s.failed)),
            if (s.queued > 0) Text(t.bankAlertsQueued(s.queued), style: const TextStyle(color: Brand.pending)),
            if (s.connectionName != null && s.connectionName!.isNotEmpty) Text(s.connectionName!, style: const TextStyle(color: Brand.ink3)),
          ],
        ),
      ),
    );
  }
}
