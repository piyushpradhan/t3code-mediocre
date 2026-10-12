// Floating sidebars overlay the workspace, so their expanded state still needs
// to reserve the native window buttons and the sidebar toggle in the titlebar.
export const COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS =
  "[[data-sidebar-state=collapsed]_&]:pl-[var(--workspace-titlebar-content-left)] [[data-sidebar-hover-mode=true]_&]:pl-[var(--workspace-titlebar-content-left)] [[data-sidebar-hover-mode=true]_&]:transition-none! max-md:[[data-sidebar-state=expanded]_&]:pl-[var(--workspace-titlebar-content-left)]";
