import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ElementType,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  AlertTriangle,
  Ban,
  Brain,
  Check,
  Code,
  Clock,
  HeartHandshake,
  MessageSquare,
  ShieldCheck,
  Send,
  Smile,
  Sparkles,
  UserRound,
  X,
  Zap,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AssistantBlocks,
  AssistantMarkdown,
  hasTransferConfirmationBlock,
  type TransferConfirmationCardStatus,
} from "@/components/assistant/AssistantBlocks";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, ApiError, supportsAiChatStreaming } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type {
  AiConfirmationAction,
  AiClarificationRequest,
  AiChatResponse,
  AiChatStreamPhase,
  AssistantResponseBlock,
  AssistantResponseFormatVersion,
  AiTransferConfirmation,
  AssistantId
} from "@/lib/types";
import { getDisplayName, getInitial, getUserAvatarUrl } from "@/lib/user-avatar";
import { cn } from "@/lib/utils";



import oshriAvatar from "@/assets/agents/oshri.jpeg";
import chayaAvatar from "@/assets/agents/chaya.jpeg";
import yehudaAvatar from "@/assets/agents/yehuda.jpeg";



interface Agent {
  id: AssistantId;
  name: string;
  role: string;
  avatar: string;
  status: "online" | "busy" | "offline";
  icon: ElementType;
  gradient: string;
  greeting: string;
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  responseFormatVersion?: AssistantResponseFormatVersion;
  responseBlocks?: AssistantResponseBlock[];
  assistantId?: AssistantId;
  clarification?: AiClarificationRequest;
  confirmation?: AiTransferConfirmation;
  confirmationStatus?: TransferConfirmationCardStatus;
};

function getStreamPhaseLabel(phase: AiChatStreamPhase | null) {
  switch (phase) {
    case "accepted":
      return "Starting secure assistant flow";
    case "understanding_request":
      return "Understanding your request";
    case "resolving_context":
      return "Resolving context";
    case "checking_account_facts":
      return "Checking account facts";
    case "preparing_confirmation":
      return "Preparing confirmation";
    case "composing_response":
      return "Composing response";
    case "completed":
      return "Completed";
    default:
      return "Working";
  }
}

const AI_AGENTS: Agent[] = [
  {
    id: "oshri",
    name: "Oshri",
    role: "חיוך חינם, העברות בתשלום",
    avatar: oshriAvatar,
    status: "online",
    icon: Smile,
    gradient: "from-emerald-500/20 to-teal-500/20",
    greeting: "מה קורה? אני אושרי. כסף, בדיקות, העברות, מצב רוח — מה שנקרא, טיקי-טאקה פיננסי. איך אני עוזר?",
  },
  {
    id: "chaya",
    name: "Chaya",
    role: "שפע, סדר ובשורות טובות",
    avatar: chayaAvatar,
    status: "online",
    icon: HeartHandshake,
    gradient: "from-amber-500/20 to-lime-500/20",
    greeting: "בס״ד, שלום וברכה. אני חיה. נעשה סדר בחשבון בנחת, לפי הנתונים, ובעזרת השם גם עם בשורות טובות. במה להתחיל?",
  },
  {
    id: "yehuda",
    name: "Yehuda",
    role: "עושה את המינימום בצורה מקסימלית",
    avatar: yehudaAvatar,
    status: "busy",
    icon: Zap,
    gradient: "from-cyan-500/20 to-sky-500/20",
    greeting: "היי, אני יהודה. אני פה, אני עובד, לא נעשה מזה טקס. מה צריך?",
  },
  {
    id: "yohai_daniel",
    name: "Yohai/Daniel",
    role: "לחשוב מהר, לחשב נכון",
    avatar: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=128&q=80",
    status: "online",
    icon: Brain,
    gradient: "from-rose-500/20 to-orange-500/20",
    greeting: "אני יוחאי/דניאל. בלי רעש, בלי ניחושים - רק נתונים, חישוב מדויק וצעד הבא ברור. מה בודקים?",
  },
];

