// "SMS left" chip for the top of the Head teacher and Bursar workspaces.
import { Link } from 'wouter';
import { MessageSquareText } from 'lucide-react';
import { currentSchoolId, useSmsStatus } from './sms-data';

export function SmsBalanceChip() {
  const status = useSmsStatus(currentSchoolId());
  if (status.isError) return null; // before the one-time database update the chip simply stays hidden
  const balance = status.data?.balance;
  const tone = balance === undefined ? 'border-border bg-card text-muted-foreground' : balance <= 0 ? 'border-red-300 bg-red-50 text-red-800' : balance < 50 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800';
  return <Link href="/sms" data-testid="sms-balance-chip" title={balance !== undefined && balance <= 0 ? 'No SMS left. Tap to request a recharge.' : 'SMS your school can still send'} className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${tone}`}>
    <MessageSquareText size={14} aria-hidden="true" />
    <span data-testid="sms-balance-value">{balance === undefined ? '…' : balance.toLocaleString('en-US')}</span><span className="hidden sm:inline">SMS left</span>
  </Link>;
}
