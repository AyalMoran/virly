// Design-sync barrel entry — re-exports Virly's REAL, in-use design system for
// the claude.ai/design converter (passed as --entry). Selection is usage-driven:
// the brand primitives (Primitives.tsx, used app-wide), the domain components,
// and the distinctive UI pieces. Generated artifact; not imported by the app.

// ── Primitives (the app's shared UI layer — global.css `.button`/`.card`/… ) ──
export {
  Button,
  Card,
  PageStack,
  ResponsiveGrid,
  Field,
  TextareaField,
  PageHeader,
  ErrorBanner,
  SuccessBanner,
  EmptyState,
  Skeleton,
} from "@/components/Primitives";

// ── Domain components ──
export { TransferCheque } from "@/components/TransferCheque";
export { NotFoundSlip } from "@/components/NotFoundSlip";
export { TransactionList } from "@/components/TransactionList";
export { TransactionReceipt } from "@/components/TransactionReceipt";
export { TransactionDetailsDialog } from "@/components/TransactionDetailsDialog";
export { QuickContacts } from "@/components/QuickContacts";
export { ShellTopbar } from "@/components/ShellTopbar";

// ── Distinctive UI components ──
export { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from "@/components/ui/select";
export { AnimatedText } from "@/components/ui/animated-text";
export { SignInCard2 } from "@/components/ui/sign-in-card-2";
export { UserProfileSidebar } from "@/components/ui/menu";
export { default as ShaderBackground } from "@/components/ui/shader-background";
