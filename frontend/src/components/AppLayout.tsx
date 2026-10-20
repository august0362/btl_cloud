import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useAuth } from "../auth/context";
import { APP_NAME } from "../lib/constants";
import { Button } from "./ui";
import styles from "./AppLayout.module.css";

export function AppHeader() {
  const { user, status, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const signOut = async () => {
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    setMenuOpen(false);
  };
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className="brand" to="/">
          {APP_NAME}
        </Link>
        <button
          type="button"
          className="menu-toggle button button--secondary"
          aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen((value) => !value)}
        >
          ☰
        </button>
        <nav
          id="main-navigation"
          className={menuOpen ? "navigation navigation--open" : "navigation"}
          aria-label="Điều hướng chính"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setMenuOpen(false);
          }}
        >
          <NavLink to="/" end>
            Khám phá
          </NavLink>
          {status === "loading" ? (
            <span
              className="header-skeleton"
              aria-label="Đang khôi phục phiên"
            />
          ) : user ? (
            <>
              <NavLink to="/me/documents">Tài liệu của tôi</NavLink>
              <NavLink className="button button--primary" to="/upload">
                Tải lên
              </NavLink>
              <span className="user-name">{user.displayName}</span>
              <Button variant="ghost" loading={loggingOut} onClick={signOut}>
                Đăng xuất
              </Button>
            </>
          ) : (
            <>
              <NavLink to="/login">Đăng nhập</NavLink>
              <NavLink className="button button--primary" to="/register">
                Đăng ký
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SkipLink() {
  return (
    <a className="skip-link" href="#main-content">
      Bỏ qua tới nội dung chính
    </a>
  );
}

export function AppFooter() {
  return (
    <footer className={styles.footer}>
      © 2026 Nhóm BTL INT3319 · Trường Đại học Công nghệ – ĐHQGHN
    </footer>
  );
}

export function AppLayout() {
  return (
    <>
      <SkipLink />
      <AppHeader />
      <main id="main-content" className={`container ${styles.main}`}>
        <Outlet />
      </main>
      <AppFooter />
    </>
  );
}
