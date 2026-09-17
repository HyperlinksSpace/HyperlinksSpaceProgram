import assert from "node:assert/strict";
import { isPlausibleE164Phone, normalizePhoneNumber } from "../normalizePhoneNumber.js";

function check(input: string, expected: string, defaultCountry?: Parameters<typeof normalizePhoneNumber>[1]): void {
  assert.equal(
    normalizePhoneNumber(input, defaultCountry),
    expected,
    `normalize(${JSON.stringify(input)}${defaultCountry ? `, ${defaultCountry}` : ""})`,
  );
}

// Estonia
check("+372 5123 4567", "+37251234567");
check("37251234567", "+37251234567");
check("00372 5123 4567", "+37251234567");
check("00 372-5123-4567", "+37251234567");
check("+0037251234567", "+37251234567");

// Russia / Kazakhstan domestic 8…
check("+7 (916) 123-45-67", "+79161234567");
check("89161234567", "+79161234567");
check("8 916 123 45 67", "+79161234567");

// US / Canada (NANP) — with +1 or 011 exit code
check("+1 (415) 555-2671", "+14155552671");
check("14155552671", "+14155552671");
check("011 44 20 7946 0958", "+442079460958");

// UK
check("+44 20 7946 0958", "+442079460958");
check("0044 20 7946 0958", "+442079460958");

// Germany
check("+49 30 123456", "+4930123456");
check("0049 30 123456", "+4930123456");

// France
check("+33 6 12 34 56 78", "+33612345678");
check("0033 6 12 34 56 78", "+33612345678");

// India
check("+91 98765 43210", "+919876543210");
check("0091 98765 43210", "+919876543210");

// Brazil
check("+55 11 91234-5678", "+5511912345678");
check("0055 11 91234 5678", "+5511912345678");

// China
check("+86 138 0013 8000", "+8613800138000");
check("0086 138 0013 8000", "+8613800138000");

// Japan
check("+81 90 1234 5678", "+819012345678");
check("0081 90 1234 5678", "+819012345678");

// Australia
check("+61 412 345 678", "+61412345678");
check("0061 412 345 678", "+61412345678");

// UAE
check("+971 50 123 4567", "+971501234567");
check("00971 50 123 4567", "+971501234567");

// Empty / garbage / bare national without country code
check("", "");
check("+++", "");
check("000", "");
check("4155552671", ""); // US without +1 — reject rather than invent a country
check("51234567", ""); // EE mobile without +372

assert.equal(isPlausibleE164Phone("+37251234567"), true);
assert.equal(isPlausibleE164Phone("+79161234567"), true);
assert.equal(isPlausibleE164Phone("+14155552671"), true);
assert.equal(isPlausibleE164Phone("+00372"), false);
assert.equal(isPlausibleE164Phone("37251234567"), false);
assert.equal(isPlausibleE164Phone("+0"), false);

console.log("normalizePhoneNumber tests ok");
