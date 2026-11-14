import { parseBankNotification } from './bank-notifications';

// Written in the style of Cambodian bank app alerts. These are illustrative, not copies of real
// notifications: each bank's exact wording must be confirmed with real samples from a merchant phone.
const pay = (text: string, title?: string) => parseBankNotification({ title, text });

describe('parseBankNotification', () => {
  it('reads incoming payments in English, with the amount before or after the currency', () => {
    expect(pay('$5.00 paid by SOK DARA (*123) on 13 Nov 2026 10:20AM via ABA PAY at Sokha Coffee', 'ABA PAY')).toEqual({
      kind: 'payment',
      amount: '5.00',
      currency: 'USD',
      payerName: 'SOK DARA',
    });
    expect(pay('You have received 12.5 USD from CHAN SOPHEA. Ref: 88213')).toEqual({
      kind: 'payment',
      amount: '12.50',
      currency: 'USD',
      payerName: 'CHAN SOPHEA',
    });
    expect(pay('Received KHR 40,000 from KEO MALIS to account 0001234')).toMatchObject({ amount: '40000', currency: 'KHR', payerName: 'KEO MALIS' });
    expect(pay('Your account was credited with 3 USD')).toMatchObject({ amount: '3.00', currency: 'USD', payerName: null });
  });

  it('reads Khmer and Chinese wording, Khmer digits and the riel sign', () => {
    expect(pay('អ្នកបានទទួលប្រាក់ ៥០០០០៛ ពី សុខ ដារា')).toEqual({ kind: 'payment', amount: '50000', currency: 'KHR', payerName: 'សុខ ដារា' });
    expect(pay('បានទទួល 7.25 ដុល្លារ')).toMatchObject({ amount: '7.25', currency: 'USD' });
    expect(pay('您已收到 USD 20.00')).toMatchObject({ amount: '20.00', currency: 'USD' });
  });

  it('keeps the payment amount and skips a balance shown after it', () => {
    expect(pay('Received $8.00 from LIM HENG. Balance: $1,250.40')).toMatchObject({ amount: '8.00', currency: 'USD' });
    expect(pay('Received USD 5.00 ($5.00) from SOK DARA')).toMatchObject({ amount: '5.00' });
  });

  it('ignores money going out, security codes and anything unclear', () => {
    expect(pay('You paid $4.50 to Brown Coffee')).toEqual({ kind: 'ignored', reason: 'outgoing' });
    expect(pay('$20.00 sent to CHAN SOPHEA successfully')).toEqual({ kind: 'ignored', reason: 'outgoing' });
    expect(pay('Your OTP is 482913. Do not share it.')).toEqual({ kind: 'ignored', reason: 'security_code' });
    expect(pay('Your statement for October is ready')).toEqual({ kind: 'ignored', reason: 'not_incoming' });
    expect(pay('You received a new message')).toEqual({ kind: 'ignored', reason: 'no_amount' });
    expect(pay('Received $5.00 and $7.00 from two payers')).toEqual({ kind: 'ignored', reason: 'several_amounts' });
    expect(pay('Received KHR 100.50')).toEqual({ kind: 'ignored', reason: 'no_amount' });
  });
});
