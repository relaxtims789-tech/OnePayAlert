import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_km.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('km'),
    Locale('zh'),
  ];

  /// No description provided for @appName.
  ///
  /// In en, this message translates to:
  /// **'One PayAlert'**
  String get appName;

  /// No description provided for @tagline.
  ///
  /// In en, this message translates to:
  /// **'One Platform. Multiple Banks. Instant Payment Alerts.'**
  String get tagline;

  /// No description provided for @signInTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome back'**
  String get signInTitle;

  /// No description provided for @signInSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in to hear every payment the moment it lands.'**
  String get signInSubtitle;

  /// No description provided for @email.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @signIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signIn;

  /// No description provided for @invalidCredentials.
  ///
  /// In en, this message translates to:
  /// **'Invalid email or password'**
  String get invalidCredentials;

  /// No description provided for @networkError.
  ///
  /// In en, this message translates to:
  /// **'Cannot reach the server. Check your connection and try again.'**
  String get networkError;

  /// No description provided for @somethingWrong.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get somethingWrong;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get retry;

  /// No description provided for @sessionExpired.
  ///
  /// In en, this message translates to:
  /// **'Your session has ended. Please sign in again.'**
  String get sessionExpired;

  /// No description provided for @home.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get home;

  /// No description provided for @transactions.
  ///
  /// In en, this message translates to:
  /// **'Transactions'**
  String get transactions;

  /// No description provided for @settings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settings;

  /// No description provided for @greeting.
  ///
  /// In en, this message translates to:
  /// **'Hello, {name}'**
  String greeting(String name);

  /// No description provided for @receivedToday.
  ///
  /// In en, this message translates to:
  /// **'Received today'**
  String get receivedToday;

  /// No description provided for @paymentsToday.
  ///
  /// In en, this message translates to:
  /// **'{count} successful payments today'**
  String paymentsToday(int count);

  /// No description provided for @pendingFailed.
  ///
  /// In en, this message translates to:
  /// **'Pending {pending} · Failed {failed}'**
  String pendingFailed(int pending, int failed);

  /// No description provided for @liveFeed.
  ///
  /// In en, this message translates to:
  /// **'Live payments'**
  String get liveFeed;

  /// No description provided for @live.
  ///
  /// In en, this message translates to:
  /// **'Live'**
  String get live;

  /// No description provided for @connecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting…'**
  String get connecting;

  /// No description provided for @offline.
  ///
  /// In en, this message translates to:
  /// **'Offline'**
  String get offline;

  /// No description provided for @noPayments.
  ///
  /// In en, this message translates to:
  /// **'No payments yet'**
  String get noPayments;

  /// No description provided for @noPaymentsHint.
  ///
  /// In en, this message translates to:
  /// **'New payments appear here instantly.'**
  String get noPaymentsHint;

  /// No description provided for @newPayment.
  ///
  /// In en, this message translates to:
  /// **'New payment: {amount}'**
  String newPayment(String amount);

  /// No description provided for @soundAlerts.
  ///
  /// In en, this message translates to:
  /// **'Sound and voice alerts'**
  String get soundAlerts;

  /// No description provided for @soundAlertsHint.
  ///
  /// In en, this message translates to:
  /// **'Chime and spoken amount for every successful payment'**
  String get soundAlertsHint;

  /// No description provided for @today.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get today;

  /// No description provided for @last7.
  ///
  /// In en, this message translates to:
  /// **'7 days'**
  String get last7;

  /// No description provided for @last30.
  ///
  /// In en, this message translates to:
  /// **'30 days'**
  String get last30;

  /// No description provided for @allStatuses.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get allStatuses;

  /// No description provided for @allOutlets.
  ///
  /// In en, this message translates to:
  /// **'All outlets'**
  String get allOutlets;

  /// No description provided for @statusSuccess.
  ///
  /// In en, this message translates to:
  /// **'Successful'**
  String get statusSuccess;

  /// No description provided for @statusPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get statusPending;

  /// No description provided for @statusFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get statusFailed;

  /// No description provided for @statusReversed.
  ///
  /// In en, this message translates to:
  /// **'Reversed'**
  String get statusReversed;

  /// No description provided for @noTransactions.
  ///
  /// In en, this message translates to:
  /// **'No transactions found'**
  String get noTransactions;

  /// No description provided for @details.
  ///
  /// In en, this message translates to:
  /// **'Transaction details'**
  String get details;

  /// No description provided for @payer.
  ///
  /// In en, this message translates to:
  /// **'Payer'**
  String get payer;

  /// No description provided for @payerAccount.
  ///
  /// In en, this message translates to:
  /// **'Payer account'**
  String get payerAccount;

  /// No description provided for @reference.
  ///
  /// In en, this message translates to:
  /// **'Reference'**
  String get reference;

  /// No description provided for @provider.
  ///
  /// In en, this message translates to:
  /// **'Bank / gateway'**
  String get provider;

  /// No description provided for @paidAt.
  ///
  /// In en, this message translates to:
  /// **'Paid at'**
  String get paidAt;

  /// No description provided for @providerTxnId.
  ///
  /// In en, this message translates to:
  /// **'Transaction ID'**
  String get providerTxnId;

  /// No description provided for @demo.
  ///
  /// In en, this message translates to:
  /// **'Demo'**
  String get demo;

  /// No description provided for @simulated.
  ///
  /// In en, this message translates to:
  /// **'Simulated (not real money)'**
  String get simulated;

  /// No description provided for @company.
  ///
  /// In en, this message translates to:
  /// **'Company'**
  String get company;

  /// No description provided for @role.
  ///
  /// In en, this message translates to:
  /// **'Role'**
  String get role;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @signOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get signOut;

  /// No description provided for @pushNotifications.
  ///
  /// In en, this message translates to:
  /// **'Push notifications'**
  String get pushNotifications;

  /// No description provided for @pushOn.
  ///
  /// In en, this message translates to:
  /// **'On — alerts arrive even when the app is closed'**
  String get pushOn;

  /// No description provided for @pushOff.
  ///
  /// In en, this message translates to:
  /// **'Not configured for this build'**
  String get pushOff;

  /// No description provided for @version.
  ///
  /// In en, this message translates to:
  /// **'Version'**
  String get version;

  /// No description provided for @account.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get account;

  /// No description provided for @roleOwner.
  ///
  /// In en, this message translates to:
  /// **'Owner'**
  String get roleOwner;

  /// No description provided for @roleAdmin.
  ///
  /// In en, this message translates to:
  /// **'Admin'**
  String get roleAdmin;

  /// No description provided for @roleManager.
  ///
  /// In en, this message translates to:
  /// **'Manager'**
  String get roleManager;

  /// No description provided for @roleAccountant.
  ///
  /// In en, this message translates to:
  /// **'Accountant'**
  String get roleAccountant;

  /// No description provided for @roleCashier.
  ///
  /// In en, this message translates to:
  /// **'Cashier'**
  String get roleCashier;

  /// No description provided for @collect.
  ///
  /// In en, this message translates to:
  /// **'Collect'**
  String get collect;

  /// No description provided for @collectTitle.
  ///
  /// In en, this message translates to:
  /// **'Collect payment'**
  String get collectTitle;

  /// No description provided for @collectAccount.
  ///
  /// In en, this message translates to:
  /// **'Receiving account'**
  String get collectAccount;

  /// No description provided for @collectAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount ({currency})'**
  String collectAmount(String currency);

  /// No description provided for @collectShowQr.
  ///
  /// In en, this message translates to:
  /// **'Show KHQR'**
  String get collectShowQr;

  /// No description provided for @collectScanHint.
  ///
  /// In en, this message translates to:
  /// **'Scan with any Cambodian bank app'**
  String get collectScanHint;

  /// No description provided for @collectWaiting.
  ///
  /// In en, this message translates to:
  /// **'Waiting for the customer to pay…'**
  String get collectWaiting;

  /// No description provided for @collectExpiresIn.
  ///
  /// In en, this message translates to:
  /// **'Expires in {time}'**
  String collectExpiresIn(String time);

  /// No description provided for @collectCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get collectCancel;

  /// No description provided for @collectNew.
  ///
  /// In en, this message translates to:
  /// **'New payment'**
  String get collectNew;

  /// No description provided for @collectPaid.
  ///
  /// In en, this message translates to:
  /// **'Payment received'**
  String get collectPaid;

  /// No description provided for @collectPaidFrom.
  ///
  /// In en, this message translates to:
  /// **'From {account}'**
  String collectPaidFrom(String account);

  /// No description provided for @collectExpired.
  ///
  /// In en, this message translates to:
  /// **'Code expired'**
  String get collectExpired;

  /// No description provided for @collectExpiredHint.
  ///
  /// In en, this message translates to:
  /// **'No payment arrived in time. Create a new code if the customer still wants to pay.'**
  String get collectExpiredHint;

  /// No description provided for @collectCanceled.
  ///
  /// In en, this message translates to:
  /// **'Code canceled'**
  String get collectCanceled;

  /// No description provided for @collectReview.
  ///
  /// In en, this message translates to:
  /// **'Payment needs checking'**
  String get collectReview;

  /// No description provided for @collectReviewHint.
  ///
  /// In en, this message translates to:
  /// **'Bakong reported a payment that does not match this request. It was not counted; check it in your bank app.'**
  String get collectReviewHint;

  /// No description provided for @collectDemoMode.
  ///
  /// In en, this message translates to:
  /// **'Demo mode: Bakong is simulated, no real money moves.'**
  String get collectDemoMode;

  /// No description provided for @collectSimulatePaid.
  ///
  /// In en, this message translates to:
  /// **'Customer paid (demo)'**
  String get collectSimulatePaid;

  /// No description provided for @collectNotAvailable.
  ///
  /// In en, this message translates to:
  /// **'KHQR payments are not available yet. MysoftKH has to connect the platform to Bakong first.'**
  String get collectNotAvailable;

  /// No description provided for @collectNoAccount.
  ///
  /// In en, this message translates to:
  /// **'No Bakong KHQR account is connected yet. The owner can connect one in the web dashboard.'**
  String get collectNoAccount;

  /// No description provided for @collectAmountInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid amount'**
  String get collectAmountInvalid;

  /// No description provided for @collectAmountInvalidKhr.
  ///
  /// In en, this message translates to:
  /// **'Enter a whole riel amount'**
  String get collectAmountInvalidKhr;

  /// No description provided for @bankAlerts.
  ///
  /// In en, this message translates to:
  /// **'Bank alerts on this phone'**
  String get bankAlerts;

  /// No description provided for @bankAlertsHint.
  ///
  /// In en, this message translates to:
  /// **'Forward your bank app\'s payment alerts to the soundbox and dashboard'**
  String get bankAlertsHint;

  /// No description provided for @bankAlertsIntro.
  ///
  /// In en, this message translates to:
  /// **'Works with any bank app on this phone (ABA, ACLEDA, Wing…). These payments are marked \"From phone\" because the bank did not confirm them directly.'**
  String get bankAlertsIntro;

  /// No description provided for @bankAlertsAccount.
  ///
  /// In en, this message translates to:
  /// **'Record payments in'**
  String get bankAlertsAccount;

  /// No description provided for @bankAlertsCreate.
  ///
  /// In en, this message translates to:
  /// **'Create {currency} connection'**
  String bankAlertsCreate(String currency);

  /// No description provided for @bankAlertsPhoneName.
  ///
  /// In en, this message translates to:
  /// **'Name of this phone'**
  String get bankAlertsPhoneName;

  /// No description provided for @bankAlertsSetUp.
  ///
  /// In en, this message translates to:
  /// **'Set up this phone'**
  String get bankAlertsSetUp;

  /// No description provided for @bankAlertsAccess.
  ///
  /// In en, this message translates to:
  /// **'Notification access'**
  String get bankAlertsAccess;

  /// No description provided for @bankAlertsAccessOn.
  ///
  /// In en, this message translates to:
  /// **'Allowed'**
  String get bankAlertsAccessOn;

  /// No description provided for @bankAlertsAccessOff.
  ///
  /// In en, this message translates to:
  /// **'Allow One PayAlert to read notifications, then come back.'**
  String get bankAlertsAccessOff;

  /// No description provided for @bankAlertsOpenSettings.
  ///
  /// In en, this message translates to:
  /// **'Open settings'**
  String get bankAlertsOpenSettings;

  /// No description provided for @bankAlertsApps.
  ///
  /// In en, this message translates to:
  /// **'Bank apps to forward'**
  String get bankAlertsApps;

  /// No description provided for @bankAlertsAppsHint.
  ///
  /// In en, this message translates to:
  /// **'Only the apps you tick are sent. Not listed? Wait for any notification from your bank app, then pull down to refresh.'**
  String get bankAlertsAppsHint;

  /// No description provided for @bankAlertsActivity.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get bankAlertsActivity;

  /// No description provided for @bankAlertsLast.
  ///
  /// In en, this message translates to:
  /// **'Last: {time}'**
  String bankAlertsLast(String time);

  /// No description provided for @bankAlertsCounts.
  ///
  /// In en, this message translates to:
  /// **'{accepted} payments · {ignored} skipped · {failed} failed'**
  String bankAlertsCounts(int accepted, int ignored, int failed);

  /// No description provided for @bankAlertsQueued.
  ///
  /// In en, this message translates to:
  /// **'{count} waiting to send'**
  String bankAlertsQueued(int count);

  /// No description provided for @bankAlertsRemoved.
  ///
  /// In en, this message translates to:
  /// **'This phone was removed in the dashboard. Set it up again to keep forwarding.'**
  String get bankAlertsRemoved;

  /// No description provided for @bankAlertsStop.
  ///
  /// In en, this message translates to:
  /// **'Stop forwarding on this phone'**
  String get bankAlertsStop;

  /// No description provided for @bankAlertsKeepOn.
  ///
  /// In en, this message translates to:
  /// **'Keep this phone on, online and signed in to your bank app.'**
  String get bankAlertsKeepOn;

  /// No description provided for @fromPhone.
  ///
  /// In en, this message translates to:
  /// **'From phone'**
  String get fromPhone;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'km', 'zh'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'km':
      return AppLocalizationsKm();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
