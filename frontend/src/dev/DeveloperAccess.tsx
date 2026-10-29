import { useEffect, useState } from "react";
import { developerSession, developerSessionExpired, type DeveloperSession } from "../api/localBackend";
import { Button, PasswordField, TextField } from "../components/ui";
import LocalControls from "./LocalControls";
import styles from "./LocalControls.module.css";

export default function DeveloperAccess() {
  const [session, setSession] = useState<DeveloperSession>({ user: null });
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void developerSession().then((next) => { if (active) setSession(next); })
      .catch(() => { if (active) setError("Không kết nối được controller. Khởi động bằng Start.vbs hoặc run.bat start rồi thử đăng nhập lại."); })
      .finally(() => { if (active) setChecking(false); });
    const expired = () => {
      setSession({ user: null });
      setPassword("");
      setError("Phiên nhà phát triển đã hết hạn. Vui lòng đăng nhập lại.");
    };
    window.addEventListener(developerSessionExpired, expired);
    return () => { active = false; window.removeEventListener(developerSessionExpired, expired); };
  }, []);
  const authenticate = async (action: "login" | "logout") => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setSession(await developerSession(action, action === "login" ? { username, password } : undefined));
      if (action === "logout") localStorage.removeItem("developer-mode");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Không thể đăng nhập nhà phát triển.");
    } finally { setPassword(""); setBusy(false); }
  };
  if (checking) return null;
  return <>
    <section className={`container ${styles.controls}`} aria-label="Truy cập nhà phát triển">
      {session.user ? <div className={styles.bar}>
        <span>Nhà phát triển: <strong>{session.user.username}</strong></span>
        <Button variant="ghost" loading={busy} requiresBackend={false} onClick={() => { void authenticate("logout"); }}>Đăng xuất nhà phát triển</Button>
        {error && <p role="alert">{error}</p>}
      </div> : <details className={styles.panel}>
        <summary>Đăng nhập nhà phát triển</summary>
        <form className={styles.login} onSubmit={(event) => { event.preventDefault(); void authenticate("login"); }}>
          <p>Dùng tài khoản được người quản lý dự án cấp để mở công cụ phát triển.</p>
          <TextField label="Tài khoản nhà phát triển" name="developer-username" autoComplete="username" required maxLength={80}
            value={username} disabled={busy} onChange={(event) => setUsername(event.target.value)} />
          <PasswordField label="Mật khẩu nhà phát triển" name="developer-password" autoComplete="current-password" required maxLength={128}
            value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />
          {error && <p role="alert">{error}</p>}
          {session.configured === false && <p>Chưa được cấp tài khoản nhà phát triển. Hãy liên hệ người quản lý dự án.</p>}
          <Button type="submit" requiresBackend={false} loading={busy}>Mở công cụ phát triển</Button>
        </form>
      </details>}
    </section>
    {session.user && <LocalControls />}
  </>;
}
