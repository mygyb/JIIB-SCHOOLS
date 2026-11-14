import { useQuery } from '@tanstack/react-query';
import { jiibApi } from '@/lib/jiib-api';

export type SmsHistory = { id: string; kind: string; audience: string; text: string; sentBy: string; recipients: number; segments: number; failed: number; status: string; createdAt: string };
export type SmsStatus = { balance: number; payCode: string; providerReady: boolean; defaultTemplate: string; pendingRequest: { amount: number; createdAt: string } | null; history: SmsHistory[] };

export function currentSchoolId(): string {
  try { return String((JSON.parse(localStorage.getItem('jiib.school') || 'null') ?? {}).id ?? ''); } catch { return ''; }
}

export const smsKey = (schoolId: string) => ['sms-status', schoolId];

export function useSmsStatus(schoolId: string) {
  return useQuery({ queryKey: smsKey(schoolId), queryFn: () => jiibApi<SmsStatus>(`/api/schools/${encodeURIComponent(schoolId)}/sms/status`), enabled: Boolean(schoolId), retry: 1, refetchInterval: 60_000 });
}
