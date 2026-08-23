import { Image as ImageIcon, MessageSquare, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Image to Prompt",
    href: "/",
    icon: ImageIcon,
    match: (p) => p === "/",
  },
  {
    label: "Chat",
    href: "/chat",
    icon: MessageSquare,
    match: (p) => p.startsWith("/chat"),
  },
];

export const NAV_SETTINGS_ITEM: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
  match: (p) => p.startsWith("/settings"),
};