function getAgentById(assistantId?: AssistantId) {
  return AI_AGENTS.find((agent) => agent.id === assistantId) || AI_AGENTS[0];
}

function getRecipientName(confirmation: AiTransferConfirmation) {
  if (confirmation.recipient?.displayName) {
    return confirmation.recipient.displayName;
  }

  const name = [
    confirmation.recipientFirstName,
    confirmation.recipientLastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return name || "Name not provided";
}

function isConfirmationExpired(confirmation: AiTransferConfirmation) {
  return new Date(confirmation.expiresAt).getTime() <= Date.now();
}

function getConfirmationAmount(confirmation: AiTransferConfirmation) {
  return confirmation.amountDetails?.formatted ?? formatCurrency(confirmation.amount);
}

function getConfirmationExpiryLabel(confirmation: AiTransferConfirmation) {
  const expiresAt = new Date(confirmation.expiresAt);
  const diffInMinutes = Math.ceil((expiresAt.getTime() - Date.now()) / 60000);

  if (diffInMinutes <= 0) {
    return "Expired";
  }

  return `${diffInMinutes} min left`;
}

function getConfirmationStatusLabel(
  status: ChatMessage["confirmationStatus"],
  confirmation: AiTransferConfirmation,
) {
  if (isConfirmationExpired(confirmation)) {
    return "Expired";
  }

  switch (status) {
    case "confirming":
      return "Sending";
    case "denying":
      return "Cancelling";
    case "confirmed":
      return "Confirmed";
    case "denied":
      return "Denied";
    case "superseded":
      return "Replaced";
    case "failed":
      return "Needs retry";
    default:
      return "Pending";
  }
}

const containerVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
    transformOrigin: "bottom right",
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      damping: 25,
      stiffness: 300,
      staggerChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    y: 20,
    scale: 0.95,
    transition: {
      duration: 0.2,
    },
  },
};

const messageVariants: Variants = {
  hidden: { opacity: 0, y: 10, x: -10 },
  visible: {
    opacity: 1,
    y: 0,
    x: 0,
    transition: { type: "spring", stiffness: 500, damping: 30 },
  },
};

const CHAT_INPUT_MAX_HEIGHT = 128;

function resizeChatTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) {
    return;
  }

  textarea.style.height = "0px";
  const nextHeight = Math.min(textarea.scrollHeight, CHAT_INPUT_MAX_HEIGHT);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > CHAT_INPUT_MAX_HEIGHT ? "auto" : "hidden";
}

type PendingTransferCardProps = {
  confirmation: AiTransferConfirmation;
  status: ChatMessage["confirmationStatus"];
  onConfirm: () => void;
  onDeny: () => void;
};

