import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { SignInCard2 } from "../sign-in-card-2.js";

const baseProps = {
  email: "",
  password: "",
  isLoading: false,
  onEmailChange: () => {},
  onPasswordChange: () => {},
  onSubmit: () => {},
};

function render(props: Partial<typeof baseProps> & Record<string, unknown> = {}) {
  const mergedProps = { ...baseProps, ...props };
  return renderToStaticMarkup(
    <MemoryRouter>
      <SignInCard2 {...mergedProps} />
    </MemoryRouter>
  );
}

describe("SignInCard2", () => {
  describe("default rendering", () => {
    it("renders the default title 'Welcome Back'", () => {
      const html = render();
      expect(html).toContain("Welcome Back");
    });

    it("renders the default submit label 'Sign In'", () => {
      const html = render();
      expect(html).toContain("Sign In");
    });

    it("renders the default footer label 'Create account'", () => {
      const html = render();
      expect(html).toContain("Create account");
    });

    it("renders the email input", () => {
      const html = render();
      expect(html).toContain('id="login-email"');
      expect(html).toContain('type="email"');
    });

    it("renders the password input as type password by default", () => {
      const html = render();
      expect(html).toContain('id="login-password"');
      expect(html).toContain('type="password"');
    });
  });

  describe("custom props", () => {
    it("renders a custom title", () => {
      const html = render({ title: "Create Account" });
      expect(html).toContain("Create Account");
    });

    it("renders a custom submitLabel", () => {
      const html = render({ submitLabel: "Register" });
      expect(html).toContain("Register");
    });

    it("renders a custom footerLabel", () => {
      const html = render({ footerLabel: "Already have an account?" });
      expect(html).toContain("Already have an account?");
    });

    it("renders the footer link with custom footerTo", () => {
      const html = render({ footerTo: "/login" });
      expect(html).toContain("/login");
    });

    it("prefills the email input value", () => {
      const html = render({ email: "user@example.com" });
      expect(html).toContain('value="user@example.com"');
    });
  });

  describe("error messages", () => {
    it("renders emailError when provided", () => {
      const html = render({ emailError: "Invalid email" });
      expect(html).toContain("Invalid email");
    });

    it("renders passwordError when provided", () => {
      const html = render({ passwordError: "Too short" });
      expect(html).toContain("Too short");
    });

    it("renders formError in an alert role element", () => {
      const html = render({ formError: "Login failed" });
      expect(html).toContain("Login failed");
      expect(html).toMatch(/role="alert"/);
    });

    it("does not render formError when not provided", () => {
      const html = render();
      expect(html).not.toMatch(/role="alert"/);
    });
  });

  describe("success message", () => {
    it("renders successMessage in a status role element", () => {
      const html = render({ successMessage: "Check your email!" });
      expect(html).toContain("Check your email!");
      expect(html).toMatch(/role="status"/);
    });

    it("does not render status element when successMessage is absent", () => {
      const html = render();
      expect(html).not.toMatch(/role="status"/);
    });
  });

  describe("loading state", () => {
    it("disables the submit button when isLoading is true", () => {
      const html = render({ isLoading: true });
      expect(html).toMatch(/signin-spinner/);
      expect(html).not.toContain("Sign In");
    });

    it("renders submit label when isLoading is false", () => {
      const html = render({ isLoading: false });
      expect(html).toContain("Sign In");
      expect(html).not.toMatch(/signin-spinner/);
    });
  });

  describe("optional confirm password field", () => {
    it("does not render confirm password field when onConfirmPasswordChange is absent", () => {
      const html = render();
      expect(html).not.toContain('id="register-confirm-password"');
    });

    it("renders confirm password field when onConfirmPasswordChange is provided", () => {
      const html = render({ onConfirmPasswordChange: () => {} });
      expect(html).toContain('id="register-confirm-password"');
    });

    it("renders confirmPasswordError when provided along with handler", () => {
      const html = render({
        onConfirmPasswordChange: () => {},
        confirmPasswordError: "Passwords must match",
      });
      expect(html).toContain("Passwords must match");
    });
  });

  describe("optional phone field", () => {
    it("does not render phone field when onPhoneChange is absent", () => {
      const html = render();
      expect(html).not.toContain('id="auth-phone"');
    });

    it("renders phone field when onPhoneChange is provided", () => {
      const html = render({ onPhoneChange: () => {} });
      expect(html).toContain('id="auth-phone"');
      expect(html).toContain('type="tel"');
    });

    it("renders phoneError when provided along with handler", () => {
      const html = render({
        onPhoneChange: () => {},
        phoneError: "Invalid phone number",
      });
      expect(html).toContain("Invalid phone number");
    });
  });

  describe("remember me checkbox", () => {
    it("renders the remember me checkbox by default", () => {
      const html = render();
      expect(html).toContain("Remember me");
    });

    it("hides the remember me checkbox when showRememberMe=false", () => {
      const html = render({ showRememberMe: false });
      expect(html).not.toContain("Remember me");
    });

    it("hides the remember me checkbox when phone field is shown", () => {
      const html = render({ onPhoneChange: () => {} });
      expect(html).not.toContain("Remember me");
    });

    it("reflects checked state via rememberMe prop", () => {
      const html = render({ rememberMe: true, onRememberMeChange: () => {} });
      expect(html).toContain('checked=""');
    });
  });

  describe("aria attributes", () => {
    it("sets aria-invalid on email input when emailError is present", () => {
      const html = render({ emailError: "Bad email" });
      expect(html).toMatch(/id="login-email"[^>]*aria-invalid="true"/);
    });

    it("sets aria-invalid=false on email input when no error", () => {
      const html = render();
      expect(html).toMatch(/id="login-email"[^>]*aria-invalid="false"/);
    });
  });
});
