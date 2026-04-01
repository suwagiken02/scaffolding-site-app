import { useEffect, useRef, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import styles from "./Layout.module.css";

export function Layout() {
  const [adminOpen, setAdminOpen] = useState(false);
  const adminRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (
        adminRef.current &&
        !adminRef.current.contains(e.target as Node)
      ) {
        setAdminOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!adminOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAdminOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adminOpen]);

  return (
    <div className={styles.shell} data-app-shell>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand}>
            <img
              src="/icon-512.png"
              alt="諏訪技建 現場管理"
              className={styles.brandLogoImg}
              width={512}
              height={512}
              decoding="async"
            />
          </Link>
          <nav className={styles.nav} aria-label="メインナビゲーション">
            <Link to="/" className={styles.navLink}>
              現場一覧
            </Link>
            <Link to="/staff" className={styles.navLink}>
              社員マイページ
            </Link>
            <Link to="/contractor" className={styles.navLink}>
              協力業者マイページ
            </Link>
            <Link to="/attendance" className={styles.navLink}>
              タイムカード
            </Link>
            <div className={styles.navDropdown} ref={adminRef}>
              <button
                type="button"
                className={styles.navDropdownBtn}
                aria-expanded={adminOpen}
                aria-haspopup="true"
                aria-controls="nav-admin-menu"
                id="nav-admin-trigger"
                onClick={() => setAdminOpen((v) => !v)}
              >
                管理
                <span className={styles.navDropdownChevron} aria-hidden>
                  {adminOpen ? "▲" : "▼"}
                </span>
              </button>
              {adminOpen && (
                <ul
                  id="nav-admin-menu"
                  className={styles.navDropdownMenu}
                  role="menu"
                  aria-labelledby="nav-admin-trigger"
                >
                  <li role="none">
                    <Link
                      to="/kousei-admin"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      KOUSEI管理
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/leave-requests"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      休暇申請
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/payslips"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      給与明細
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/roster"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      名簿管理
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/master"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      マスター設定
                    </Link>
                  </li>
                </ul>
              )}
            </div>
            <Link to="/sites/new" className={styles.navCta}>
              現場を登録
            </Link>
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
