"use client";

import React, { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  BarChartIcon,
  CircleArrowUpRight02Icon,
  DashboardSquare01Icon,
  DatabaseIcon,
  Folder02Icon,
  InformationCircleIcon,
  Mail01Icon,
  Message01Icon,
  Search01Icon,
  Settings02Icon,
  Tick01Icon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface TabConfig {
  id: string;
  label: string;
  icon: typeof DashboardSquare01Icon;
  badge?: string;
  header: string;
  description: string;
}

const TABS: TabConfig[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: DashboardSquare01Icon,
    header: "Project Overview",
    description: "Daily summary of your team performance.",
  },
  {
    id: "management",
    label: "Management",
    icon: UserGroupIcon,
    header: "Team Management",
    description: "Manage roles and user permissions.",
    badge: "10",
  },
  {
    id: "threads",
    label: "Threads",
    icon: Message01Icon,
    header: "Communications",
    description: "High-priority team discussions.",
    badge: "12",
  },
  {
    id: "resources",
    label: "Resources",
    icon: Folder02Icon,
    header: "System Assets",
    description: "Shared documentation and media logs.",
  },
];

export default function BentoCard() {
  const [activeTab, setActiveTab] = useState(TABS[0]);

  const content = useMemo(() => {
    switch (activeTab.id) {
      case "dashboard":
        return <OverviewDashboard />;
      case "management":
        return <ManagementDashboard />;
      case "threads":
        return <ThreadsDashboard />;
      case "resources":
        return <ResourcesDashboard />;
      default:
        return null;
    }
  }, [activeTab.id]);

  return (
    <div className="flex w-full items-center justify-center antialiased">
      <div className="bento-card-shell group relative m-0 w-full max-w-xl overflow-hidden rounded-3xl border bg-card shadow-2xl shadow-primary/5 transition-all duration-500 hover:-translate-y-1 hover:shadow-primary/10 sm:rounded-[2rem]">
        <div className="relative z-10 space-y-1.5 p-4 sm:p-6">
          <h2 className="text-xs uppercase text-muted-foreground">
            Project Dashboard
          </h2>
          <p className="max-w-[480px] text-lg font-medium leading-snug text-foreground sm:text-2xl">
            High-performance analytics and team collaboration tools in one
            place.
          </p>
        </div>

        <div className="bento-card-stage relative h-[260px] w-full overflow-hidden rounded-2xl sm:h-[300px] sm:rounded-[2rem]">
          <div className="bento-card-shadow absolute left-16 top-16 h-full w-full rounded-3xl border border-border/50 bg-muted opacity-80" />

          <div className="bento-card-window absolute left-24 top-8 flex h-full w-full flex-col overflow-hidden rounded-tl-3xl bg-background shadow-xl ring-4 ring-border sm:ring-6">
            <div className="relative flex items-center rounded-tl-3xl border-b border-border/70 px-5 py-4 backdrop-blur-sm">
              <div className="flex gap-1.5">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
              </div>
              <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
                <span className="text-xs uppercase text-muted-foreground/50">
                  Workspace
                </span>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="bento-card-tabs flex w-36 flex-col gap-1 border-r border-border/30 bg-muted/5 p-2 pt-6">
                <LayoutGroup>
                  {TABS.map((tab) => {
                    const isActive = activeTab.id === tab.id;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "relative flex cursor-pointer items-center gap-1.5 rounded-xl p-2 text-xs transition-colors",
                          isActive
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <HugeiconsIcon
                          icon={tab.icon}
                          size={14}
                          className="relative z-20 shrink-0"
                        />
                        <span className="relative z-20 truncate font-medium">
                          {tab.label}
                        </span>
                        {tab.badge ? (
                          <span
                            className={cn(
                              "relative z-20 ml-auto rounded-md border px-1 py-0.5 text-[8px] leading-none tabular-nums transition-all",
                              isActive
                                ? "border-primary/20 bg-primary/10 text-primary"
                                : "border-transparent bg-muted text-muted-foreground",
                            )}
                          >
                            {tab.badge}
                          </span>
                        ) : null}

                        {isActive ? (
                          <motion.div
                            layoutId="sidebar-pill"
                            className="absolute left-0 z-30 h-4 w-[2px] rounded-full border border-primary/20 bg-primary"
                            transition={{
                              type: "spring",
                              bounce: 0.2,
                              duration: 0.6,
                            }}
                          />
                        ) : null}
                        {isActive ? (
                          <motion.div
                            layoutId="backgroundIndicator"
                            className="absolute inset-0 rounded-lg border border-border/40 bg-muted"
                            transition={{
                              type: "spring",
                              bounce: 0.2,
                              duration: 0.6,
                            }}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </LayoutGroup>
              </div>

              <div className="relative flex flex-1 flex-col gap-4 overflow-hidden bg-background p-5 pt-6">
                <header className="flex flex-col gap-0.5">
                  <h3 className="line-clamp-1 text-xs font-semibold uppercase tracking-tight text-foreground opacity-60">
                    {activeTab.header}
                  </h3>
                  <p className="line-clamp-1 text-[10px] font-normal leading-tight text-muted-foreground">
                    {activeTab.description}
                  </p>
                </header>

                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={activeTab.id}
                    initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    className="flex-1"
                  >
                    {content}
                  </motion.div>
                </AnimatePresence>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 bg-gradient-to-t from-background to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const OverviewDashboard = () => (
  <div className="flex h-full flex-col gap-3">
    <div className="relative overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-background to-muted/20 p-3.5">
      <div className="relative z-10 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-medium text-muted-foreground">
            Team Performance
          </span>
          <HugeiconsIcon
            icon={CircleArrowUpRight02Icon}
            size={12}
            className="text-primary"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xl font-medium tracking-tight text-foreground">
            94.2%
          </span>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "94.2%" }}
              className="h-full rounded-full bg-primary"
            />
          </div>
        </div>
        <span className="text-[9px] text-muted-foreground">
          Score for Search & Delivery campaigns
        </span>
      </div>
      <div className="absolute -bottom-2 -right-2 rotate-12 scale-150 opacity-5">
        <HugeiconsIcon icon={BarChartIcon} size={64} />
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/50 p-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-medium text-foreground">1,070</span>
          <span className="text-[8px] font-medium uppercase text-muted-foreground">
            Keywords
          </span>
        </div>
        <HugeiconsIcon icon={Search01Icon} size={14} className="opacity-20" />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/50 p-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-medium text-foreground">2.3M</span>
          <span className="text-[8px] font-medium uppercase text-muted-foreground">
            Credits
          </span>
        </div>
        <HugeiconsIcon
          icon={InformationCircleIcon}
          size={14}
          className="opacity-20"
        />
      </div>
    </div>
  </div>
);

const ManagementDashboard = () => (
  <div className="not-prose flex h-full flex-col">
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/40 bg-background/50">
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3 py-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Active Users
        </span>
        <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background px-1.5 py-0.5">
          <HugeiconsIcon
            icon={Search01Icon}
            size={10}
            className="text-muted-foreground/50"
          />
          <span className="text-[8px] font-medium text-muted-foreground">
            Search
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 p-1">
        {[
          {
            name: "Anthony Dionne",
            role: "Pending admin approval",
            color: "bg-amber-400",
          },
          {
            name: "Nick Yahodin",
            role: "Dealership group admin",
            color: "bg-emerald-400",
          },
          {
            name: "Mujeeb Aimaq",
            role: "Dealership group user",
            color: "bg-emerald-400",
          },
        ].map((user) => (
          <div
            key={user.name}
            className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/30"
          >
            <div className="relative flex h-6 w-6 items-center justify-center rounded-full border border-border/40 bg-muted">
              <HugeiconsIcon
                icon={UserIcon}
                size={10}
                className="text-muted-foreground"
              />
              <div
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background",
                  user.color,
                )}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[10px] font-medium text-foreground">
                {user.name}
              </span>
              <span className="truncate text-[8px] text-muted-foreground">
                {user.role}
              </span>
            </div>
            <div className="opacity-0 transition-opacity group-hover:opacity-100">
              <HugeiconsIcon
                icon={Settings02Icon}
                size={12}
                className="text-muted-foreground"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const ThreadsDashboard = () => (
  <div className="flex h-full flex-col gap-3">
    <div className="grid grid-cols-2 gap-3">
      {[
        {
          title: "Create a Page",
          desc: "Build your project base.",
          icon: Folder02Icon,
        },
        {
          title: "Create a Task",
          desc: "Organize with team.",
          icon: Tick01Icon,
        },
      ].map((card) => (
        <div
          key={card.title}
          className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border/40 bg-background/50 p-3.5"
        >
          <div className="z-10 flex flex-col gap-1">
            <span className="text-[12px] font-medium leading-tight text-foreground">
              {card.title}
            </span>
            <span className="text-[9px] leading-tight text-muted-foreground">
              {card.desc}
            </span>
          </div>
          <button className="z-10 flex w-fit items-center gap-1.5 rounded-md bg-foreground px-2 py-1 text-[8px] font-semibold text-background transition-transform group-hover:bg-primary active:scale-95">
            <HugeiconsIcon icon={Add01Icon} size={8} strokeWidth={3} />
            Create
          </button>
        </div>
      ))}
    </div>

    <div className="mt-auto flex items-center justify-between rounded-xl border border-border/30 bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <div className="rounded-md border border-border/40 bg-background px-1.5 py-1">
          <HugeiconsIcon
            icon={InformationCircleIcon}
            size={10}
            className="text-muted-foreground"
          />
        </div>
        <span className="text-[9px] font-medium text-muted-foreground">
          Pin a new item
        </span>
      </div>
      <HugeiconsIcon
        icon={Add01Icon}
        size={12}
        className="text-muted-foreground/50"
      />
    </div>
  </div>
);

const ResourcesDashboard = () => (
  <div className="flex h-full flex-col gap-3 overflow-hidden">
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border/40 bg-background/50">
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3 py-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Archives & Logs
        </span>
        <HugeiconsIcon
          icon={DatabaseIcon}
          size={12}
          className="text-muted-foreground/30"
        />
      </div>
      <div className="scrollbar-hide flex-1 overflow-y-auto p-1">
        {[
          {
            file: "design_spec_v2.pdf",
            size: "2.4 MB",
            type: "PDF",
            icon: Mail01Icon,
          },
          {
            file: "q4_performance.xls",
            size: "1.1 MB",
            type: "XLS",
            icon: BarChartIcon,
          },
          {
            file: "branding_assets.zip",
            size: "48 MB",
            type: "ZIP",
            icon: Folder02Icon,
          },
          {
            file: "system_logs.json",
            size: "4 KB",
            type: "JSON",
            icon: Folder02Icon,
          },
        ].map((item) => (
          <div
            key={item.file}
            className="group flex cursor-pointer items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-muted/30"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md border border-border/40 bg-muted/50 text-muted-foreground/60 transition-colors group-hover:bg-primary/5 group-hover:text-primary">
              <HugeiconsIcon icon={item.icon} size={12} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[10px] font-medium text-foreground">
                {item.file}
              </span>
              <span className="truncate text-[8px] uppercase tabular-nums text-muted-foreground">
                {item.size} - {item.type}
              </span>
            </div>
            <HugeiconsIcon
              icon={CircleArrowUpRight02Icon}
              size={10}
              className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
        ))}
      </div>
    </div>
  </div>
);
