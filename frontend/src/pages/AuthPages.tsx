import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError } from "../api/errors";
import { useAuth } from "../auth/context";
import { Alert, Button, PasswordField, TextField } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { useToast } from "../hooks/useToast";
import { errorMessage, fieldErrors } from "../lib/errorMessages";
import { safeRedirect } from "../lib/safeRedirect";
import {
  focusFirstError,
  hasErrors,
  validateField,
  type FormErrors,
} from "../lib/validation";

function AuthForm({ registration }: { registration: boolean }) {
  usePageTitle(registration ? "Đăng ký" : "Đăng nhập");
  const { login, register } = useAuth();
  const [params] = useSearchParams();
  const { show } = useToast();
  const form = useRef<HTMLFormElement>(null);
  const locked = useRef(false);
  const [values, setValues] = useState({
    email: "",
    password: "",
    displayName: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const validate = (name: keyof typeof values, next = values) =>
    name === "confirmPassword"
      ? next.password !== next.confirmPassword
        ? "Mật khẩu nhập lại không khớp."
        : undefined
      : validateField(name, next[name], registration);
  const change = (name: keyof typeof values, value: string) => {
    const next = { ...values, [name]: value };
    setValues(next);
    if (submitted || errors[name])
      setErrors((previous) => ({
        ...previous,
        [name]: validate(name, next),
        ...(registration && name === "password"
          ? { confirmPassword: validate("confirmPassword", next) }
          : {}),
      }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    setSubmitted(true);
    const names: (keyof typeof values)[] = registration
      ? ["displayName", "email", "password", "confirmPassword"]
      : ["email", "password"];
    const nextErrors = Object.fromEntries(
      names.map((name) => [name, validate(name)]),
    );
    setErrors(nextErrors);
    setError("");
    if (hasErrors(nextErrors)) {
      focusFirstError(form.current);
      return;
    }
    locked.current = true;
    setBusy(true);
    try {
      const input = {
        email: values.email.trim().toLowerCase(),
        password: values.password,
      };
      if (registration)
        await register({ ...input, displayName: values.displayName.trim() });
      else await login(input);
      show({
        tone: "success",
        message: registration
          ? "Đăng ký thành công. Chào mừng bạn!"
          : "Đăng nhập thành công",
      });
    } catch (failure) {
      const fields = fieldErrors(failure);
      setErrors(fields);
      if (!hasErrors(fields)) setError(errorMessage(failure));
      if (
        failure instanceof ApiError &&
        failure.code === "INVALID_CREDENTIALS"
      ) {
        setValues((value) => ({ ...value, password: "" }));
        requestAnimationFrame(() =>
          form.current
            ?.querySelector<HTMLInputElement>('[name="password"]')
            ?.focus(),
        );
      } else focusFirstError(form.current);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const redirect = params.get("redirect");
  const linkQuery = redirect
    ? `?redirect=${encodeURIComponent(safeRedirect(redirect))}`
    : "";
  const field = (name: "displayName" | "email", label: string) => (
    <TextField
      label={label}
      name={name}
      value={values[name]}
      required
      type={name === "email" ? "email" : "text"}
      autoComplete={name === "email" ? "email" : "name"}
      error={errors[name]}
      onChange={(event) => change(name, event.target.value)}
      onBlur={() =>
        setErrors((previous) => ({ ...previous, [name]: validate(name) }))
      }
    />
  );
  return (
    <section className="auth-card panel">
      <h1 tabIndex={-1}>{registration ? "Tạo tài khoản" : "Đăng nhập"}</h1>
      <p className="muted">
        {registration
          ? "Lưu trữ và chia sẻ tài liệu học tập của bạn."
          : "Đăng nhập để tải xuống và quản lý tài liệu."}
      </p>
      {error && <Alert>{error}</Alert>}
      <form ref={form} noValidate onSubmit={submit}>
        <fieldset disabled={busy} className="form-fields">
          {registration && field("displayName", "Tên hiển thị")}
          {field("email", "Email")}
          <PasswordField
            name="password"
            label="Mật khẩu"
            value={values.password}
            required
            autoComplete={registration ? "new-password" : "current-password"}
            error={errors.password}
            hint={registration ? "Từ 8 đến 128 ký tự." : undefined}
            onChange={(event) => change("password", event.target.value)}
            onBlur={() =>
              setErrors((previous) => ({
                ...previous,
                password: validate("password"),
              }))
            }
          />
          {registration && (
            <PasswordField
              name="confirmPassword"
              label="Nhập lại mật khẩu"
              value={values.confirmPassword}
              required
              autoComplete="new-password"
              error={errors.confirmPassword}
              onChange={(event) =>
                change("confirmPassword", event.target.value)
              }
              onBlur={() =>
                setErrors((previous) => ({
                  ...previous,
                  confirmPassword: validate("confirmPassword"),
                }))
              }
            />
          )}
          <Button type="submit" loading={busy}>
            {busy
              ? registration
                ? "Đang tạo tài khoản…"
                : "Đang đăng nhập…"
              : registration
                ? "Tạo tài khoản"
                : "Đăng nhập"}
          </Button>
        </fieldset>
      </form>
      <p>
        {registration ? "Đã có tài khoản? " : "Chưa có tài khoản? "}
        <Link to={`${registration ? "/login" : "/register"}${linkQuery}`}>
          {registration ? "Đăng nhập" : "Đăng ký"}
        </Link>
      </p>
    </section>
  );
}
export function LoginPage() {
  return <AuthForm registration={false} />;
}
export function RegisterPage() {
  return <AuthForm registration />;
}
