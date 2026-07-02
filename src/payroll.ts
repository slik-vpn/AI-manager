import type { PayrollEntry, Shift, User } from '@prisma/client';
import { EventLevel, EventType, ShiftStatus } from './domain.js';
import { prisma } from './db.js';

export const PAYROLL_BASE_AMOUNT = 2000;
export const PAYROLL_BONUS_RATE = 0.10;
export const PAYROLL_STATUS_PENDING = 'PENDING';
export const PAYROLL_STATUS_PAID = 'PAID';

export function parseSetSalesCommand(text: string): { shiftId: number; amount: number } | null {
  const [, rawShiftId, rawAmount] = text.trim().split(/\s+/);
  const shiftId = Number(rawShiftId);
  const amount = Number(rawAmount?.replace(',', '.'));
  if (!Number.isInteger(shiftId) || shiftId <= 0 || !Number.isFinite(amount) || amount < 0) return null;
  return { shiftId, amount };
}

export function parseMarkPaidCommand(text: string): { telegramId: bigint; amount: number } | null {
  const [, rawTelegramId, rawAmount] = text.trim().split(/\s+/);
  const amount = Number(rawAmount?.replace(',', '.'));
  if (!rawTelegramId || !/^\d+$/.test(rawTelegramId) || !Number.isFinite(amount) || amount <= 0) return null;
  return { telegramId: BigInt(rawTelegramId), amount };
}

export function calculatePayrollAmounts(salesAmount: number): { baseAmount: number; salesAmount: number; bonusAmount: number; totalAmount: number } {
  const normalizedSales = roundMoney(salesAmount);
  const bonusAmount = roundMoney(normalizedSales * PAYROLL_BONUS_RATE);
  return {
    baseAmount: PAYROLL_BASE_AMOUNT,
    salesAmount: normalizedSales,
    bonusAmount,
    totalAmount: roundMoney(PAYROLL_BASE_AMOUNT + bonusAmount),
  };
}

export async function syncPayrollEntries(userId?: number): Promise<PayrollEntry[]> {
  const shifts = await prisma.shift.findMany({
    where: {
      status: ShiftStatus.CLOSED,
      assignedUserId: userId ? userId : { not: null },
    },
    orderBy: [{ startsAt: 'asc' }],
  });

  const entries: PayrollEntry[] = [];
  for (const shift of shifts) {
    if (!shift.assignedUserId) continue;
    entries.push(await upsertPayrollEntryForShift(shift));
  }
  return entries;
}

export async function upsertPayrollEntryForShift(shift: Shift): Promise<PayrollEntry> {
  if (shift.status !== ShiftStatus.CLOSED || !shift.assignedUserId) {
    throw new Error('Payroll can be created only for assigned CLOSED shifts.');
  }
  const amounts = calculatePayrollAmounts(shift.salesAmount);
  const existing = await prisma.payrollEntry.findUnique({ where: { shiftId: shift.id } });
  const entry = await prisma.payrollEntry.upsert({
    where: { shiftId: shift.id },
    create: {
      userId: shift.assignedUserId,
      shiftId: shift.id,
      ...amounts,
      status: PAYROLL_STATUS_PENDING,
    },
    update: existing?.status === PAYROLL_STATUS_PAID ? {} : { userId: shift.assignedUserId, ...amounts },
  });

  if (!existing) {
    await prisma.eventLog.create({
      data: {
        type: EventType.PAYROLL_CREATED,
        level: EventLevel.FINANCE,
        message: `Payroll entry ${entry.id} created for shift ${shift.id}`,
        userId: shift.assignedUserId,
        metadata: JSON.stringify({ payrollEntryId: entry.id, shiftId: shift.id, totalAmount: entry.totalAmount }),
      },
    });
  }

  return entry;
}

export async function markPayment(input: { user: User; amount: number; actorId: number }): Promise<{ paymentId: number; paidEntryIds: number[] }> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        userId: input.user.id,
        amount: roundMoney(input.amount),
        comment: `Marked paid by user ${input.actorId}`,
      },
    });

    let remaining = payment.amount;
    const paidEntryIds: number[] = [];
    const entries = await tx.payrollEntry.findMany({
      where: { userId: input.user.id, status: PAYROLL_STATUS_PENDING },
      orderBy: [{ createdAt: 'asc' }],
    });

    for (const entry of entries) {
      if (remaining + 0.000001 < entry.totalAmount) break;
      remaining = roundMoney(remaining - entry.totalAmount);
      const updated = await tx.payrollEntry.update({ where: { id: entry.id }, data: { status: PAYROLL_STATUS_PAID } });
      paidEntryIds.push(updated.id);
    }

    await tx.eventLog.create({
      data: {
        type: EventType.PAYMENT_MARKED,
        level: EventLevel.FINANCE,
        message: `Payment ${payment.id} marked for user ${input.user.id}`,
        userId: input.actorId,
        metadata: JSON.stringify({ paymentId: payment.id, targetUserId: input.user.id, amount: payment.amount, paidEntryIds }),
      },
    });

    return { paymentId: payment.id, paidEntryIds };
  });
}

export function formatPayrollEntry(entry: PayrollEntry & { user?: User | null }): string {
  const user = entry.user ? `${entry.user.telegramId.toString()} — ${entry.user.username ? `@${entry.user.username}` : entry.user.firstName ?? 'без имени'}` : `userId ${entry.userId}`;
  return [
    `#${entry.id} смена #${entry.shiftId}`,
    `Сотрудник: ${user}`,
    `База: ${formatMoney(entry.baseAmount)}`,
    `Продажи: ${formatMoney(entry.salesAmount)}`,
    `Бонус 10%: ${formatMoney(entry.bonusAmount)}`,
    `Итого: ${formatMoney(entry.totalAmount)}`,
    `Статус: ${entry.status}`,
  ].join(' | ');
}

export function formatMoney(amount: number): string {
  return `${roundMoney(amount).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
