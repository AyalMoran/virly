import { useState } from "react";
import { motion } from "framer-motion";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CreditCard,
  Headphones,
  LayoutDashboard,
  LogOut,
  Settings,
  Send,
  Video
} from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { formatCurrency } from "../lib/format";
import { hasAuthTransition } from "../lib/route-transition";
import { getDisplayName, getUserAvatarUrl } from "../lib/user-avatar";
import { AnimatedText } from "./ui/animated-text";
import { FloatingChatWidget } from "./ui/floating-chat-widget-shadcnui";
import { UserProfileSidebar } from "./ui/menu";

const SIDEBAR_COLLAPSED_KEY = "virly-sidebar-collapsed";

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

type ShellNavItem = {
  to: string;
  label: string;
  icon: JSX.Element;
  isSeparator?: boolean;
  pinToBottom?: boolean;
};

const baseNavItems: ShellNavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
  { to: "/transfer", label: "Transfer", icon: <Send /> },
  { to: "/transactions", label: "Transactions", icon: <CreditCard /> },
  { to: "/video", label: "Video", icon: <Video /> },
  { to: "/settings", label: "Settings", icon: <Settings />, pinToBottom: true }
];

function canUseAgentVideo(role?: string) {
  return (
    role === "support_agent" ||
    role === "sales_agent" ||
    role === "support_manager" ||
    role === "admin"
  );
}

export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const displayName = getDisplayName(auth.user?.email);
  const enteredFromAuth = hasAuthTransition(location.state);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readSidebarCollapsed);

  function toggleSidebar() {
    setIsSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Preference simply won't persist when storage is unavailable.
      }
      return next;
    });
  }
  const navItems: ShellNavItem[] = canUseAgentVideo(auth.user?.role)
    ? [
        ...baseNavItems,
        {
          to: "/agent/video-sessions",
          label: "Queue",
          icon: <Headphones />,
          isSeparator: true
        }
      ]
    : baseNavItems;

  async function handleLogout() {
    await auth.logout();
    navigate("/login", { replace: true });
  }

  return (
    <motion.div
      className={isSidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}
      initial={enteredFromAuth ? { opacity: 0, scale: 0.985 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.aside
        className="sidebar"
        aria-label="Primary"
        initial={enteredFromAuth ? { opacity: 0, x: -28 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
      >
        <UserProfileSidebar
          user={{
            name: displayName,
            email: auth.user?.email ?? "",
            avatarUrl: getUserAvatarUrl(displayName)
          }}
          navItems={navItems.map((item) => ({
            href: item.to,
            label: item.label,
            icon: item.icon,
            isSeparator: item.isSeparator,
            pinToBottom: item.pinToBottom
          }))}
          logoutItem={{
            label: "Log out",
            icon: <LogOut />,
            onClick: handleLogout
          }}
          collapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
      </motion.aside>

      <motion.div
        className="shell-main"
        initial={enteredFromAuth ? { opacity: 0, y: 28 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      >
        <motion.header
          className="topbar"
          initial={enteredFromAuth ? { opacity: 0, y: -16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
        >
          <Link
            to="/dashboard"
            className="topbar-wordmark"
            aria-label="Virly home"
          >
            <AnimatedText
              text="Virly"
              as="span"
              duration={0.07}
              delay={0.08}
              textClassName="topbar-wordmark-text"
              underlineClassName="topbar-wordmark-underline"
            />
          </Link>
          <div className="topbar-actions">
            <div className="topbar-user">
              <div className="topbar-user-meta">
                <span className="topbar-user-name">{displayName}</span>
                <span className="topbar-user-balance">
                  <span className="sr-only">Current balance: </span>
                  {formatCurrency(auth.user?.balance ?? 0)}
                </span>
              </div>
              <div className="avatar" aria-hidden="true">
                {auth.user?.email.slice(0, 2).toUpperCase()}
              </div>
            </div>
          </div>
        </motion.header>
        <main className="page-frame">
          <Outlet />
        </main>
      </motion.div>

      <nav className="mobile-nav" aria-label="Primary mobile">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className="mobile-nav-item">
            <span className="icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <FloatingChatWidget />
    </motion.div>
  );
}
