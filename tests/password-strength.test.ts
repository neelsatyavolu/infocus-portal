import { describe, expect, it } from "vitest";
import { generateStrongPassword, scorePassword } from "@/src/lib/password-strength";

describe("scorePassword", () => {
  it("returns null for an empty password", () => {
    expect(scorePassword("")).toBeNull();
  });

  it("rates common and patterned passwords very weak", () => {
    for (const weak of ["password", "Password1!", "123456789", "qwertyuiop", "aaaaaaaaaaaa", "infocus2026"]) {
      expect(scorePassword(weak)?.score, weak).toBeLessThanOrEqual(1);
    }
  });

  it("rates short mixed passwords as fair at best", () => {
    expect(scorePassword("Tb7#kq")?.score).toBeLessThanOrEqual(2);
  });

  it("rates long random passwords strong", () => {
    expect(scorePassword("v9#Kq2!mZt7@Lp4$Wx8e")?.score).toBe(4);
    expect(scorePassword("correct-horse-battery-staple-lamp")?.score).toBeGreaterThanOrEqual(3);
  });

  it("labels every score", () => {
    expect(scorePassword("x")?.label).toBe("Very weak");
    expect(scorePassword("v9#Kq2!mZt7@Lp4$Wx8e")?.label).toBe("Strong");
  });
});

describe("generateStrongPassword", () => {
  it("makes a 20-character password with every character class", () => {
    for (let run = 0; run < 50; run += 1) {
      const password = generateStrongPassword();
      expect(password).toHaveLength(20);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
      expect(password).not.toMatch(/[0O1lI|`'"\s]/);
      expect(scorePassword(password)?.score).toBe(4);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateStrongPassword()));
    expect(seen.size).toBe(200);
  });
});
