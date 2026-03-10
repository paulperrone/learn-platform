/**
 * Math utilities shared across generators.
 */
import type { SeededRng } from "./types.js";

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

export function simplifyFraction(n: number, d: number): [number, number] {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(Math.abs(n), d);
  return [n / g, d / g];
}

export function fractionToString(n: number, d: number): string {
  const [sn, sd] = simplifyFraction(n, d);
  if (sd === 1) return `${sn}`;
  return `${sn}/${sd}`;
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

export function primeFactors(n: number): number[] {
  const factors: number[] = [];
  let d = 2;
  while (d * d <= n) {
    while (n % d === 0) {
      factors.push(d);
      n /= d;
    }
    d++;
  }
  if (n > 1) factors.push(n);
  return factors;
}

export function allFactors(n: number): number[] {
  const factors: number[] = [];
  for (let i = 1; i <= Math.sqrt(n); i++) {
    if (n % i === 0) {
      factors.push(i);
      if (i !== n / i) factors.push(n / i);
    }
  }
  return factors.sort((a, b) => a - b);
}

/** Generate a random fraction with denominator in range, ensuring it's not simplifiable to a whole number */
export function randomFraction(rng: SeededRng, maxDenom: number, minNum = 1, maxNum?: number): [number, number] {
  const d = rng.int(2, maxDenom);
  const nMax = maxNum ?? d - 1;
  const n = rng.int(minNum, Math.max(minNum, nMax));
  return [n, d];
}

/** Generate a proper fraction (numerator < denominator) */
export function randomProperFraction(rng: SeededRng, maxDenom: number): [number, number] {
  const d = rng.int(2, maxDenom);
  const n = rng.int(1, d - 1);
  return [n, d];
}

/** Round to N decimal places */
export function roundTo(n: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(n * factor) / factor;
}
