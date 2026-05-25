import { motion } from "framer-motion";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
  Send
} from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { hasAuthTransition } from "../lib/route-transition";
import { getDisplayName, getUserAvatarUrl } from "../lib/user-avatar";
import { AnimatedText } from "./ui/animated-text";
import { FloatingChatWidget } from "./ui/floating-chat-widget-shadcnui";
import { UserProfileSidebar } from "./ui/menu";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
  { to: "/transfer", label: "Send money", icon: <Send /> },
  { to: "/transactions", label: "Transactions", icon: <CreditCard /> },
  { to: "/settings", label: "Settings", icon: <Settings />, isSeparator: true }
];

export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const displayName = getDisplayName(auth.user?.email);
  const enteredFromAuth = hasAuthTransition(location.state);

  async function handleLogout() {
    await auth.logout();
    navigate("/login", { replace: true });
  }

  return (
    <motion.div
      className="app-shell"
      initial={enteredFromAuth ? { opacity: 0, scale: 0.985 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.aside
        className="sidebar"
        aria-label="Primary"
        initial={enteredFromAuth ? { opacity: 0, x: -28 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1.35, ease: [0.16, 1, 0.3, 1], delay: 0.14 }}
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
            isSeparator: item.isSeparator
          }))}
          logoutItem={{
            label: "Log out",
            icon: <LogOut />,
            onClick: handleLogout
          }}
        />
      </motion.aside>

      <motion.div
        className="shell-main"
        initial={enteredFromAuth ? { opacity: 0, y: 28 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.45, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
      >
        <motion.header
          className="topbar"
          initial={enteredFromAuth ? { opacity: 0, y: -16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1], delay: 0.34 }}
        >
          <AnimatedText
            text="Virly"
            as="span"
            duration={0.07}
            delay={0.08}
            className="topbar-wordmark"
            textClassName="topbar-wordmark-text"
            underlineClassName="topbar-wordmark-underline"
          />
          <div className="topbar-actions">
            <div className="avatar" aria-label="Current account">
              {auth.user?.email.slice(0, 2).toUpperCase()}
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
