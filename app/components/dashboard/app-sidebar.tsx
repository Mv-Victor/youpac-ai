import { useState, useRef } from "react";
import { IconDashboard } from "@tabler/icons-react";
import { Twitter, MessageCircle } from "lucide-react";
import { Link } from "react-router";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenuButton,
  SidebarGroupLabel,
} from "~/components/ui/sidebar";

const data = {
  navMain: [
    {
      title: "DreamX AI",
      url: "/dashboard",
      icon: IconDashboard,
    },
  ],
};

export function AppSidebar({
  variant,
  user,
}: {
  variant: "sidebar" | "floating" | "inset";
  user: any;
}) {
  const [showWechat, setShowWechat] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const wechatRef = useRef<HTMLDivElement>(null);

  const handleWechatEnter = () => {
    if (wechatRef.current) {
      const rect = wechatRef.current.getBoundingClientRect();
      setPopupPos({
        top: rect.top + rect.height / 2,
        left: rect.right + 12,
      });
    }
    setShowWechat(true);
  };

  return (
    <Sidebar collapsible="offcanvas" variant={variant}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link to="/" prefetch="viewport">
              <span className="text-base font-semibold">DreamX</span>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={data.navMain} />

        {/* Connect Links */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Connect</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>

              {/* WeChat — fixed popup，避免被 overflow:hidden 裁剪 */}
              <SidebarMenuItem>
                <div
                  ref={wechatRef}
                  onMouseEnter={handleWechatEnter}
                  onMouseLeave={() => setShowWechat(false)}
                >
                  <SidebarMenuButton className="flex items-center cursor-default w-full">
                    <MessageCircle className="h-4 w-4" />
                    <span>WeChat</span>
                  </SidebarMenuButton>
                </div>
              </SidebarMenuItem>

              {/* Twitter / X */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    href="https://x.com/Vcontinentloyal"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center"
                  >
                    <Twitter className="h-4 w-4" />
                    <span>@Vcontinentloyal</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>{user && <NavUser user={user} />}</SidebarFooter>

      {/* WeChat popup — fixed 定位渲染在 Sidebar 根节点，不受父容器 overflow 影响 */}
      {showWechat && (
        <div
          className="fixed z-[9999] rounded-xl shadow-xl border border-border bg-background p-3"
          style={{
            top: popupPos.top,
            left: popupPos.left,
            transform: "translateY(-50%)",
          }}
          onMouseEnter={() => setShowWechat(true)}
          onMouseLeave={() => setShowWechat(false)}
        >
          <img
            src="/wechat.jpg"
            alt="微信二维码"
            className="w-48 h-auto rounded-lg"
          />
        </div>
      )}
    </Sidebar>
  );
}
