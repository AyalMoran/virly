import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreditCard, LayoutDashboard, LogOut, Send, Settings } from "lucide-react";
import { UserProfileSidebar } from "./menu";
import { getUserAvatarUrl } from "@/lib/user-avatar";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
  { href: "/transfer", label: "Transfer", icon: <Send /> },
  { href: "/transactions", label: "Transactions", icon: <CreditCard /> },
  { href: "/settings", label: "Settings", icon: <Settings />, pinToBottom: true },
];

/** The app's primary navigation sidebar (used inside AppShell). */
const meta = {
  title: "Layout/UserProfileSidebar",
  component: UserProfileSidebar,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: 600, display: "flex" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    user: {
      name: "Test User",
      email: "test.user@virly.test",
      avatarUrl: getUserAvatarUrl("Test User"),
    },
    navItems,
    logoutItem: { label: "Log out", icon: <LogOut />, onClick: () => {} },
    onToggleCollapse: () => {},
  },
} satisfies Meta<typeof UserProfileSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Collapsed rail (icon-only). */
export const Collapsed: Story = {
  args: { collapsed: true },
};
