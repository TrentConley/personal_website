function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a === 0n ? 1n : a;
}

export class Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;

  constructor(numerator: bigint, denominator = 1n) {
    if (denominator === 0n) throw new Error("A fraction cannot have a zero denominator.");
    const sign = denominator < 0n ? -1n : 1n;
    const divisor = gcd(numerator, denominator);
    this.numerator = (numerator / divisor) * sign;
    this.denominator = (denominator / divisor) * sign;
  }

  static from(value: number): Fraction {
    if (!Number.isFinite(value)) throw new Error(`Cannot convert ${value} to a fraction.`);
    const source = value.toString().toLowerCase();
    const [coefficient, exponentText] = source.split("e");
    const exponent = Number(exponentText ?? 0);
    const [whole, decimals = ""] = coefficient.split(".");
    const digits = BigInt(`${whole}${decimals}`);
    const decimalScale = 10n ** BigInt(decimals.length);
    if (exponent >= 0) return new Fraction(digits * 10n ** BigInt(exponent), decimalScale);
    return new Fraction(digits, decimalScale * 10n ** BigInt(-exponent));
  }

  add(other: Fraction): Fraction {
    return new Fraction(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  multiply(other: Fraction): Fraction {
    return new Fraction(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  divide(other: Fraction): Fraction {
    return new Fraction(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  toNumber(): number {
    return Number(this.numerator) / Number(this.denominator);
  }
}
