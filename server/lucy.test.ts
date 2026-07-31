import { describe, expect, it } from "vitest";
import { fallbackLucyTurn, type LucyMemory } from "./lucy";
import { hasRequiredLucyInputs } from "../shared/lucy";

const empty: LucyMemory = {
  name: "",
  title: "",
  department: "Other",
  objective: "",
  constraints: "",
  collaborators: [],
  successMetric: "",
};

describe("Agent Lucy fallback interview", () => {
  it("turns a natural role answer into identity context without a form", () => {
    const reply = fallbackLucyTurn({ locale: "zh-TW", phase: "identity", message: "我是財務，負責預算核准", memory: empty });
    expect(reply.nextPhase).toBe("objective");
    expect(reply.memory.department).toBe("Finance");
    expect(reply.memory.name).toBe("");
  });

  it("keeps a stated English name separate from the executive role", () => {
    const reply = fallbackLucyTurn({ locale: "en", phase: "identity", message: "I'm Maya, the CEO and final decision maker.", memory: empty });
    expect(reply.memory.name).toBe("Maya");
    expect(reply.memory.department).toBe("Executive");
  });

  it("extracts teammate roles from the boundary conversation", () => {
    const reply = fallbackLucyTurn({ locale: "en", phase: "context", message: "Engineering and Design contribute; the CEO approves launch and Finance approves spend.", memory: { ...empty, objective: "Launch the product in two weeks" } });
    expect(reply.nextPhase).toBe("success");
    expect(reply.memory.collaborators).toEqual(expect.arrayContaining(["Engineering", "Design", "CEO", "Finance"]));
    expect(reply.memory.constraints).toContain("CEO approves launch");
  });

  it("reaches ready only after a concrete definition of done", () => {
    const reply = fallbackLucyTurn({ locale: "en", phase: "success", message: "Launch on time with every owner signed off", memory: { ...empty, objective: "Launch the product in two weeks", constraints: "CEO approval required" } });
    expect(reply.nextPhase).toBe("ready");
    expect(reply.memory.successMetric).toBe("Launch on time with every owner signed off");
    expect(reply.modelUsed).toBe(false);
  });

  it("accepts concise CJK objectives offered by Lucy's own quick replies", () => {
    expect(hasRequiredLucyInputs({
      objective: "兩週內推出新產品",
      constraints: "發布前 CEO 要核准",
      successMetric: "準時發布且所有負責人 sign off",
    })).toBe(true);
  });
});
