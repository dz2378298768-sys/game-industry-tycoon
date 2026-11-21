/**
 * Money 值对象
 * 所有金额均以整数"分"为单位（1 美元 = 100 分）。
 * 不可变。
 */
export class Money {
  public readonly amount: number // 整数分
  public readonly currency = 'USD' as const

  constructor(cents: number) {
    if (!Number.isInteger(cents)) {
      throw new Error('Money amount must be integer cents')
    }
    this.amount = cents
  }

  static fromDollars(d: number): Money {
    return new Money(Math.round(d * 100))
  }

  static zero(): Money {
    return new Money(0)
  }

  static add(a: Money, b: Money): Money {
    return new Money(a.amount + b.amount)
  }

  static subtract(a: Money, b: Money): Money {
    return new Money(a.amount - b.amount)
  }

  static multiply(m: Money, factor: number): Money {
    return new Money(Math.round(m.amount * factor))
  }

  static divide(m: Money, divisor: number): Money {
    return new Money(Math.trunc(m.amount / divisor))
  }

  toDollars(): number {
    return this.amount / 100
  }

  equals(other: Money): boolean {
    return this.amount === other.amount
  }

  isNegative(): boolean {
    return this.amount < 0
  }

  isZero(): boolean {
    return this.amount === 0
  }

  format(): string {
    return '$' + (this.amount / 100).toFixed(2)
  }
}
