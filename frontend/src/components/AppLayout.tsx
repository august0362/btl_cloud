import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useAuth } from "../auth/context";
import { Button } from "./ui";
import { ThemePicker } from "./ThemePicker";
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
          <span className="brand-mark" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M5 4.5h10l4 4V20H5zM15 4.5V9h4M8 12h8M8 15.5h6" />
            </svg>
          </span>
          <span className="brand-label">
            <span>Kho Tài Liệu</span> <span>Học Tập</span>
          </span>
        </Link>
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
        <div className={styles.headerActions}>
          <ThemePicker />
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
        </div>
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
