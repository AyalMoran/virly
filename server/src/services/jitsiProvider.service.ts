import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type {
  VideoSessionProvider,
  VideoSessionType
} from "../repositories/types.js";
import type { UserRole } from "../models/User.js";

export type VideoJoinActorKind = "user" | "agent";

export type CreateVideoJoinConfigInput = {
  sessionId: string;
  sessionType: VideoSessionType;
  roomName: string;
  actorId: string;
  actorRole: UserRole;
  actorKind: VideoJoinActorKind;
  displayName: string;
  email?: string | null;
};

export type VideoJoinConfig = {
  provider: VideoSessionProvider;
  domain: string;
  roomName: string;
  appId?: string;
  jwt?: string;
  configOverwrite: {
    prejoinPageEnabled: boolean;
    disableDeepLinking: boolean;
  };
  interfaceConfigOverwrite: {
    SHOW_JITSI_WATERMARK: boolean;
  };
  expiresAt: string;
};

function getFullRoomName(roomName: string) {
  if (config.video.provider === "jitsi-jaas" && config.video.jitsi.appId) {
    return `${config.video.jitsi.appId}/${roomName}`;
  }

  return roomName;
}

function createJitsiJwt(input: CreateVideoJoinConfigInput, expiresAtSeconds: number) {
  const { privateKey, keyId, audience, issuer, subject } = config.video.jitsi;
  if (!privateKey) {
    throw new Error("Jitsi JWT signing is not configured.");
  }
  const tokenIssuer =
    issuer ??
    (config.video.provider === "jitsi-jaas"
      ? "chat"
      : config.video.jitsi.appId ?? "virly");
  const tokenSubject =
    subject ??
    (config.video.provider === "jitsi-jaas"
      ? config.video.jitsi.appId ?? config.video.jitsi.domain
      : config.video.jitsi.domain);
  const tokenKeyId =
    config.video.provider === "jitsi-jaas" &&
    keyId &&
    config.video.jitsi.appId &&
    !keyId.includes("/")
      ? `${config.video.jitsi.appId}/${keyId}`
      : keyId;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const moderator =
    input.actorRole === "admin" ||
    input.actorRole === "support_manager" ||
    input.actorKind === "agent";

  return jwt.sign(
    {
      aud: audience,
      iss: tokenIssuer,
      sub: tokenSubject,
      room: input.roomName,
      nbf: nowSeconds - 10,
      exp: expiresAtSeconds,
      context: {
        user: {
          id: input.actorId,
          name: input.displayName,
          ...(input.email ? { email: input.email } : {}),
          moderator
        },
        features: {
          livestreaming: false,
          recording: false,
          transcription: false
        },
        virly: {
          sessionId: input.sessionId,
          sessionType: input.sessionType,
          actorRole: input.actorRole,
          actorKind: input.actorKind
        }
      }
    },
    privateKey,
    {
      algorithm: "RS256",
      ...(tokenKeyId ? { keyid: tokenKeyId } : {})
    }
  );
}

export function createVideoJoinConfig(
  input: CreateVideoJoinConfigInput
): VideoJoinConfig {
  const expiresAtSeconds =
    Math.floor(Date.now() / 1000) + config.video.jitsi.tokenTtlSeconds;
  const jwtToken =
    config.video.provider === "jitsi-jaas" ||
    config.video.provider === "jitsi-self-hosted"
      ? createJitsiJwt(input, expiresAtSeconds)
      : undefined;

  return {
    provider: config.video.provider,
    domain: config.video.jitsi.domain,
    roomName: getFullRoomName(input.roomName),
    ...(config.video.jitsi.appId ? { appId: config.video.jitsi.appId } : {}),
    ...(jwtToken ? { jwt: jwtToken } : {}),
    configOverwrite: {
      prejoinPageEnabled: false,
      disableDeepLinking: true
    },
    interfaceConfigOverwrite: {
      SHOW_JITSI_WATERMARK: false
    },
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString()
  };
}
