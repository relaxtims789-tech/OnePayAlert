import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/soundbox_label.dart';
import '../data/models.dart';
import '../l10n/app_localizations.dart';
import '../state/app_state.dart';
import 'theme.dart';
import 'widgets.dart';

final soundboxesProvider = FutureProvider.autoDispose<List<Soundbox>>((ref) async {
  final companyId = ref.watch(sessionProvider.select((s) => s.value?.activeCompanyId));
  if (companyId == null) return const [];
  return ref.watch(repoProvider).soundboxes();
});

/// Opens the camera and returns what it read (null when cancelled). Replaced in tests.
typedef LabelScanner = Future<String?> Function(BuildContext context);
final labelScannerProvider = Provider<LabelScanner>(
  (ref) =>
      (context) => Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const ScanLabelScreen())),
);

const _languages = {'km': 'ខ្មែរ', 'en': 'English', 'zh': '中文'};

/// The company's soundboxes, and the way to add one from the box in hand.
class SoundboxesScreen extends ConsumerWidget {
  const SoundboxesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final canManage = ref.watch(sessionProvider).value?.can('device.manage') ?? false;
    final boxes = ref.watch(soundboxesProvider);
    final outlets = ref.watch(outletsProvider).value ?? const <Outlet>[];

    Future<void> activate() async {
      final added = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const ActivateSoundboxScreen()));
      if (added == true) ref.invalidate(soundboxesProvider);
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(t.soundboxes, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(soundboxesProvider.future),
        child: boxes.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              ErrorView(
                message: errorMessage(e, network: t.networkError, generic: t.somethingWrong),
                onRetry: () => ref.invalidate(soundboxesProvider),
              ),
            ],
          ),
          data: (list) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (list.isEmpty)
                _Pitch(t: t)
              else ...[
                for (final b in list)
                  Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ListTile(
                      key: Key('soundbox-${b.serialNumber}'),
                      leading: Icon(Icons.speaker_rounded, color: b.online ? Brand.primary : Brand.ink3),
                      title: Text(b.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        [
                          b.outletId == null ? t.allOutlets : (outlets.where((o) => o.id == b.outletId).firstOrNull?.name ?? ''),
                          _languages[b.locale] ?? b.locale,
                          if (b.batteryPct != null) '${b.batteryPct}%',
                        ].where((s) => s.isNotEmpty).join(' · '),
                      ),
                      trailing: Pill(
                        b.online ? t.soundboxOnline : t.offline,
                        fg: b.online ? Brand.success : Brand.ink2,
                        bg: b.online ? Brand.successBg : Brand.surface,
                      ),
                    ),
                  ),
              ],
              if (canManage) ...[
                const SizedBox(height: 8),
                FilledButton.icon(
                  key: const Key('activate-soundbox'),
                  onPressed: activate,
                  icon: const Icon(Icons.add_rounded),
                  label: Text(t.activateSoundbox),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Empty state that sells the device, like a shop window, before the first one is added.
class _Pitch extends StatelessWidget {
  const _Pitch({required this.t});
  final AppLocalizations t;

  @override
  Widget build(BuildContext context) {
    Widget point(String text) => Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.check_circle_rounded, color: Brand.success, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ],
      ),
    );
    return Card(
      key: const Key('soundbox-pitch'),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 96,
                height: 96,
                decoration: const BoxDecoration(color: Color(0xFFEAF2FC), shape: BoxShape.circle),
                child: const Icon(Icons.speaker_rounded, size: 48, color: Brand.primary),
              ),
            ),
            const SizedBox(height: 16),
            Text(t.soundboxPitchTitle, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            point(t.soundboxPitch1),
            point(t.soundboxPitch2),
            point(t.soundboxPitch3),
            const SizedBox(height: 12),
            Text(t.soundboxOrderHint, style: const TextStyle(color: Brand.ink2)),
          ],
        ),
      ),
    );
  }
}

/// Activate a soundbox: scan the box label (or type serial and claim code), choose outlet and language.
class ActivateSoundboxScreen extends ConsumerStatefulWidget {
  const ActivateSoundboxScreen({super.key});

  @override
  ConsumerState<ActivateSoundboxScreen> createState() => _ActivateSoundboxScreenState();
}

class _ActivateSoundboxScreenState extends ConsumerState<ActivateSoundboxScreen> {
  final _serial = TextEditingController();
  final _code = TextEditingController();
  final _name = TextEditingController();
  String? _outletId;
  String? _locale;
  String? _error;
  bool _busy = false;
  Soundbox? _activated;
  String? _testResult;

