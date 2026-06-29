import { maskEmailsInText, sanitizeMessagesForLlm } from "../llm.js";

describe("maskEmailsInText", () => {
  test("masks a single email in plain text", () => {
    const result = maskEmailsInText("Contact alice@example.com for more info.");
    expect(result).toBe("Contact a***@example.com for more info.");
  });

  test("masks multiple emails in the same text", () => {
    const result = maskEmailsInText("From bob@example.com to charlie@test.org");
    expect(result).toBe("From b***@example.com to c***@test.org");
  });

  test("returns text unchanged when no email is present", () => {
    const text = "No email address here, just plain words.";
    expect(maskEmailsInText(text)).toBe(text);
  });

  test("masks emails with uppercase letters (preserves original casing in output)", () => {
    const result = maskEmailsInText("Email: Alice@Example.COM is valid");
    // maskEmail keeps the first character of the local part and the domain as-is
    expect(result).toBe("Email: A***@Example.COM is valid");
  });

  test("returns empty string unchanged", () => {
    expect(maskEmailsInText("")).toBe("");
  });

  test("masks an email at the beginning of text", () => {
    const result = maskEmailsInText("alice@foo.com is the contact");
    expect(result).toBe("a***@foo.com is the contact");
  });

  test("masks an email at the end of text", () => {
    const result = maskEmailsInText("Please contact alice@foo.com");
    expect(result).toBe("Please contact a***@foo.com");
  });

  test("masks email with subdomain", () => {
    const result = maskEmailsInText("user@mail.example.org is here");
    expect(result).toBe("u***@mail.example.org is here");
  });

  test("handles email with plus sign in local part", () => {
    const result = maskEmailsInText("user+tag@example.com sent a message");
    expect(result).toBe("u***@example.com sent a message");
  });

  test("handles email with dots in local part", () => {
    const result = maskEmailsInText("first.last@example.com is the address");
    expect(result).toBe("f***@example.com is the address");
  });
});

describe("sanitizeMessagesForLlm", () => {
  test("masks emails in assistant messages", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: "I sent money to alice@example.com on your behalf"
      }
    ];
    const result = sanitizeMessagesForLlm(messages);
    expect(result[0].content).toBe("I sent money to a***@example.com on your behalf");
    expect(result[0].role).toBe("assistant");
  });

  test("does NOT mask emails in user messages", () => {
    const messages = [
      {
        role: "user" as const,
        content: "Send 100 ILS to alice@example.com please"
      }
    ];
    const result = sanitizeMessagesForLlm(messages);
    expect(result[0].content).toBe("Send 100 ILS to alice@example.com please");
  });

  test("handles mixed user and assistant messages correctly", () => {
    const messages = [
      { role: "user" as const, content: "Send to alice@example.com" },
      { role: "assistant" as const, content: "Preparing for alice@example.com" },
      { role: "user" as const, content: "Also send to bob@example.com" },
      { role: "assistant" as const, content: "And now bob@example.com too" }
    ];
    const result = sanitizeMessagesForLlm(messages);
    expect(result[0].content).toBe("Send to alice@example.com");
    expect(result[1].content).toBe("Preparing for a***@example.com");
    expect(result[2].content).toBe("Also send to bob@example.com");
    expect(result[3].content).toBe("And now b***@example.com too");
  });

  test("returns empty array for empty input", () => {
    expect(sanitizeMessagesForLlm([])).toStrictEqual([]);
  });

  test("preserves createdAt field from StoredChatMessage", () => {
    const createdAt = new Date("2024-01-01T00:00:00Z");
    const messages = [
      { role: "user" as const, content: "hello", createdAt }
    ];
    const result = sanitizeMessagesForLlm(messages);
    expect(result[0].createdAt).toStrictEqual(createdAt);
  });

  test("preserves all fields from user messages", () => {
    const messages = [
      {
        role: "user" as const,
        content: "Send to alice@example.com",
        createdAt: new Date("2024-06-01T12:00:00Z")
      }
    ];
    const result = sanitizeMessagesForLlm(messages);
    expect(result[0]).toStrictEqual(messages[0]);
  });

  test("does not mutate input messages", () => {
    const originalContent = "I transferred to alice@example.com";
    const messages = [{ role: "assistant" as const, content: originalContent }];
    sanitizeMessagesForLlm(messages);
    expect(messages[0].content).toBe(originalContent);
  });

  test("handles assistant message with no emails unchanged except masking attempt", () => {
    const messages = [
      { role: "assistant" as const, content: "Your balance is 500 ILS" }
    ];
    const result = sanitizeMessagesForLlm(messages);
    expect(result[0].content).toBe("Your balance is 500 ILS");
  });
});
