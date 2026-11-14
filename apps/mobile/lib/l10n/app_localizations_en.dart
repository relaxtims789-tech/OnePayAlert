// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'One PayAlert';

  @override
  String get tagline => 'One Platform. Multiple Banks. Instant Payment Alerts.';

  @override
  String get signInTitle => 'Welcome back';

  @override
  String get signInSubtitle =>
      'Sign in to hear every payment the moment it lands.';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get signIn => 'Sign in';

  @override
  String get invalidCredentials => 'Invalid email or password';

  @override
  String get networkError =>
      'Cannot reach the server. Check your connection and try again.';

  @override
  String get somethingWrong => 'Something went wrong';

  @override
  String get retry => 'Try again';

  @override
  String get sessionExpired => 'Your session has ended. Please sign in again.';

  @override
  String get home => 'Home';

  @override
  String get transactions => 'Transactions';

  @override
  String get settings => 'Settings';

  @override
  String greeting(String name) {
    return 'Hello, $name';
  }

  @override
  String get receivedToday => 'Received today';

  @override
  String paymentsToday(int count) {
    return '$count successful payments today';
  }

  @override
  String pendingFailed(int pending, int failed) {
    return 'Pending $pending · Failed $failed';
  }

  @override
  String get liveFeed => 'Live payments';

  @override
  String get live => 'Live';

  @override
  String get connecting => 'Connecting…';

  @override
  String get offline => 'Offline';

  @override
  String get noPayments => 'No payments yet';

  @override
  String get noPaymentsHint => 'New payments appear here instantly.';

  @override
  String newPayment(String amount) {
    return 'New payment: $amount';
  }

  @override
  String get soundAlerts => 'Sound and voice alerts';

  @override
  String get soundAlertsHint =>
      'Chime and spoken amount for every successful payment';

  @override
  String get today => 'Today';

  @override
  String get last7 => '7 days';

  @override
  String get last30 => '30 days';

  @override
  String get allStatuses => 'All';

  @override
  String get allOutlets => 'All outlets';

  @override
  String get statusSuccess => 'Successful';

  @override
  String get statusPending => 'Pending';

  @override
  String get statusFailed => 'Failed';

  @override
  String get statusReversed => 'Reversed';

  @override
  String get noTransactions => 'No transactions found';

  @override
  String get details => 'Transaction details';

  @override
  String get payer => 'Payer';

  @override
  String get payerAccount => 'Payer account';

  @override
  String get reference => 'Reference';

  @override
  String get provider => 'Bank / gateway';

  @override
  String get paidAt => 'Paid at';

  @override
  String get providerTxnId => 'Transaction ID';

  @override
  String get demo => 'Demo';

  @override
  String get simulated => 'Simulated (not real money)';

  @override
  String get company => 'Company';

  @override
  String get role => 'Role';

  @override
  String get language => 'Language';

  @override
  String get signOut => 'Sign out';

  @override
  String get pushNotifications => 'Push notifications';

  @override
  String get pushOn => 'On — alerts arrive even when the app is closed';

  @override
  String get pushOff => 'Not configured for this build';

  @override
  String get version => 'Version';

  @override
  String get account => 'Account';

  @override
  String get roleOwner => 'Owner';

  @override
  String get roleAdmin => 'Admin';

  @override
  String get roleManager => 'Manager';

  @override
  String get roleAccountant => 'Accountant';

  @override
  String get roleCashier => 'Cashier';

  @override
  String get collect => 'Collect';

  @override
  String get collectTitle => 'Collect payment';

  @override
  String get collectAccount => 'Receiving account';

  @override
  String collectAmount(String currency) {
    return 'Amount ($currency)';
  }

  @override
  String get collectShowQr => 'Show KHQR';

  @override
  String get collectScanHint => 'Scan with any Cambodian bank app';

  @override
  String get collectWaiting => 'Waiting for the customer to pay…';

  @override
  String collectExpiresIn(String time) {
    return 'Expires in $time';
  }

  @override
  String get collectCancel => 'Cancel';

  @override
  String get collectNew => 'New payment';

  @override
  String get collectPaid => 'Payment received';

  @override
  String collectPaidFrom(String account) {
    return 'From $account';
  }

  @override
  String get collectExpired => 'Code expired';

  @override
  String get collectExpiredHint =>
      'No payment arrived in time. Create a new code if the customer still wants to pay.';

  @override
  String get collectCanceled => 'Code canceled';

  @override
  String get collectReview => 'Payment needs checking';

  @override
  String get collectReviewHint =>
      'Bakong reported a payment that does not match this request. It was not counted; check it in your bank app.';

  @override
  String get collectDemoMode =>
      'Demo mode: Bakong is simulated, no real money moves.';

  @override
  String get collectSimulatePaid => 'Customer paid (demo)';

  @override
  String get collectNotAvailable =>
      'KHQR payments are not available yet. MysoftKH has to connect the platform to Bakong first.';

  @override
  String get collectNoAccount =>
      'No Bakong KHQR account is connected yet. The owner can connect one in the web dashboard.';

  @override
  String get collectAmountInvalid => 'Enter a valid amount';

  @override
  String get collectAmountInvalidKhr => 'Enter a whole riel amount';

  @override
  String get bankAlerts => 'Bank alerts on this phone';

  @override
  String get bankAlertsHint =>
      'Forward your bank app\'s payment alerts to the soundbox and dashboard';

  @override
  String get bankAlertsIntro =>
      'Works with any bank app on this phone (ABA, ACLEDA, Wing…). These payments are marked \"From phone\" because the bank did not confirm them directly.';

  @override
  String get bankAlertsAccount => 'Record payments in';

  @override
  String bankAlertsCreate(String currency) {
    return 'Create $currency connection';
  }

  @override
  String get bankAlertsPhoneName => 'Name of this phone';

  @override
  String get bankAlertsSetUp => 'Set up this phone';

  @override
  String get bankAlertsAccess => 'Notification access';

  @override
  String get bankAlertsAccessOn => 'Allowed';

  @override
  String get bankAlertsAccessOff =>
      'Allow One PayAlert to read notifications, then come back.';

  @override
  String get bankAlertsOpenSettings => 'Open settings';

  @override
  String get bankAlertsApps => 'Bank apps to forward';

  @override
  String get bankAlertsAppsHint =>
      'Only the apps you tick are sent. Not listed? Wait for any notification from your bank app, then pull down to refresh.';

  @override
  String get bankAlertsActivity => 'Activity';

  @override
  String bankAlertsLast(String time) {
    return 'Last: $time';
  }

  @override
  String bankAlertsCounts(int accepted, int ignored, int failed) {
    return '$accepted payments · $ignored skipped · $failed failed';
  }

  @override
  String bankAlertsQueued(int count) {
    return '$count waiting to send';
  }

  @override
  String get bankAlertsRemoved =>
      'This phone was removed in the dashboard. Set it up again to keep forwarding.';

  @override
  String get bankAlertsStop => 'Stop forwarding on this phone';

  @override
  String get bankAlertsKeepOn =>
      'Keep this phone on, online and signed in to your bank app.';

  @override
  String get fromPhone => 'From phone';
}