  @override
  void dispose() {
    _serial.dispose();
    _code.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _scan() async {
    final t = AppLocalizations.of(context);
    final text = await ref.read(labelScannerProvider)(context);
    if (text == null || !mounted) return;
    final label = parseSoundboxLabel(text);
    setState(() {
      if (label == null) {
        _error = t.notALabel;
        return;
      }
      _error = null;
      _serial.text = label.serialNumber;
      if (label.claimCode != null) _code.text = label.claimCode!;
    });
  }

  Future<void> _submit() async {
    final t = AppLocalizations.of(context);
    final serial = _serial.text.trim().toUpperCase();
    final code = normaliseClaimCode(_code.text);
    if (!isSoundboxSerial(serial)) return setState(() => _error = t.invalidSerial);
    if (code == null) return setState(() => _error = t.invalidClaimCode);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final box = await ref
          .read(repoProvider)
          .claimSoundbox(serialNumber: serial, claimCode: code, outletId: _outletId, name: _name.text.trim(), locale: _locale ?? ref.read(localeProvider));
      if (mounted) setState(() => _activated = box);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e, network: t.networkError, generic: t.somethingWrong));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _test() async {
    final t = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      final online = await ref.read(repoProvider).testSoundbox(_activated!.id);
      if (mounted) setState(() => _testResult = online ? t.testSoundSent : t.testSoundOffline);
    } catch (e) {
      if (mounted) setState(() => _testResult = errorMessage(e, network: t.networkError, generic: t.somethingWrong));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final String locale = _locale ?? ref.watch(localeProvider);
    final outlets = ref.watch(outletsProvider).value ?? const <Outlet>[];
    return Scaffold(
      appBar: AppBar(
        title: Text(t.activateSoundbox, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_activated != null)
            ..._done(t)
          else ...[
            OutlinedButton.icon(
              key: const Key('scan-label'),
              onPressed: _busy ? null : _scan,
              icon: const Icon(Icons.qr_code_scanner_rounded),
              label: Text(t.scanLabel),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            ),
            const SizedBox(height: 16),
            TextField(
              key: const Key('soundbox-serial'),
              controller: _serial,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(labelText: t.serialNumber),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('soundbox-code'),
              controller: _code,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(labelText: t.claimCode, helperText: t.claimCodeHint),
            ),
            const SizedBox(height: 12),
            if (outlets.length > 1) ...[
              DropdownButtonFormField<String?>(
                key: const Key('soundbox-outlet'),
                initialValue: _outletId,
                isExpanded: true,
                decoration: InputDecoration(labelText: t.soundboxOutlet),
                items: [
                  DropdownMenuItem<String?>(value: null, child: Text(t.allOutlets)),
                  for (final o in outlets) DropdownMenuItem<String?>(value: o.id, child: Text(o.name)),
                ],
                onChanged: (v) => setState(() => _outletId = v),
              ),
              const SizedBox(height: 12),
            ],
            TextField(
              key: const Key('soundbox-name'),
              controller: _name,
              decoration: InputDecoration(labelText: t.soundboxName),
            ),
            const SizedBox(height: 16),
            Text(t.soundboxLanguage, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              key: const Key('soundbox-language'),
              segments: [for (final e in _languages.entries) ButtonSegment(value: e.key, label: Text(e.value))],
              selected: {locale},
              onSelectionChanged: (s) => setState(() => _locale = s.first),
              showSelectedIcon: false,
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  _error!,
                  key: const Key('soundbox-error'),
                  style: const TextStyle(color: Brand.failed),
                ),
              ),
            const SizedBox(height: 20),
            FilledButton(
              key: const Key('soundbox-submit'),
              onPressed: _busy ? null : _submit,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              child: _busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(t.activateSoundbox),
            ),
          ],
        ],
      ),
    );
  }

  List<Widget> _done(AppLocalizations t) => [
    const SizedBox(height: 24),
    const Icon(Icons.check_circle_rounded, size: 72, color: Brand.success),
    const SizedBox(height: 12),
    Text(
      t.soundboxActivated,
      key: const Key('soundbox-activated'),
      textAlign: TextAlign.center,
      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
    ),
    Text(
      _activated!.label,
      textAlign: TextAlign.center,
      style: const TextStyle(color: Brand.ink2),
    ),
    const SizedBox(height: 24),
    OutlinedButton.icon(
      key: const Key('soundbox-test'),
      onPressed: _busy ? null : _test,
      icon: const Icon(Icons.volume_up_rounded),
      label: Text(t.playTestSound),
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
    ),
    if (_testResult != null)
      Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Text(_testResult!, key: const Key('soundbox-test-result'), textAlign: TextAlign.center),
      ),
    const SizedBox(height: 12),
    FilledButton(
      key: const Key('soundbox-done'),
      onPressed: () => Navigator.of(context).pop(true),
      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
      child: Text(t.done),
    ),
  ];
}

/// Full-screen camera that returns the first code it reads.
class ScanLabelScreen extends StatefulWidget {
  const ScanLabelScreen({super.key});

  @override
  State<ScanLabelScreen> createState() => _ScanLabelScreenState();
}

class _ScanLabelScreenState extends State<ScanLabelScreen> {
  bool _done = false;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(title: Text(t.scanLabel), backgroundColor: Colors.black, foregroundColor: Colors.white),
      body: Stack(
        children: [
          MobileScanner(
            onDetect: (capture) {
              final raw = capture.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
              if (raw == null || _done) return;
              _done = true;
              Navigator.of(context).pop(raw);
            },
            errorBuilder: (context, error) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  t.cameraUnavailable,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
          ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 40,
            child: Text(
              t.scanLabelHint,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 15),
            ),
          ),
        ],
      ),
    );
  }
}
