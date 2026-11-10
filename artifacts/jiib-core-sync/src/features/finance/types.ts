export type FeeItem = { name: string; amount: number };
export type StudentType = 'day' | 'boarding';
export type Totals = { students: number; expected: number; collected: number; outstanding: number; defaulters: number; cleared: number; withoutStructure: number; collectionRate: number };
export type Account = {
  studentId: string; name: string; className: string; parentPhone: string | null; studentType: StudentType;
  expected: number; paid: number; balance: number; custom: boolean; noStructure: boolean; items: FeeItem[]; note: string | null; lastPaymentOn: string | null;
};
export type Payment = {
  id: string; receiptNo: string; termKey: string; studentId: string; studentName: string; className: string; amount: number; method: string;
  tid: string | null; paidOn: string; paidBy: string | null; note: string | null; status: 'valid' | 'cancelled'; cancelReason: string | null;
  cancelledAt: string | null; cancelledBy: string | null; recordedBy: string | null; createdAt: string;
};
export type Overview = {
  termKey: string; totals: Totals; types: Array<Totals & { studentType: StudentType }>; classes: Array<Totals & { className: string }>;
  collectedToday: number; recentPayments: Payment[];
};
export type Structure = { className: string; studentType: StudentType; items: FeeItem[]; total: number; updatedAt: string };
