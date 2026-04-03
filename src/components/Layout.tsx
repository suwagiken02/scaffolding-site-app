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
              alt="????"
              className={styles.brandLogoImg}
              width={512}
              height={512}
              decoding="async"
            />
          </Link>
          <nav className={styles.nav} aria-label="„?°„?§„?≥„??„??„?≤„?º„?∑„?ß„?≥">
            <Link to="/" className={styles.navLink}>
              ÁèæÂ†¥
            </Link>
            <Link to="/staff" className={styles.navLink}>
              Á§æÂ?°„??„?§„??„ÅE„?∏
            </Link>
            <Link to="/contractor/view" className={styles.navLink}>
              Âç?Â??Ê•≠Ë?ÅEÅE„?§„??„ÅE„?∏
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
                ÁÆ°ÁêÅE
                <span className={styles.navDropdownChevron} aria-hidden>
                  {adminOpen ? "‚?≤" : "‚?º"}
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
                      KOUSEIÁÆ°ÁêÅE
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/leave-requests"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      ‰º?Ê??Á?≥Ë´ÅE
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/attendance"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      „?ø„?§„?†„?´„?º„?ÅE
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/payslips"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      Áµ¶‰∏?ÊÅEÁ¥∞
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/roster"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      ÂêçÁ∞øÁÆ°ÁêÅE
                    </Link>
                  </li>
                  <li role="none">
                    <Link
                      to="/master"
                      className={styles.navDropdownItem}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                    >
                      „??„?π„?ø„?ºË®≠ÂÆÅE
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
