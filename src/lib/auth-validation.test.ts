import { describe, expect, it } from "vitest";
import {
  loginSchema,
  passwordRecoverySchema,
  passwordResetSchema,
  signupSchema,
  workspaceCreationSchema,
} from "@/lib/validation/schemas";

describe("authentication and onboarding validation", () => {
  it("validates login email and required password", () => {
    expect(
      loginSchema.safeParse({ email: "person@example.test", password: "password" })
        .success,
    ).toBe(true);
    expect(
      loginSchema.safeParse({ email: "invalid", password: "" }).success,
    ).toBe(false);
  });

  it("validates signup name, email, password, and confirmation", () => {
    const valid = {
      fullName: "Ada Lovelace",
      email: "ada@example.test",
      password: "long-password",
      confirmPassword: "long-password",
    };
    expect(signupSchema.safeParse(valid).success).toBe(true);
    expect(
      signupSchema.safeParse({ ...valid, confirmPassword: "different" }).success,
    ).toBe(false);
    expect(signupSchema.safeParse({ ...valid, password: "short" }).success).toBe(
      false,
    );
  });

  it("validates password recovery and reset confirmation", () => {
    expect(
      passwordRecoverySchema.safeParse({ email: "person@example.test" }).success,
    ).toBe(true);
    expect(passwordRecoverySchema.safeParse({ email: "bad" }).success).toBe(false);
    expect(
      passwordResetSchema.safeParse({
        password: "long-password",
        confirmPassword: "long-password",
      }).success,
    ).toBe(true);
    expect(
      passwordResetSchema.safeParse({
        password: "long-password",
        confirmPassword: "not-the-same",
      }).success,
    ).toBe(false);
  });

  it("validates workspace names within the database limit", () => {
    expect(workspaceCreationSchema.safeParse({ name: "Northstar" }).success).toBe(
      true,
    );
    expect(workspaceCreationSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(
      workspaceCreationSchema.safeParse({ name: "n".repeat(121) }).success,
    ).toBe(false);
  });
});
