import * as React from "react";
import { motion, type Variants } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";

interface NavItem {
  icon: React.ReactNode;
  label: string;
  href: string;
  isSeparator?: boolean;
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
  className?: string;
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
>(({ user, navItems, logoutItem, className }, ref) => {
  return (
    <motion.aside
      ref={ref}
      className={cn("profile-sidebar", className)}
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
          <small>{user.email}</small>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="profile-sidebar-divider" />

      <nav className="profile-sidebar-nav" role="navigation">
        {navItems.map((item) => (
          <React.Fragment key={item.href}>
            {item.isSeparator ? (
              <motion.div variants={itemVariants} className="profile-sidebar-gap" />
            ) : null}
            <motion.div variants={itemVariants}>
              <NavLink to={item.href} className="profile-sidebar-link">
                <span className="profile-sidebar-icon">{item.icon}</span>
                <span>{item.label}</span>
                <ChevronRight className="profile-sidebar-chevron" aria-hidden="true" />
              </NavLink>
            </motion.div>
          </React.Fragment>
        ))}
      </nav>

      <motion.div variants={itemVariants} className="profile-sidebar-footer">
        <button
          type="button"
          onClick={logoutItem.onClick}
          className="profile-sidebar-logout"
        >
          <span className="profile-sidebar-icon">{logoutItem.icon}</span>
          <span>{logoutItem.label}</span>
        </button>
      </motion.div>
    </motion.aside>
  );
});

UserProfileSidebar.displayName = "UserProfileSidebar";
