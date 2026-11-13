import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/format.dart';
import '../data/models.dart';
import '../l10n/app_localizations.dart';
import '../state/app_state.dart';
import 'theme.dart';
import 'widgets.dart';

const khqrRed = Color(0xFFE1232E);

/// Whether KHQR works here (live / simulated / off) and the Bakong accounts this member may collect into.
final khqrSetupProvider = FutureProvider.autoDispose<({String mode, List<KhqrAccount> accounts})>((ref) async {
  final companyId = ref.watch(sessionProvider.select((s) => s.value?.activeCompanyId));
  // Signed out: no request (it would fail with 401 and look like an expired session).
  if (companyId == null) return (mode: 'off', accounts: const <KhqrAccount>[]);
  final repo = ref.watch(repoProvider);
  final mode = await repo.khqrMode();
  return (mode: mode, accounts: mode == 'off' ? const <KhqrAccount>[] : await repo.khqrAccounts());
});

final _usdAmount = RegExp(r'^\d{1,10}(\.\d{1,2})?$');
final _khrAmount = RegExp(r'^\d{1,10}$');

/// Null when [amount] is acceptable for [currency]; otherwise the message to show.
String? validateCollectAmount(String amount, String currency, AppLocalizations t) {
  final a = amount.trim();
  if (currency == 'KHR') {
    if (!_khrAmount.hasMatch(a)) return t.collectAmountInvalidKhr;
  } else if (!_usdAmount.hasMatch(a)) {
    return t.collectAmountInvalid;
  }
  return RegExp(r'[1-9]').hasMatch(a) ? null : t.collectAmountInvalid;
}

/// Shows a KHQR code for an exact amount and waits until Bakong confirms the payment.
class CollectScreen extends ConsumerStatefulWidget {
  const CollectScreen({super.key, this.pollInterval = const Duration(seconds: 2)});
  final Duration pollInterval;

  @override
  ConsumerState<CollectScreen> createState() => _CollectScreenState();
}

class _CollectScreenState extends ConsumerState<CollectScreen> {
  final _amount = TextEditingController();
  String? _accountId;
  KhqrCharge? _charge;
  String? _error;
  bool _busy = false;
  Timer? _poll;
  Timer? _clock;

  @override
  void dispose() {
    _stopTimers();
    _amount.dispose();
    super.dispose();
  }

  void _stopTimers() {
    _poll?.cancel();
    _clock?.cancel();
    _poll = _clock = null;
  }

  void _show(KhqrCharge c) {
    if (!mounted) return;
    setState(() => _charge = c);
    if (!c.isPending) {
      _stopTimers();
      return;
    }
    _clock ??= Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    _poll ??= Timer.periodic(widget.pollInterval, (_) async {
      final id = _charge?.id;
      if (id == null) return;
      try {
        final fresh = await ref.read(repoProvider).khqrCharge(id);
        if (_charge?.id == id) _show(fresh);
      } catch (_) {
        // A dropped poll is retried on the next tick; the code stays on screen.
      }
    });
  }

