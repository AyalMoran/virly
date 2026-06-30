import type { Meta, StoryObj } from "@storybook/react-vite";
import { TransferPage } from "../TransferPage";
import { withAuth } from "../../../../.storybook/decorators";

/**
 * The transfer flow page. Renders the editable cheque (form step); the
 * review/success gate steps require interaction. NOTE: the cheque number is
 * randomized and the issue date is `new Date()`, so this story is not fully
 * pixel-deterministic — the deterministic gate states live in
 * "Transfers/TransferCheque".
 */
const meta = {
  title: "Transfers/TransferPage",
  component: TransferPage,
  parameters: { layout: "fullscreen" },
  decorators: [withAuth],
} satisfies Meta<typeof TransferPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
