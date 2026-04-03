import { useEffect, useRef, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import styles from "./Layout.module.css";

/** Header nav / dropdown labels (Unicode escapes keep source ASCII-safe for broken UTF-8 saves). */
const T = {
  altLogo: "\u73fe\u5834\u7ba1\u7406",
  navMain: "\u30e1\u30a4\u30f3\u30ca\u30d3\u30b2\u30fc\u30b7\u30e7\u30f3",
  site: "\u73fe\u5834",
  staffMyPage: "\u793e\u54e1\u30de\u30a4\u30da\u30fc\u30b8",
  contractorMyPage: "\u5354\u529b\u696d\u8005\u30de\u30a4\u30da\u30fc\u30b8",
  admin: "\u7ba1\u7406",
  chevronOpen: "\u25b2",
  chevronClosed: "\u25bc",
  kouseiAdmin: "KOUSEI\u7ba1\u7406",
  leaveRequests: "\u4f11\u6687\u7533\u8acb",
  timeCard: "\u30bf\u30a4\u30e0\u30ab\u30fc\u30c9",
  payslips: "\u7d66\u4e0e\u660e\u7d30",
  roster: "\u540d\u7c3f\u7ba1\u7406",
  masterSettings: "\u30de\u30b9\u30bf\u30fc\u8a2d\u5b9a",
} as const;

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
              alt={T.altLogo}
              className={styles.brandLogoImg}
              width={512}
              height={512}
              decoding="async"
            />
          </Link>
          <nav className={styles.nav} aria-label={T.navMain}>
            <Link to="/" className={styles.navLink}>
              {T.site}
            </Link>
            <Link to="/staff" className={styles.navLink}>
              {T.staffMyPage}
            </Link>
            <Link to="/contractor/view" className={styles.navLink}>
              {T.contractorMyPage}
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
                {T.admin}
                <span className={styles.navDropdownChevron} aria-hidden>
                  {adminOpen ? T.chevronOpen : T.chevronClosed}
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
                      {T.kouseiAdmin}
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/leave-requests"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      {T.leaveRequests}
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/attendance"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      {T.timeCard}
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/payslips"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      {T.payslips}
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/roster"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      {T.roster}
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/master"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      {T.masterSettings}
                    </Link>
                  </li>
                </ul>
              )}
            </div>
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
