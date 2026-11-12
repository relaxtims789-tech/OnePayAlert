import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/format.dart';
import '../data/models.dart';
import '../l10n/app_localizations.dart';
import '../state/app_state.dart';
import 'theme.dart';
import 'widgets.dart';

enum _Range { today, d7, d30 }

class TransactionsScreen extends ConsumerStatefulWidget {
  const TransactionsScreen({super.key});
  @override
  ConsumerState<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends ConsumerState<TransactionsScreen> {
  _Range _range = _Range.d7;
  String? _status;
  final List<Txn> _items = [];
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  Object? _error;
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _load();
    });
    _reset();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  DateTime get _from => switch (_range) {
        _Range.today => startOfBusinessDay(0),
        _Range.d7 => startOfBusinessDay(6),
        _Range.d30 => startOfBusinessDay(29),
      };

  void _reset() {
    setState(() {
      _items.clear();
      _page = 0;
      _hasMore = true;
      _error = null;
    });
    _load();
  }

  void _select({required _Range range, String? status, bool setStatus = false}) {
    _range = range;
    if (setStatus) _status = status;
    _reset();
  }

  Future<void> _load() async {
    if (_loading || !_hasMore) return;
    setState(() => _loading = true);
    try {
      final p = await ref.read(repoProvider).transactions(page: _page + 1, from: _from, status: _status, outletId: ref.read(selectedOutletProvider));
      if (!mounted) return;
      setState(() {
        _items.addAll(p.items);
        _page = p.page;
        _hasMore = p.hasMore;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = ref.watch(localeProvider);
    // New live payments refresh the list.
    ref.listen(selectedOutletProvider, (_, _) => _reset());
    ref.listen(feedProvider, (prev, next) {
      if (prev?.hasValue == true && next.hasValue && prev!.requireValue.firstOrNull?.id != next.requireValue.firstOrNull?.id) _reset();
    });

    Widget chip(String label, bool selected, VoidCallback onTap) => Padding(
          padding: const EdgeInsets.only(right: 8),
          child: ChoiceChip(label: Text(label), selected: selected, onSelected: (_) => onTap()),
        );

    return Scaffold(
      appBar: AppBar(title: Text(t.transactions, style: const TextStyle(fontWeight: FontWeight.w700))),
      body: Column(children: [
        const OutletChips(padding: EdgeInsets.fromLTRB(16, 4, 16, 0)),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Row(children: [
            chip(t.today, _range == _Range.today, () => _select(range: _Range.today)),
            chip(t.last7, _range == _Range.d7, () => _select(range: _Range.d7)),
            chip(t.last30, _range == _Range.d30, () => _select(range: _Range.d30)),
            const SizedBox(width: 8),
            for (final s in <String?>[null, 'SUCCESS', 'PENDING', 'FAILED'])
              chip(s == null ? t.allStatuses : statusLabel(t, s), _status == s, () => _select(range: _range, status: s, setStatus: true)),
          ]),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => _reset(),
            child: _error != null && _items.isEmpty
                ? ListView(children: [ErrorView(message: errorMessage(_error!, network: t.networkError, generic: t.somethingWrong), onRetry: _reset)])
                : !_loading && _items.isEmpty
                    ? ListView(children: [
                        Padding(
                          padding: const EdgeInsets.all(48),
                          child: Center(child: Text(t.noTransactions, key: const Key('no-transactions'), style: const TextStyle(color: Brand.ink2))),
                        ),
                      ])
                    : ListView.separated(
                        controller: _scroll,
                        key: const Key('transactions-list'),
                        itemCount: _items.length + (_hasMore ? 1 : 0),
                        separatorBuilder: (_, _) => const Divider(height: 1, indent: 70, color: Brand.line),
                        itemBuilder: (context, i) => i >= _items.length
                            ? const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator()))
                            : Container(color: Colors.white, child: TxnTile(_items[i], locale: locale, onTap: () => showTxnDetails(context, _items[i], locale))),
                      ),
          ),
        ),
      ]),
    );
  }
}
