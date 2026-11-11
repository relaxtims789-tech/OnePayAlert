import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../l10n/app_localizations.dart';
import '../state/app_state.dart';
import 'theme.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _email.addListener(() => setState(() {}));
    _password.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final t = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).signIn(_email.text, _password.text);
    } catch (e) {
      setState(() {
        _busy = false;
        _error = e is ApiException && e.status == 401
            ? t.invalidCredentials
            : errorMessage(e, network: t.networkError, generic: t.somethingWrong);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final expired = ref.watch(sessionExpiredProvider);
    final canSubmit = !_busy && _email.text.trim().isNotEmpty && _password.text.isNotEmpty;
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              gradient: const LinearGradient(colors: [Brand.secondary, Brand.primary], begin: Alignment.topLeft, end: Alignment.bottomRight),
            ),
            child: Row(children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(14)),
                child: const Icon(Icons.notifications_active_rounded, color: Colors.white),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(t.appName, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                  Text(t.tagline, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5)),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 32),
          Text(t.signInTitle, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: Brand.ink)),
          const SizedBox(height: 6),
          Text(t.signInSubtitle, style: const TextStyle(color: Brand.ink2)),
          if (expired) ...[
            const SizedBox(height: 16),
            Text(t.sessionExpired, key: const Key('session-expired'), style: const TextStyle(color: Brand.primary)),
          ],
          const SizedBox(height: 24),
          TextField(
            key: const Key('email'),
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(labelText: t.email),
          ),
          const SizedBox(height: 14),
          TextField(
            key: const Key('password'),
            controller: _password,
            obscureText: _obscure,
            autofillHints: const [AutofillHints.password],
            onSubmitted: (_) => canSubmit ? _submit() : null,
            decoration: InputDecoration(
              labelText: t.password,
              suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(_error!, key: const Key('login-error'), style: const TextStyle(color: Brand.failed)),
          ],
          const SizedBox(height: 22),
          FilledButton(
            key: const Key('sign-in'),
            onPressed: canSubmit ? _submit : null,
            child: _busy
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                : Text(t.signIn, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ),
        ]),
      ),
    );
  }
}
