import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { UserProfileSidebar } from "../menu.js";

const stubLogoutItem = {
  icon: <span>icon</span>,
  label: "Sign out",
  onClick: () => {},
};

const stubUser = {
  name: "Jane Doe",
  email: "jane@example.com",
  avatarUrl: "https://example.com/jane.jpg",
};

const stubNavItems = [
  { icon: <span>dash</span>, label: "Dashboard", href: "/dashboard" },
  { icon: <span>set</span>, label: "Settings", href: "/settings" },
];

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("UserProfileSidebar", () => {
  describe("user profile area", () => {
    it("renders the user name", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).toContain("Jane Doe");
    });

    it("renders the user email", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).toContain("jane@example.com");
    });

    it("renders the avatar img with alt text including user name", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).toContain("Jane Doe");
      expect(html).toMatch(/jane\.jpg/);
    });
  });

  describe("navigation items", () => {
    it("renders nav item labels", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).toContain("Dashboard");
      expect(html).toContain("Settings");
    });

    it("renders nav item hrefs as links", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).toContain("/dashboard");
      expect(html).toContain("/settings");
    });

    it("renders nav role=navigation element", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).toMatch(/role="navigation"/);
    });
  });

  describe("logout item", () => {
    it("renders the logout label", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).toContain("Sign out");
    });

    it("renders a logout button with the correct aria-label", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).toContain('aria-label="Sign out"');
    });
  });

  describe("collapsed prop", () => {
    it("adds collapsed class when collapsed=true", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
          collapsed={true}
        />
      );
      expect(html).toMatch(/collapsed/);
    });

    it("does not add collapsed class when collapsed=false", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
          collapsed={false}
        />
      );
      expect(html).not.toMatch(/class="[^"]*\bcollapsed\b/);
    });
  });

  describe("onToggleCollapse", () => {
    it("renders toggle button when onToggleCollapse is provided", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
          onToggleCollapse={() => {}}
        />
      );
      expect(html).toMatch(/aria-expanded/);
      expect(html).toMatch(/profile-sidebar-toggle/);
    });

    it("does not render toggle button when onToggleCollapse is absent", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).not.toMatch(/profile-sidebar-toggle/);
    });

    it("sets aria-expanded=false when collapsed=true", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
          collapsed={true}
          onToggleCollapse={() => {}}
        />
      );
      expect(html).toContain('aria-expanded="false"');
    });

    it("sets aria-expanded=true when collapsed=false", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
          collapsed={false}
          onToggleCollapse={() => {}}
        />
      );
      expect(html).toContain('aria-expanded="true"');
    });
  });

  describe("pinToBottom items", () => {
    it("renders bottom-pinned nav items in a separate spacer section", () => {
      const navItemsWithBottom = [
        { icon: <span>home</span>, label: "Home", href: "/home" },
        { icon: <span>help</span>, label: "Help", href: "/help", pinToBottom: true },
      ];
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={navItemsWithBottom}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).toContain("Home");
      expect(html).toContain("Help");
      expect(html).toMatch(/profile-sidebar-spacer/);
    });

    it("does not render spacer when there are no pinned-bottom items", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).not.toMatch(/profile-sidebar-spacer/);
    });
  });

  describe("separator items", () => {
    it("renders a profile-sidebar-gap for separator items", () => {
      const navItemsWithSep = [
        { icon: <span>a</span>, label: "Alpha", href: "/a" },
        { icon: <span>b</span>, label: "Beta", href: "/b", isSeparator: true },
      ];
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={navItemsWithSep}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).toMatch(/profile-sidebar-gap/);
    });
  });

  describe("custom className", () => {
    it("applies custom className to the sidebar", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
          className="my-sidebar"
        />
      );
      expect(html).toContain("my-sidebar");
    });
  });

  describe("accessibility", () => {
    it("renders an aside with aria-label", () => {
      const html = render(
        <UserProfileSidebar
          user={stubUser}
          navItems={stubNavItems}
          logoutItem={stubLogoutItem}
        />
      );
      expect(html).toMatch(/aria-label="User profile menu"/);
    });
  });
});
