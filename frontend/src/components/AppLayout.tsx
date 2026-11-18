import { Suspense, useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { AdminApp } from "../adminEntry";
import { useAuth } from "../auth/context";
import { Button } from "./ui";
import { Icon } from "./Icon";
import styles from "./AppLayout.module.css";
import { ServiceIndicator, ServiceNotice } from "./ServiceStatus";

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
            <Icon name="school" size={24} />
          </span>
          <span className="brand-label">
            <span>Kho Tài Liệu Học Tập</span>
            <small>Điện toán đám mây INT3319</small>
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
          <div className="nav-links">
            <NavLink to="/" end>
              Khám phá
            </NavLink>
            {user && <NavLink to="/me/documents">Tài liệu của tôi</NavLink>}
            {user && <NavLink to="/upload">Tải lên</NavLink>}
            {AdminApp && <NavLink to="/admin">Quản trị</NavLink>}
          </div>
          <div className="nav-account">
            {status === "loading" ? (
              <span className="header-skeleton" aria-label="Đang khôi phục phiên" />
            ) : user ? (
              <>
                <span className="user-name">
                  <span>{user.displayName}</span>
                  <span className="avatar" aria-hidden="true"><Icon name="user" size={18} /></span>
                </span>
                <Button requiresBackend variant="ghost" loading={loggingOut} onClick={signOut} title="Đăng xuất">
                  <Icon name="logout" size={20} />
                  <span className="nav-account__label">Đăng xuất</span>
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
          </div>
        </nav>
        <div className={styles.headerActions}>
          <ServiceIndicator />
          <button
            type="button"
            className="menu-toggle button button--secondary"
            aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <Icon name="menu" />
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
      <div className={styles.footerInner}>
        <span className={styles.footerBrand}><Icon name="cloud" size={20} /> Kho Tài Liệu Học Tập · INT3319 Điện toán đám mây</span>
        <span>© 2026 Nhóm BTL INT3319 · Trường Đại học Công nghệ – ĐHQGHN</span>
      </div>
    </footer>
  );
}

export function AppLayout() {
  return (
    <>
      <SkipLink />
      <AppHeader />
      <main id="main-content" className={`container ${styles.main}`}>
        <ServiceNotice />
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>
      <AppFooter />
    </>
  );
}
