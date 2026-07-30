import type { ConflictType, CreateMissionInput } from "../../shared/domain";

export type MissionEvalCase = {
  id: string;
  description: string;
  input: CreateMissionInput;
  expectedConflictTypes: ConflictType[];
};

export const missionEvalCases: MissionEvalCase[] = [
  {
    id: "launch-approval-date",
    description: "A public launch is scheduled before mandatory brand review.",
    input: {
      title: "Launch the Taipei campaign",
      objective: "Launch by 8 月 12 日 and acquire 40 paid registrations.",
      successMetric: "40 paid registrations",
      createdBy: "Jennifer",
      sources: [
        { type: "Slack", title: "Launch channel", author: "Growth lead", content: "The campaign must launch on 8 月 12 日.", authorityLevel: 4 },
        { type: "Calendar", title: "Brand review", author: "Operations", content: "Mandatory brand approval review is scheduled for 8 月 14 日.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: ["Hard conflict"],
  },
  {
    id: "refund-chargeback",
    description: "Support promises a refund while Finance requires the chargeback path to remain open.",
    input: {
      title: "Resolve a customer payment incident",
      objective: "Resolve the incident without duplicate financial action.",
      successMetric: "One verified resolution and zero duplicate refunds",
      createdBy: "Nina",
      sources: [
        { type: "Slack", title: "Support escalation", author: "Support lead", content: "The support team promises a full refund today.", authorityLevel: 3 },
        { type: "Email", title: "Finance review", author: "Finance lead", content: "The chargeback review must remain open; no refund may be issued while it is active.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: ["Policy conflict"],
  },
  {
    id: "client-scope-version",
    description: "A client changes the approved delivery scope after an agent has started drafting.",
    input: {
      title: "Deliver the client launch package",
      objective: "Ship only the currently approved launch package.",
      successMetric: "Client accepts one final package without rework",
      createdBy: "Lee",
      sources: [
        { type: "Notion", title: "Approved scope v2", author: "Account lead", content: "The approved package contains one landing page and three social posts.", authorityLevel: 4 },
        { type: "Email", title: "Client scope change", author: "Client", content: "Replace the landing page with an email sequence and do not deliver social posts.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: ["Version conflict"],
  },
  {
    id: "procurement-security-gate",
    description: "Procurement wants to purchase before the mandatory security review is complete.",
    input: {
      title: "Purchase a customer-data platform",
      objective: "Sign the vendor by 9 月 3 日 without bypassing company security policy.",
      successMetric: "Approved vendor contract within budget",
      createdBy: "Omar",
      sources: [
        { type: "Meeting note", title: "Procurement decision", author: "Procurement", content: "The vendor contract must be signed on 9 月 3 日 to keep the discount.", authorityLevel: 4 },
        { type: "Calendar", title: "Security review", author: "Security", content: "Mandatory security approval review is scheduled for 9 月 5 日.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: ["Hard conflict"],
  },
];
