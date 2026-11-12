import type { Locale } from './enums';

/**
 * User-facing API error messages in every supported language.
 *
 * The API attaches `code` to error responses and translates `message` into the caller's language
 * (Accept-Language, then the profile language). Errors thrown with a plain English message are
 * matched against `en` (a `{name}` placeholder matches any text), so existing throws translate
 * without change. Unknown messages fall back to English — never to a wrong translation.
 */
export interface ErrorText {
  en: string;
  km: string;
  zh: string;
}

export const API_ERRORS = {
  // ── Sign-in and accounts
  INVALID_CREDENTIALS: {
    en: 'Invalid email or password',
    km: 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ',
    zh: '邮箱或密码错误',
  },
  ACCOUNT_DISABLED: { en: 'This account is disabled', km: 'គណនីនេះត្រូវបានបិទ', zh: '此账户已被停用' },
  COMPANY_SUSPENDED: {
    en: 'This company account is suspended. Contact MysoftKH support.',
    km: 'គណនីក្រុមហ៊ុននេះត្រូវបានផ្អាក។ សូមទាក់ទងផ្នែកជំនួយរបស់ MysoftKH។',
    zh: '该公司账户已被暂停，请联系 MysoftKH 客服。',
  },
  EMAIL_TAKEN: {
    en: 'An account with this email already exists',
    km: 'មានគណនីដែលប្រើអ៊ីមែលនេះរួចហើយ',
    zh: '该邮箱已注册',
  },
  NOT_A_MEMBER: {
    en: 'You are not a member of this company',
    km: 'អ្នកមិនមែនជាសមាជិករបស់ក្រុមហ៊ុននេះទេ',
    zh: '您不是该公司的成员',
  },
  MEMBERSHIP_INACTIVE: {
    en: 'Membership is no longer active',
    km: 'សមាជិកភាពរបស់អ្នកលែងសកម្មហើយ',
    zh: '您的成员资格已失效',
  },
  NO_ACTIVE_MEMBERSHIP: {
    en: 'This account has no active company membership',
    km: 'គណនីនេះមិនមានសមាជិកភាពក្រុមហ៊ុនដែលសកម្មទេ',
    zh: '此账户没有有效的公司成员资格',
  },
  NO_ACTIVE_COMPANY: { en: 'No active company selected', km: 'មិនទាន់ជ្រើសរើសក្រុមហ៊ុន', zh: '尚未选择公司' },
  SESSION_EXPIRED: {
    en: 'Session expired',
    km: 'វគ្គចូលរបស់អ្នកបានផុតកំណត់។ សូមចូលគណនីម្ដងទៀត។',
    zh: '登录已过期，请重新登录。',
  },
  RESET_LINK_INVALID: {
    en: 'This reset link is invalid or has expired',
    km: 'តំណកំណត់ពាក្យសម្ងាត់ឡើងវិញនេះមិនត្រឹមត្រូវ ឬផុតកំណត់ហើយ',
    zh: '此重置链接无效或已过期',
  },
  CURRENT_PASSWORD_WRONG: {
    en: 'Current password is incorrect',
    km: 'ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវ',
    zh: '当前密码不正确',
  },
  PASSWORD_UNCHANGED: {
    en: 'New password must be different from the current one',
    km: 'ពាក្យសម្ងាត់ថ្មីត្រូវតែខុសពីពាក្យសម្ងាត់បច្ចុប្បន្ន',
    zh: '新密码不能与当前密码相同',
  },

  // ── Permissions and staff
  FORBIDDEN: {
    en: 'You do not have permission to perform this action',
    km: 'អ្នកមិនមានសិទ្ធិធ្វើសកម្មភាពនេះទេ',
    zh: '您无权执行此操作',
  },
  CANNOT_CHANGE_SELF: {
    en: 'You cannot change your own role or access',
    km: 'អ្នកមិនអាចប្ដូរតួនាទី ឬសិទ្ធិចូលប្រើរបស់ខ្លួនឯងបានទេ',
    zh: '您不能更改自己的角色或权限',
  },
  ROLE_CANNOT_MANAGE: {
    en: 'Your role cannot manage {role} employees',
    km: 'តួនាទីរបស់អ្នកមិនអាចគ្រប់គ្រងបុគ្គលិកដែលមានតួនាទី {role} បានទេ',
    zh: '您的角色无法管理 {role} 员工',
  },
  ALREADY_EMPLOYEE: {
    en: 'This person is already an employee',
    km: 'អ្នកនេះជាបុគ្គលិករួចហើយ',
    zh: '此人已是员工',
  },

  // ── Not found / invalid references
  COMPANY_NOT_FOUND: { en: 'Company not found', km: 'រកមិនឃើញក្រុមហ៊ុន', zh: '未找到公司' },
  OUTLET_NOT_FOUND: { en: 'Outlet not found', km: 'រកមិនឃើញសាខា', zh: '未找到门店' },
  OUTLET_NOT_EXIST: { en: 'Outlet does not exist', km: 'សាខានេះមិនមានទេ', zh: '门店不存在' },
  OUTLETS_NOT_EXIST: {
    en: 'One or more outlets do not exist',
    km: 'សាខាមួយ ឬច្រើនមិនមានទេ',
    zh: '一个或多个门店不存在',
  },
  EMPLOYEE_NOT_FOUND: { en: 'Employee not found', km: 'រកមិនឃើញបុគ្គលិក', zh: '未找到员工' },
  TRANSACTION_NOT_FOUND: { en: 'Transaction not found', km: 'រកមិនឃើញប្រតិបត្តិការ', zh: '未找到交易' },
  BANK_CONNECTION_NOT_FOUND: {
    en: 'Bank connection not found',
    km: 'រកមិនឃើញការភ្ជាប់ធនាគារ',
    zh: '未找到银行连接',
  },
  PLAN_NOT_FOUND: { en: 'Plan not found', km: 'រកមិនឃើញគម្រោង', zh: '未找到套餐' },
  INVOICE_NOT_FOUND: { en: 'Invoice not found', km: 'រកមិនឃើញវិក្កយបត្រ', zh: '未找到账单' },
  UNKNOWN_PROVIDER: {
    en: 'Unknown or inactive payment provider',
    km: 'អ្នកផ្ដល់សេវាទូទាត់មិនស្គាល់ ឬមិនសកម្ម',
    zh: '支付服务商不存在或未启用',
  },
  CONNECTION_DISCONNECTED: {
    en: 'Connection is disconnected',
    km: 'ការភ្ជាប់នេះត្រូវបានផ្ដាច់ហើយ',
    zh: '该连接已断开',
  },
  NOTHING_TO_UPDATE: { en: 'Nothing to update', km: 'គ្មានអ្វីត្រូវកែប្រែទេ', zh: '没有需要更新的内容' },
  DUPLICATE: {
    en: 'A record with this {field} already exists',
    km: 'ព័ត៌មាននេះមានរួចហើយ (ឧ. កូដសាខាដដែល)',
    zh: '该记录已存在（例如门店代码重复）',
  },

  // ── Dates and reports
  DATE_RANGE_ORDER: {
    en: '`from` must be before `to`',
    km: 'កាលបរិច្ឆេទចាប់ផ្ដើមត្រូវតែមុនកាលបរិច្ឆេទបញ្ចប់',
    zh: '开始日期必须早于结束日期',
  },
  DATE_RANGE_TOO_LONG: {
    en: 'Date range cannot exceed {days} days',
    km: 'រយៈពេលមិនអាចលើសពី {days} ថ្ងៃទេ',
    zh: '日期范围不能超过 {days} 天',
  },
  REPORT_TOO_LARGE: {
    en: 'This export has more than {max} rows. Choose a shorter date range.',
    km: 'ការនាំចេញនេះមានច្រើនជាង {max} ជួរ។ សូមជ្រើសរយៈពេលខ្លីជាងនេះ។',
    zh: '导出超过 {max} 行，请缩短日期范围。',
  },

  // ── Plans and billing
  SUBSCRIPTION_INACTIVE: {
    en: 'Your subscription has ended. Renew it on the Billing page to add outlets, employees or bank connections.',
    km: 'ការជាវរបស់អ្នកបានបញ្ចប់។ សូមបន្តការជាវនៅទំព័រវិក្កយបត្រ ដើម្បីបន្ថែមសាខា បុគ្គលិក ឬការភ្ជាប់ធនាគារ។',
    zh: '您的订阅已结束。请在账单页面续订后再添加门店、员工或银行连接。',
  },
  PLAN_LIMIT_OUTLETS: {
    en: 'Your {plan} plan allows up to {limit} active outlets. Upgrade your plan to add more.',
    km: 'គម្រោង {plan} របស់អ្នកអនុញ្ញាតសាខាសកម្មបានច្រើនបំផុត {limit}។ សូមដំឡើងគម្រោង ដើម្បីបន្ថែមទៀត។',
    zh: '您的 {plan} 套餐最多可有 {limit} 个启用门店。升级套餐即可添加更多。',
  },
  PLAN_LIMIT_EMPLOYEES: {
    en: 'Your {plan} plan allows up to {limit} active employees. Upgrade your plan to add more.',
    km: 'គម្រោង {plan} របស់អ្នកអនុញ្ញាតបុគ្គលិកសកម្មបានច្រើនបំផុត {limit} នាក់។ សូមដំឡើងគម្រោង ដើម្បីបន្ថែមទៀត។',
    zh: '您的 {plan} 套餐最多可有 {limit} 名在职员工。升级套餐即可添加更多。',
  },
  PLAN_LIMIT_BANK_CONNECTIONS: {
    en: 'Your {plan} plan allows up to {limit} bank connections. Upgrade your plan to add more.',
    km: 'គម្រោង {plan} របស់អ្នកអនុញ្ញាតការភ្ជាប់ធនាគារបានច្រើនបំផុត {limit}។ សូមដំឡើងគម្រោង ដើម្បីបន្ថែមទៀត។',
    zh: '您的 {plan} 套餐最多可有 {limit} 个银行连接。升级套餐即可添加更多。',
  },
  PLAN_LIMIT_DEVICES: {
    en: 'Your {plan} plan allows up to {limit} devices. Upgrade your plan to add more.',
    km: 'គម្រោង {plan} របស់អ្នកអនុញ្ញាតឧបករណ៍បានច្រើនបំផុត {limit}។ សូមដំឡើងគម្រោង ដើម្បីបន្ថែមទៀត។',
    zh: '您的 {plan} 套餐最多可有 {limit} 台设备。升级套餐即可添加更多。',
  },
  PLAN_UNAVAILABLE: { en: 'This plan is not available', km: 'គម្រោងនេះមិនមានទេ', zh: '该套餐不可用' },
  ALREADY_ON_PLAN: {
    en: 'You are already on this plan',
    km: 'អ្នកកំពុងប្រើគម្រោងនេះរួចហើយ',
    zh: '您已在使用此套餐',
  },
  INVOICE_NOT_OPEN: {
    en: 'Only open invoices can be paid or voided',
    km: 'មានតែវិក្កយបត្រដែលមិនទាន់ទូទាត់ប៉ុណ្ណោះ ដែលអាចទូទាត់ ឬលុបចោលបាន',
    zh: '只有未付账单才能标记付款或作废',
  },

  // ── Soundbox devices
  DEVICE_NOT_FOUND: { en: 'Device not found', km: 'រកមិនឃើញឧបករណ៍', zh: '未找到设备' },
  DEVICE_CLAIM_INVALID: {
    en: 'This serial number and claim code do not match a device that can be added. Check the label on the box.',
    km: 'លេខស៊េរី និងលេខកូដនេះ មិនត្រូវនឹងឧបករណ៍ដែលអាចបន្ថែមបានទេ។ សូមពិនិត្យស្លាកនៅលើប្រអប់។',
    zh: '该序列号和认领码与可添加的设备不匹配，请检查包装盒上的标签。',
  },
  DEVICE_DISABLED: {
    en: 'This device has been disabled by MysoftKH. Contact support.',
    km: 'ឧបករណ៍នេះត្រូវបាន MysoftKH បិទ។ សូមទាក់ទងផ្នែកជំនួយ។',
    zh: '该设备已被 MysoftKH 停用，请联系客服。',
  },

  // ── Generic
  VALIDATION_FAILED: {
    en: 'Some of the information is not valid. Please check it and try again.',
    km: 'ព័ត៌មានខ្លះមិនត្រឹមត្រូវ។ សូមពិនិត្យ ហើយព្យាយាមម្ដងទៀត។',
    zh: '部分信息无效，请检查后重试。',
  },
  TOO_MANY_REQUESTS: {
    en: 'Too many attempts. Please wait a moment and try again.',
    km: 'ព្យាយាមច្រើនដងពេក។ សូមរង់ចាំបន្តិច ហើយព្យាយាមម្ដងទៀត។',
    zh: '尝试次数过多，请稍后再试。',
  },
  INTERNAL: {
    en: 'Something went wrong. Please try again.',
    km: 'មានបញ្ហាកើតឡើង។ សូមព្យាយាមម្ដងទៀត។',
    zh: '出现问题，请重试。',
  },
} as const satisfies Record<string, ErrorText>;

export type ApiErrorCode = keyof typeof API_ERRORS;
export type ErrorParams = Record<string, string | number>;

function fill(template: string, params: ErrorParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Message for `code` in `locale`, with `{name}` placeholders filled. */
export function errorMessage(code: ApiErrorCode, locale: Locale, params?: ErrorParams): string {
  return fill(API_ERRORS[code][locale], params);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATCHERS: { code: ApiErrorCode; re: RegExp; names: string[] }[] = (
  Object.keys(API_ERRORS) as ApiErrorCode[]
).map((code) => {
  const en: string = API_ERRORS[code].en;
  const names = [...en.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);
  const pattern = en
    .split(/\{\w+\}/)
    .map(escape)
    .join('(.+?)');
  return { code, re: new RegExp(`^${pattern}$`), names };
});

/** Recognises an English API message (including templated ones) and returns its code and params. */
export function matchErrorMessage(message: string): { code: ApiErrorCode; params: ErrorParams } | null {
  for (const m of MATCHERS) {
    const hit = m.re.exec(message);
    if (hit) {
      const params: ErrorParams = {};
      m.names.forEach((n, i) => (params[n] = hit[i + 1] as string));
      return { code: m.code, params };
    }
  }
  return null;
}
