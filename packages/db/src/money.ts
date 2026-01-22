import { Prisma } from "@prisma/client";

export type MoneyValue = Prisma.Decimal | number | string | null | undefined;

export function toDecimal(value: MoneyValue) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  return new Prisma.Decimal(value);
}

export function toDecimalFixed(value: MoneyValue, scale = 2) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    return null;
  }
  return new Prisma.Decimal(num.toFixed(scale));
}

export function add(a: MoneyValue, b: MoneyValue) {
  const left = toDecimal(a) ?? new Prisma.Decimal(0);
  const right = toDecimal(b) ?? new Prisma.Decimal(0);
  return left.add(right);
}

export function mul(a: MoneyValue, b: MoneyValue) {
  const left = toDecimal(a) ?? new Prisma.Decimal(0);
  const right = toDecimal(b) ?? new Prisma.Decimal(0);
  return left.mul(right);
}

export function formatUSD(value: MoneyValue) {
  const amount = toDecimal(value) ?? new Prisma.Decimal(0);
  return amount.toFixed(2);
}
