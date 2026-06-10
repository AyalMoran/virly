import * as React from "react";
import { motion, type Variants } from "framer-motion";
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";

interface NavItem {
  icon: React.ReactNode;
  label: string;
  href: string;
  isSeparator?: boolean;
  pinToBottom?: boolean;
}

interface UserProfile {
  name: string;
  email: string;
  avatarUrl: string;
}

interface UserProfileSidebarProps {
  user: UserProfile;
  navItems: NavItem[];
  logoutItem: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
  };
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

const MIN_FIT_FONT_PX = 8;

/** Shrinks the element's font-size so its single-line text fits its container. */
function useFitText(text: string) {
  const ref = React.useRef<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const fit = () => {
      element.style.fontSize = "";
      const { scrollWidth, clientWidth } = element;
      if (scrollWidth > clientWidth && clientWidth > 0) {
        const base = parseFloat(getComputedStyle(element).fontSize);
        const next = Math.max(base * (clientWidth / scrollWidth), MIN_FIT_FONT_PX);
        element.style.fontSize = `${next}px`;
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element.parentElement ?? element);
    return () => observer.disconnect();
  }, [text]);

  return ref;
}

const sidebarVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15
    }
  }
};

export const UserProfileSidebar = React.forwardRef<
  HTMLDivElement,
  UserProfileSidebarProps
>(({ user, navItems, logoutItem, collapsed = false, onToggleCollapse, className }, ref) => {
  const emailRef = useFitText(user.email);
  const mainItems = navItems.filter((item) => !item.pinToBottom);
  const bottomItems = navItems.filter((item) => item.pinToBottom);

  const renderNavItem = (item: NavItem) => (
    <React.Fragment key={item.href}>
      {item.isSeparator ? (
        <motion.div variants={itemVariants} className="profile-sidebar-gap" />
      ) : null}
      <motion.div variants={itemVariants}>
        <NavLink
          to={item.href}
          className="profile-sidebar-link"
          aria-label={item.label}
          title={collapsed ? item.label : undefined}
        >
          <span className="profile-sidebar-icon">{item.icon}</span>
          <span className="profile-sidebar-label">{item.label}</span>
          <ChevronRight className="profile-sidebar-chevron" aria-hidden="true" />
        </NavLink>
      </motion.div>
    </React.Fragment>
  );

  return (
    <motion.aside
      ref={ref}
      className={cn("profile-sidebar", collapsed && "collapsed", className)}
      initial="hidden"
      animate="visible"
      variants={sidebarVariants}
      aria-label="User profile menu"
    >
      <motion.div variants={itemVariants} className="profile-sidebar-user">
        <img
          src={user.avatarUrl}
          alt={`${user.name}'s avatar`}
          className="profile-sidebar-avatar"
        />
        <div className="profile-sidebar-identity">
          <span>{user.name}</span>
          <small ref={emailRef}>{user.email}</small>
        </div>
        {onToggleCollapse ? (
          <button
            type="button"
            className="profile-sidebar-toggle"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-controls="profile-sidebar-nav"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <PanelLeftClose aria-hidden="true" />
            )}
          </button>
        ) : null}
      </motion.div>

      <motion.div variants={itemVariants} className="profile-sidebar-divider" />

      <nav id="profile-sidebar-nav" className="profile-sidebar-nav" role="navigation">
        {mainItems.map(renderNavItem)}
        {bottomItems.length ? (
          <div className="profile-sidebar-spacer" aria-hidden="true" />
        ) : null}
        {bottomItems.map(renderNavItem)}
      </nav>

      <motion.div variants={itemVariants} className="profile-sidebar-footer">
        <button
          type="button"
          onClick={logoutItem.onClick}
          className="profile-sidebar-logout"
          aria-label={logoutItem.label}
          title={collapsed ? logoutItem.label : undefined}
        >
          <span className="profile-sidebar-icon">{logoutItem.icon}</span>
          <span className="profile-sidebar-label">{logoutItem.label}</span>
        </button>
      </motion.div>
    </motion.aside>
  );
});

UserProfileSidebar.displayName = "UserProfileSidebar";