function PendingTransferCard({
  confirmation,
  status,
  onConfirm,
  onDeny,
}: PendingTransferCardProps) {
  const expired = isConfirmationExpired(confirmation);
  const disabled = status !== "pending" || expired;
  const statusLabel = getConfirmationStatusLabel(status, confirmation);
  const warnings = confirmation.warnings ?? [];
  const isSuperseded = status === "superseded";

  return (
    <div
      className={cn(
        "mt-2.5 overflow-hidden rounded-lg border bg-background/90 shadow-md ring-1 ring-white/30",
        isSuperseded
          ? "border-slate-300/50 opacity-70 shadow-slate-950/5"
          : "border-emerald-500/25 shadow-emerald-950/5"
      )}
      dir="auto"
      style={{ textAlign: "start", overflowWrap: "anywhere" }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/30 bg-emerald-500/10 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
            <ShieldCheck className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase leading-3 text-emerald-700">
              Pending transfer
            </p>
            <p className="break-words text-[10px] leading-4 text-muted-foreground">
              {isSuperseded
                ? "Replaced by a newer card"
                : "Review details before money moves"}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-500/25 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
          {statusLabel}
        </span>
      </div>

      <div className="grid gap-2 p-2.5">
        {isSuperseded ? (
          <p className="rounded-md border border-slate-300/50 bg-slate-500/10 px-2 py-1 text-[10px] leading-4 text-muted-foreground">
            This card is no longer valid. Use the latest confirmation card.
          </p>
        ) : null}
        <dl className="grid gap-1.5 text-[11px]">
          <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-2 rounded-md border border-border/30 bg-background/60 px-2 py-1.5">
            <dt className="flex items-center gap-1 text-muted-foreground">
              <UserRound className="h-3 w-3" />
              To
            </dt>
            <dd className="min-w-0">
              <p className="break-words font-medium leading-4 text-foreground" dir="auto">
                {getRecipientName(confirmation)}
              </p>
              <bdi
                dir="ltr"
                className="block min-w-0 break-all text-muted-foreground"
              >
                {confirmation.recipientEmail}
              </bdi>
            </dd>
          </div>

          <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-border/30 bg-muted/20 px-2 py-1.5">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="flex min-w-0 items-baseline justify-between gap-2">
              <bdi
                dir="ltr"
                className="min-w-0 break-all text-base font-semibold leading-5 text-foreground"
              >
                {getConfirmationAmount(confirmation)}
              </bdi>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {confirmation.currency}
              </span>
            </dd>
          </div>

          <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-border/30 bg-background/60 px-2 py-1.5">
            <dt className="text-muted-foreground">Reason</dt>
            <dd className="break-words text-start font-medium text-foreground" dir="auto">
              {confirmation.reason || "Not provided"}
            </dd>
          </div>

          <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-border/30 bg-background/60 px-2 py-1.5">
            <dt className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              Expires
            </dt>
            <dd className="break-words text-start font-medium text-foreground">
              {getConfirmationExpiryLabel(confirmation)}
            </dd>
          </div>
        </dl>

        {warnings.length > 0 ? (
          <div className="grid gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5">
            {warnings.map((warning) => (
              <p
                key={`${warning.code}-${warning.message}`}
                className="flex gap-1.5 text-[10px] leading-3 text-amber-800"
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="line-clamp-2">{warning.message}</span>
              </p>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            size="sm"
            className="min-h-10 gap-1 rounded-md bg-emerald-600 px-2 text-xs text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-600"
            disabled={disabled}
            onClick={onConfirm}
          >
            <Check className="h-3.5 w-3.5" />
            {status === "confirming" ? "Sending" : "Confirm"}
          </Button>
          <Button
            type="button"
            size="sm"
            className="min-h-10 gap-1 rounded-md bg-red-600 px-2 text-xs text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-600"
            disabled={disabled}
            onClick={onDeny}
          >
            <Ban className="h-3.5 w-3.5" />
            {status === "denying" ? "Cancelling" : "Deny"}
          </Button>
        </div>
      </div>
    </div>
  );
}

type ClarificationOptionsProps = {
  clarification: AiClarificationRequest;
  disabled: boolean;
  onSelect: (value: string) => void;
};

function ClarificationOptions({
  clarification,
  disabled,
  onSelect,
}: ClarificationOptionsProps) {
  const options = clarification.options ?? [];
  if (options.length === 0) {
    return null;
  }

  return (
    <div className="mt-2.5 grid gap-1.5">
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant="outline"
          size="sm"
          className="h-auto justify-start whitespace-normal rounded-lg border-border/40 bg-background/80 px-3 py-2 text-start text-xs font-medium"
          disabled={disabled}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
export function FloatingChatWidget() {
  const auth = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AssistantId>(AI_AGENTS[0].id);
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [streamPhase, setStreamPhase] = useState<AiChatStreamPhase | null>(null);
  const widgetId = useId();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  const toggleOpen = useCallback(() => setIsOpen((prev) => !prev), []);

  const currentAgent = getAgentById(selectedAgent);
  const userDisplayName = getDisplayName(auth.user?.email);
  const userAvatarUrl = getUserAvatarUrl(userDisplayName);
  const userInitials = getInitial(userDisplayName);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isOpen, isSending]);

  useEffect(() => {
    if (isOpen && !isSending) {
      messageInputRef.current?.focus();
    }
  }, [isOpen, isSending]);

  useEffect(() => {
    resizeChatTextarea(messageInputRef.current);
  }, [message]);

  function handleMessageChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setMessage(event.target.value);
    resizeChatTextarea(event.target);
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();

      if (!message.trim() || isSending) {
        return;
      }

      event.currentTarget.form?.requestSubmit();
    }
  }

  async function sendChatMessage(trimmedMessage: string) {
    if (!trimmedMessage || isSending) {
      return;
    }

    const requestAssistantId = selectedAgent;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedMessage,
    };

    setChatMessages((messages) => [...messages, userMessage]);
    setMessage("");
    resizeChatTextarea(messageInputRef.current);
    setIsSending(true);
    setStreamPhase("accepted");
    const useStreaming = supportsAiChatStreaming();

    const appendAssistantResponse = (response: AiChatResponse) => {
      setConversationId(response.conversationId);
      setChatMessages((messages) => [
        ...messages.map((chatMessage) =>
          response.supersededConfirmationId &&
          chatMessage.confirmation?.id === response.supersededConfirmationId
            ? { ...chatMessage, confirmationStatus: "superseded" as const }
            : chatMessage,
        ),
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.responseMessage ?? response.message,
          responseFormatVersion: response.responseFormatVersion,
          responseBlocks: response.responseBlocks,
          assistantId: response.assistantId,
          clarification: response.clarification,
          confirmation: response.confirmation,
          confirmationStatus: response.confirmation ? "pending" : undefined,
        },
      ]);
    };

    try {
      const response = useStreaming
        ? await api.aiChatStream(
            {
              message: trimmedMessage,
              conversationId,
              assistantId: requestAssistantId,
            },
            {
              onStatus: ({ phase }) => {
                setStreamPhase(phase);
              },
            },
          )
        : await api.aiChat({
            message: trimmedMessage,
            conversationId,
            assistantId: requestAssistantId,
          });

      appendAssistantResponse(response);
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : "I could not reach the assistant right now.";

      setChatMessages((messages) => [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorMessage,
          assistantId: requestAssistantId,
        },
      ]);
    } finally {
      setIsSending(false);
      setStreamPhase(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendChatMessage(message.trim());
  }

  async function handleConfirmationAction(
    messageId: string,
    confirmation: AiTransferConfirmation,
    action: AiConfirmationAction,
  ) {
    const pendingStatus = action === "confirm" ? "confirming" : "denying";

    setChatMessages((messages) =>
      messages.map((chatMessage) =>
        chatMessage.id === messageId
          ? { ...chatMessage, confirmationStatus: pendingStatus }
          : chatMessage,
      ),
    );

    try {
      const response = await api.aiConfirmation(
        confirmation.id,
        action,
        confirmation.version,
      );

      setChatMessages((messages) =>
        messages.map((chatMessage) =>
          chatMessage.id === messageId
            ? {
                ...chatMessage,
                content: response.message,
                confirmationStatus: response.status,
              }
            : chatMessage,
        ),
      );

      if (response.status === "confirmed") {
        auth.updateBalance(response.newBalance);
      }
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : "I could not update that transfer confirmation.";

      setChatMessages((messages) =>
        messages.map((chatMessage) =>
          chatMessage.id === messageId
            ? {
                ...chatMessage,
                content: errorMessage,
                confirmationStatus: "failed",
              }
            : chatMessage,
        ),
      );
    } finally {
      messageInputRef.current?.focus();
    }
  }

  return (
    <div
      className="floating-chat-root fixed bottom-5 right-4 z-50 flex flex-col items-end gap-4 sm:bottom-6 sm:right-6"
      id={widgetId}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-window"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="floating-chat-window w-[calc(100vw-2rem)] max-w-[380px] overflow-hidden rounded-2xl border border-border/40 bg-background/80 shadow-2xl backdrop-blur-xl ring-1 ring-white/30"
          >
            <div className="relative overflow-hidden border-b border-border/40 bg-muted/30 p-4">
              <div
                className={cn(
                  "absolute inset-0 bg-gradient-to-br opacity-50",
                  currentAgent.gradient,
                )}
              />
              <div className="relative z-10 flex items-center justify-between gap-2">
                <Select
                  value={selectedAgent}
                  onValueChange={(value) => setSelectedAgent(value as AssistantId)}
                >
                  <SelectTrigger
                    aria-label={`Assistant: ${currentAgent.name}. Choose an assistant`}
                    className="h-auto min-h-11 min-w-0 flex-1 cursor-pointer rounded-xl border-none bg-transparent px-1.5 py-1 shadow-none transition-colors hover:bg-background/40 focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 [&>svg]:shrink-0"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                          <AvatarImage
                            src={currentAgent.avatar}
                            alt=""
                          />
                          <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                        <span
                          className={cn(
                            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
                            currentAgent.status === "online"
                              ? "bg-emerald-500"
                              : currentAgent.status === "busy"
                                ? "bg-amber-500"
                                : "bg-slate-400",
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {currentAgent.name}
                        </h3>
                        <span
                          className="block truncate text-xs text-muted-foreground"
                          dir="auto"
                        >
                          {currentAgent.role}
                        </span>
                      </div>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="border-border/40 bg-background/90 backdrop-blur-xl">
                    {AI_AGENTS.map((agent) => (
                      <SelectItem
                        key={agent.id}
                        value={agent.id}
                        className="cursor-pointer focus:bg-primary/10"
                      >
                        <div className="flex items-center gap-3 py-1">
                          <div className="relative shrink-0">
                            <Avatar className="h-8 w-8 border border-border/40 shadow-sm">
                              <AvatarImage src={agent.avatar} alt="" />
                              <AvatarFallback>AI</AvatarFallback>
                            </Avatar>
                            <span
                              className={cn(
                                "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
                                agent.status === "online"
                                  ? "bg-emerald-500"
                                  : agent.status === "busy"
                                    ? "bg-amber-500"
                                    : "bg-slate-400",
                              )}
                            />
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-sm font-medium">
                              {agent.name}
                            </span>
                            <span
                              className="text-[10px] text-muted-foreground"
                              dir="auto"
                            >
                              {agent.role}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-10 min-w-10 shrink-0 rounded-full hover:bg-background/50"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div
              className="floating-chat-messages flex h-[320px] flex-col gap-4 overflow-y-auto bg-gradient-to-b from-background/20 to-background/40 p-4"
              role="log"
              aria-live="polite"
            >
              <motion.div variants={messageVariants} className="flex gap-3">
                <Avatar className="h-8 w-8 border border-border/40 shadow-sm">
                  <AvatarImage src={currentAgent.avatar} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    AI
                  </AvatarFallback>
                </Avatar>
                <div className="chat-message-column flex max-w-[85%] flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {currentAgent.name}
                  </span>
                  <div
                    className="rounded-2xl rounded-tl-none border border-border/20 bg-muted/50 px-4 py-2.5 text-sm shadow-sm backdrop-blur-sm"
                    dir="auto"
                    style={{ textAlign: "start", overflowWrap: "anywhere" }}
                  >
                    <AssistantMarkdown text={currentAgent.greeting} />
                  </div>
                </div>
              </motion.div>

              {chatMessages.map((chatMessage) => {
                const messageAgent = getAgentById(chatMessage.assistantId);

                return chatMessage.role === "user" ? (
                  <motion.div
                    key={chatMessage.id}
                    variants={messageVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-row-reverse gap-3 self-end"
                  >
                    <Avatar className="h-8 w-8 border border-border/40 shadow-sm">
                      <AvatarImage src={userAvatarUrl} alt={userDisplayName} />
                      <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="chat-message-column flex max-w-[85%] flex-col items-end gap-1">
                      <div
                        className="rounded-2xl rounded-tr-none bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-md"
                        dir="auto"
                        style={{ textAlign: "start", overflowWrap: "anywhere" }}
                      >
                        <p className="min-w-0 break-words">{chatMessage.content}</p>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={chatMessage.id}
                    variants={messageVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex gap-3"
                  >
                    <Avatar className="h-8 w-8 border border-border/40 shadow-sm">
                      <AvatarImage src={messageAgent.avatar} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        AI
                      </AvatarFallback>
                    </Avatar>
                    <div className="chat-message-column flex max-w-[85%] flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {messageAgent.name}
                      </span>
                      <div
                        className="rounded-2xl rounded-tl-none border border-border/20 bg-muted/50 px-4 py-2.5 text-sm shadow-sm backdrop-blur-sm"
                        dir="auto"
                        style={{ textAlign: "start", overflowWrap: "anywhere" }}
                      >
                        {chatMessage.content ? (
                          <AssistantMarkdown text={chatMessage.content} />
                        ) : null}
                        {chatMessage.responseBlocks?.length ? (
                          <AssistantBlocks
                            blocks={chatMessage.responseBlocks}
                            confirmationStatus={chatMessage.confirmationStatus}
                            onConfirmTransfer={(confirmation) =>
                              handleConfirmationAction(
                                chatMessage.id,
                                confirmation,
                                "confirm",
                              )
                            }
                            onDenyTransfer={(confirmation) =>
                              handleConfirmationAction(
                                chatMessage.id,
                                confirmation,
                                "deny",
                              )
                            }
                          />
                        ) : null}
                        {chatMessage.clarification ? (
                          <ClarificationOptions
                            clarification={chatMessage.clarification}
                            disabled={isSending}
                            onSelect={(value) => {
                              void sendChatMessage(value);
                            }}
                          />
                        ) : null}
                        {chatMessage.confirmation &&
                        !hasTransferConfirmationBlock(chatMessage.responseBlocks) ? (
                          <PendingTransferCard
                            confirmation={chatMessage.confirmation}
                            status={chatMessage.confirmationStatus}
                            onConfirm={() =>
                              handleConfirmationAction(
                                chatMessage.id,
                                chatMessage.confirmation!,
                                "confirm",
                              )
                            }
                            onDeny={() =>
                              handleConfirmationAction(
                                chatMessage.id,
                                chatMessage.confirmation!,
                                "deny",
                              )
                            }
                          />
                        ) : null}
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {isSending && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <Avatar className="h-8 w-8 border border-border/40 shadow-sm">
                    <AvatarImage src={currentAgent.avatar} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      AI
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-center gap-1 rounded-2xl rounded-tl-none border border-border/20 bg-muted/50 px-4 py-3 shadow-sm backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40" />
                    </div>
                    <span className="pl-2 text-[11px] text-muted-foreground">
                      {getStreamPhaseLabel(streamPhase)}
                    </span>
                  </div>
                </motion.div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-border/40 bg-background/60 p-3 backdrop-blur-md">
              <form
                className="relative flex items-center gap-2"
                onSubmit={handleSubmit}
              >
                <textarea
                  ref={messageInputRef}
                  value={message}
                  onChange={handleMessageChange}
                  onKeyDown={handleMessageKeyDown}
                  placeholder={`Message ${currentAgent.name}...`}
                  rows={1}
                  className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-border/40 bg-background/50 px-4 py-2.5 text-sm leading-5 outline-none transition-[height,border-color,background-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background focus:ring-2 focus:ring-primary/10"
                  disabled={isSending}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:shadow-primary/25"
                  disabled={!message.trim() || isSending}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleOpen}
        className={cn(
          "group relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full shadow-2xl transition-all duration-300",
          isOpen
            ? "rotate-90 bg-destructive text-destructive-foreground"
            : "bg-primary text-primary-foreground hover:shadow-primary/25",
        )}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        aria-expanded={isOpen}
      >
        <span className="absolute inset-0 -z-10 rounded-full bg-inherit opacity-20 blur-xl transition-opacity duration-300 group-hover:opacity-40" />
        {isOpen ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <MessageSquare className="h-6 w-6" />
        )}
      </motion.button>
    </div>
  );
}
