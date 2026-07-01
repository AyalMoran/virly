import { detectExplicitSignal, extractCommunicationSignal } from "../communicationProfileLearn.js";
import type { ChatOpenAI } from "@langchain/openai";

describe("detectExplicitSignal", () => {
  it("returns null for an ordinary banking message", () => {
    expect(detectExplicitSignal("what is my balance?")).toBeNull();
    expect(detectExplicitSignal("send 50 to alex")).toBeNull();
  });
  it("maps explicit statements to dials", () => {
    expect(detectExplicitSignal("keep it short please")).toEqual({ verbosity: "brief" });
    expect(detectExplicitSignal("stop with the jokes")).toEqual({ humor: "none" });
    expect(detectExplicitSignal("please keep it simple")).toEqual({ complexity: "simple" });
  });
});

describe("extractCommunicationSignal", () => {
  const stub = (json: string) => ({ invoke: async () => ({ content: json }) }) as unknown as ChatOpenAI;
  const throwing = { invoke: async () => { throw new Error("no key"); } } as unknown as ChatOpenAI;

  it("returns a clamped update from the model output", async () => {
    const out = await extractCommunicationSignal(stub('{"verbosity":"detailed","appendMemory":"interested in loans for soldiers"}'), "tell me about soldier loans", "Here are the options.");
    expect(out).toEqual({ verbosity: "detailed", appendMemory: "interested in loans for soldiers" });
  });

  it("drops a personality judgment the model returns", async () => {
    const out = await extractCommunicationSignal(stub('{"appendMemory":"the user seems impatient and not very smart"}'), "hi", "hello");
    expect(out?.appendMemory).toBeUndefined();
  });

  it("returns null on model failure", async () => {
    expect(await extractCommunicationSignal(throwing, "hi", "hello")).toBeNull();
  });
});
