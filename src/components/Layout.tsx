import { Link, Outlet } from "react-router-dom";
import styles from "./Layout.module.css";

export function Layout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand}>
            足場現場管理
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
