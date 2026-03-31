import { Link, Outlet } from "react-router-dom";
import styles from "./Layout.module.css";

export function Layout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand}>
            <span className={styles.brandLogo} aria-label="諏訪技建 現場管理">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 680 680"
                role="img"
                aria-hidden="true"
                className={styles.brandLogoSvg}
              >
                <rect
                  x="0"
                  y="0"
                  width="680"
                  height="680"
                  rx="90"
                  ry="90"
                  fill="#1a1a1a"
                />
                <rect
                  x="120"
                  y="120"
                  width="440"
                  height="440"
                  rx="26"
                  ry="26"
                  fill="none"
                  stroke="#FF6B35"
                  strokeWidth="28"
                />
                <line
                  x1="150"
                  y1="340"
                  x2="530"
                  y2="340"
                  stroke="#FF6B35"
                  strokeWidth="22"
                  strokeLinecap="round"
                />
                <rect
                  x="170"
                  y="390"
                  width="340"
                  height="62"
                  rx="18"
                  ry="18"
                  fill="#FF8C55"
                />
                <text
                  x="340"
                  y="305"
                  textAnchor="middle"
                  fontSize="92"
                  fill="#FF6B35"
                  letterSpacing="6"
                  className={styles.brandLogoText}
                >
                  諏訪
                </text>
                <text
                  x="340"
                  y="520"
                  textAnchor="middle"
                  fontSize="92"
                  fill="#FF6B35"
                  letterSpacing="6"
                  className={styles.brandLogoText}
                >
                  技建
                </text>
              </svg>
            </span>
          </Link>
          <nav className={styles.nav}>
            <Link to="/" className={styles.navLink}>
              現場一覧
            </Link>
            <Link to="/labor" className={styles.navLink}>
              稼働管理
            </Link>
            <Link to="/contractor" className={styles.navLink}>
              請負管理
            </Link>
            <Link to="/kousei-admin" className={styles.navLink}>
              KOUSEI管理
            </Link>
            <Link to="/attendance" className={styles.navLink}>
              打刻
            </Link>
            <Link to="/settings/masters" className={styles.navLink}>
              マスター設定
            </Link>
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