  Future<void> _run(Future<KhqrCharge> Function() action) async {
    final t = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      _show(await action());
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e, network: t.networkError, generic: t.somethingWrong));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _create(KhqrAccount account) {
    final t = AppLocalizations.of(context);
    final invalid = validateCollectAmount(_amount.text, account.currency, t);
    if (invalid != null) {
      setState(() => _error = invalid);
      return;
    }
    FocusScope.of(context).unfocus();
    final outletId = ref.read(selectedOutletProvider);
    _run(() => ref.read(repoProvider).createKhqr(accountId: account.id, amount: _amount.text.trim(), outletId: outletId));
  }

  void _reset() {
    _stopTimers();
    setState(() {
      if (_charge?.status == 'PAID') _amount.clear();
      _charge = null;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final setup = ref.watch(khqrSetupProvider);
    // A code belongs to one company: switching company starts over.
    ref.listen(sessionProvider.select((s) => s.value?.activeCompanyId), (_, _) => _reset());
    return Scaffold(
      appBar: AppBar(
        title: Text(t.collectTitle, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: setup.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: ErrorView(
            message: errorMessage(e, network: t.networkError, generic: t.somethingWrong),
            onRetry: () => ref.invalidate(khqrSetupProvider),
          ),
        ),
        data: (s) {
          if (s.mode == 'off') return _Notice(icon: Icons.qr_code_2_rounded, text: t.collectNotAvailable);
          if (s.accounts.isEmpty) return _Notice(icon: Icons.account_balance_rounded, text: t.collectNoAccount);
          final account = s.accounts.firstWhere((a) => a.id == _accountId, orElse: () => s.accounts.first);
          final c = _charge;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
            children: [
              if (s.mode == 'simulated')
                Container(
                  key: const Key('collect-demo'),
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Brand.pendingBg, borderRadius: BorderRadius.circular(14)),
                  child: Text(
                    t.collectDemoMode,
                    style: const TextStyle(color: Brand.pending, fontWeight: FontWeight.w500),
                  ),
                ),
              if (c == null) _form(t, s.accounts, account) else if (c.isPending) _pending(t, c) else _result(t, c),
            ],
          );
        },
      ),
    );
  }

  Widget _form(AppLocalizations t, List<KhqrAccount> accounts, KhqrAccount account) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const OutletChips(padding: EdgeInsets.only(bottom: 12)),
        if (accounts.length > 1)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: DropdownButtonFormField<String>(
              key: const Key('collect-account'),
              initialValue: account.id,
              isExpanded: true,
              decoration: InputDecoration(labelText: t.collectAccount),
              items: [
                for (final a in accounts)
                  DropdownMenuItem(
                    value: a.id,
                    child: Text('${a.displayName} · ${a.accountId} · ${a.currency}', overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (id) => setState(() {
                _accountId = id;
                _error = null;
              }),
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text('${account.displayName} · ${account.accountId} · ${account.currency}', style: const TextStyle(color: Brand.ink2)),
          ),
        TextField(
          key: const Key('collect-amount'),
          controller: _amount,
          keyboardType: TextInputType.numberWithOptions(decimal: account.currency != 'KHR'),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(account.currency == 'KHR' ? r'[0-9]' : r'[0-9.]'))],
          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700),
          decoration: InputDecoration(labelText: t.collectAmount(account.currency), hintText: account.currency == 'KHR' ? '40000' : '12.50'),
          onChanged: (_) => setState(() => _error = null),
          onSubmitted: (_) => _create(account),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              _error!,
              key: const Key('collect-error'),
              style: const TextStyle(color: Brand.failed),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton.icon(
          key: const Key('show-khqr'),
          onPressed: _busy || _amount.text.trim().isEmpty ? null : () => _create(account),
          icon: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.qr_code_2_rounded),
          label: Text(t.collectShowQr),
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
        ),
      ],
    );
  }

  Widget _pending(AppLocalizations t, KhqrCharge c) {
    final left = c.expiresAt.difference(DateTime.now());
    final secs = left.isNegative ? 0 : left.inSeconds;
    final time = '${secs ~/ 60}:${(secs % 60).toString().padLeft(2, '0')}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          key: const Key('khqr-card'),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Brand.line),
            boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 18, offset: Offset(0, 6))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                color: khqrRed,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                child: Row(
                  children: [
                    const Text(
                      'KHQR',
                      style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: 1),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        t.collectScanHint,
                        textAlign: TextAlign.end,
                        style: const TextStyle(color: Colors.white, fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      c.merchantName,
                      style: const TextStyle(color: Brand.ink2, fontWeight: FontWeight.w500),
                    ),
                    Text(
                      formatMoney(c.amountMinor, c.currency),
                      key: const Key('khqr-amount'),
                      style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: Brand.ink),
                    ),
                  ],
                ),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                child: Divider(color: Brand.line),
              ),
              Center(
                child: QrImageView(
                  key: const Key('khqr-qr'),
                  data: c.qr,
                  size: 240,
                  errorCorrectionLevel: QrErrorCorrectLevel.M,
                  backgroundColor: Colors.white,
                  semanticsLabel: 'KHQR',
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                child: Row(
                  children: [
                    Expanded(
                      child: Text('${t.reference} ${c.reference}', style: const TextStyle(color: Brand.ink3, fontSize: 12)),
                    ),
                    const Icon(Icons.schedule_rounded, size: 14, color: Brand.ink3),
                    const SizedBox(width: 4),
                    Text(
                      t.collectExpiresIn(time),
                      key: const Key('khqr-countdown'),
                      style: const TextStyle(color: Brand.ink3, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Text(
          t.collectWaiting,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Brand.ink2),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Brand.failed),
            ),
          ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                key: const Key('cancel-khqr'),
                onPressed: _busy ? null : () => _run(() => ref.read(repoProvider).cancelKhqr(c.id)),
                child: Text(t.collectCancel),
              ),
            ),
            if (c.simulated) ...[
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  key: const Key('simulate-paid'),
                  onPressed: _busy ? null : () => _run(() => ref.read(repoProvider).simulateKhqrPaid(c.id)),
                  child: Text(t.collectSimulatePaid, textAlign: TextAlign.center),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }

  Widget _result(AppLocalizations t, KhqrCharge c) {
    final (icon, color, title, hint) = switch (c.status) {
      'PAID' => (Icons.check_circle_rounded, Brand.success, t.collectPaid, c.payerAccount == null ? null : t.collectPaidFrom(c.payerAccount!)),
      'REVIEW' => (Icons.gpp_maybe_rounded, Brand.pending, t.collectReview, t.collectReviewHint),
      'EXPIRED' => (Icons.timer_off_rounded, Brand.ink3, t.collectExpired, t.collectExpiredHint),
      _ => (Icons.cancel_rounded, Brand.ink3, t.collectCanceled, null),
    };
    return Card(
      key: Key('khqr-result-${c.status}'),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Icon(icon, size: 64, color: color),
            const SizedBox(height: 10),
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            if (c.status == 'PAID') ...[
              const SizedBox(height: 4),
              Text(formatMoney(c.amountMinor, c.currency), style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
            ],
            if (hint != null) ...[
              const SizedBox(height: 6),
              Text(
                hint,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Brand.ink2),
              ),
            ],
            const SizedBox(height: 4),
            Text('${t.reference} ${c.reference}', style: const TextStyle(color: Brand.ink3, fontSize: 12)),
            const SizedBox(height: 18),
            FilledButton(
              key: const Key('new-khqr'),
              onPressed: _reset,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: Text(t.collectNew),
            ),
          ],
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 40, color: Brand.primary),
          const SizedBox(height: 10),
          Text(
            text,
            key: const Key('collect-notice'),
            textAlign: TextAlign.center,
            style: const TextStyle(color: Brand.ink2),
          ),
        ],
      ),
    ),
  );
}
