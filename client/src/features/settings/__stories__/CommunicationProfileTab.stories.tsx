import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { CommunicationProfileTab } from "../CommunicationProfileTab";

const loaded = {
  formality: null,
  verbosity: { value: "brief", provenance: "learned", updatedAt: "2026-07-01T00:00:00.000Z" },
  complexity: { value: "simple", provenance: "seeded", updatedAt: "2026-07-01T00:00:00.000Z" },
  humor: null,
  pace: null,
  memory: "- prefers short answers\n- interested in loan options for soldiers",
};

const empty = {
  formality: null,
  verbosity: null,
  complexity: null,
  humor: null,
  pace: null,
  memory: "",
};

const meta: Meta<typeof CommunicationProfileTab> = {
  title: "Dashboard/CommunicationProfileTab",
  component: CommunicationProfileTab,
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/accounts/communication-profile", () =>
          HttpResponse.json({ communicationProfile: loaded })
        ),
        http.put("*/api/accounts/communication-profile", () =>
          HttpResponse.json({ communicationProfile: loaded })
        ),
        http.post("*/api/accounts/communication-profile/reset", () =>
          HttpResponse.json({ communicationProfile: empty })
        ),
      ],
    },
  },
};

export default meta;

export const Default: StoryObj<typeof CommunicationProfileTab> = {};
