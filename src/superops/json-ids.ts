/**
 * SuperOps JSON scalars sometimes serialize GraphQL IDs as unquoted JSON numbers.
 * JavaScript JSON.parse cannot represent integers above Number.MAX_SAFE_INTEGER
 * (2^53-1). String(parsedNumber) cannot recover the original digits.
 *
 * Quote only complete JSON integer tokens above Number.MAX_SAFE_INTEGER before parse.
 * Smaller integers, floats, exponents, strings, and pagination/health numbers
 * are left unchanged.
 */

const MAX_SAFE_INTEGER_DIGITS = "9007199254740991";

function shouldQuoteIntegerDigits(digits: string): boolean {
  if (digits.length < MAX_SAFE_INTEGER_DIGITS.length) return false;
  if (digits.length > MAX_SAFE_INTEGER_DIGITS.length) return true;
  return digits > MAX_SAFE_INTEGER_DIGITS;
}

export function quoteUnsafeJsonIntegers(text: string): string {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      const copied = copyJsonString(text, index);
      out += copied.token;
      index = copied.next;
      continue;
    }
    if (char === "-" || (char >= "0" && char <= "9")) {
      const copied = copyJsonNumber(text, index);
      out += copied.token;
      index = copied.next;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

export function parseSuperOpsJson(text: string): unknown {
  return JSON.parse(quoteUnsafeJsonIntegers(text)) as unknown;
}

function copyJsonString(text: string, start: number): { token: string; next: number } {
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === '"') {
      return { token: text.slice(start, index + 1), next: index + 1 };
    }
    index += 1;
  }
  return { token: text.slice(start), next: text.length };
}

function copyJsonNumber(text: string, start: number): { token: string; next: number } {
  let index = start;
  if (text[index] === "-") index += 1;
  while (index < text.length && text[index] >= "0" && text[index] <= "9") index += 1;
  const intEnd = index;
  const next = text[index];
  if (next === "." || next === "e" || next === "E") {
    if (next === ".") {
      index += 1;
      while (index < text.length && text[index] >= "0" && text[index] <= "9") index += 1;
    }
    if (text[index] === "e" || text[index] === "E") {
      index += 1;
      if (text[index] === "+" || text[index] === "-") index += 1;
      while (index < text.length && text[index] >= "0" && text[index] <= "9") index += 1;
    }
    return { token: text.slice(start, index), next: index };
  }
  const integer = text.slice(start, intEnd);
  const digits = integer.startsWith("-") ? integer.slice(1) : integer;
  const token = shouldQuoteIntegerDigits(digits) ? `"${integer}"` : integer;
  return { token, next: intEnd };
}
