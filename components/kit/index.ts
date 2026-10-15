/**
 * The InFocus Portal UI kit (see components/kit/README.md). Everything is re-exported here for
 * convenience; client components on hot paths can import from the file directly
 * (`@/components/kit/status-tag`) to keep their bundles small.
 */
export * from "@/components/kit/tone";
export * from "@/components/kit/format";
export * from "@/components/kit/icon";
export * from "@/components/kit/spinner";
export * from "@/components/kit/status-tag";
export * from "@/components/kit/kbd";
export * from "@/components/kit/action-bar";
export * from "@/components/kit/icon-button";
export * from "@/components/kit/button-group";
export * from "@/components/kit/panel";
export * from "@/components/kit/section";
export * from "@/components/kit/alert";
export * from "@/components/kit/empty-state";
export * from "@/components/kit/progress";
export * from "@/components/kit/stat-tile";
export * from "@/components/kit/key-value";
export * from "@/components/kit/segment-nav";
export * from "@/components/kit/roving";
export * from "@/components/kit/tab-styles";
export * from "@/components/kit/segmented-control";
export * from "@/components/kit/filter-chips";
export * from "@/components/kit/view-tabs";
export * from "@/components/kit/search-field";
export * from "@/components/kit/hotkeys";
export * from "@/components/kit/remembered-state";
export * from "@/components/kit/field";
export * from "@/components/kit/list-row";
export * from "@/components/kit/data-table";
export * from "@/components/kit/layout";
export * from "@/components/kit/sheet";
export * from "@/components/kit/menu";
export * from "@/components/kit/skeleton";
export * from "@/components/kit/avatar";
export * from "@/components/kit/media";
export * from "@/components/kit/sticky-action-bar";
export * from "@/components/kit/disclosure";
export * from "@/components/kit/pickers";
export * from "@/components/kit/radio-cards";
export * from "@/components/kit/dropzone";
export * from "@/components/kit/status-plate";
export * from "@/components/kit/phone-tab-bar";

// Shared pieces that live outside the kit folder.
export { PageHeader } from "@/components/page-header";
export { HubTabs, type HubTabWithStatus } from "@/components/hub-tabs";
export { CopyButton, CopyTextButton } from "@/components/copy-text-button";
export { Checkbox } from "@/components/ui/checkbox";
export { NativeSelect } from "@/components/ui/native-select";
