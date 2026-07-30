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
  {
    id: "launch-resource-shortfall",
    description: "A launch scope needs more design capacity than Operations can supply.",
    input: {
      title: "Prepare launch creative",
      objective: "Finish all campaign assets before brand review.",
      successMetric: "All approved assets ready on time",
      createdBy: "Mina",
      sources: [
        { type: "Notion", title: "Creative plan", author: "Creative lead", content: "The launch needs 4 designers to finish on time.", authorityLevel: 4 },
        { type: "Slack", title: "Staffing update", author: "Operations", content: "Only 2 designers are available this week.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: ["Resource conflict"],
  },
  {
    id: "public-release-authority-gap",
    description: "A public action requires approval but no authorized approver is named.",
    input: {
      title: "Publish the launch announcement",
      objective: "Prepare a safe public launch announcement.",
      successMetric: "One correctly approved announcement",
      createdBy: "Ari",
      sources: [
        { type: "Email", title: "Executive instruction", author: "Executive office", content: "The announcement cannot be published without explicit approval.", authorityLevel: 5 },
        { type: "Notion", title: "Launch checklist", author: "Growth", content: "The draft is ready, but no approver or approval lifetime is assigned.", authorityLevel: 3 },
      ],
    },
    expectedConflictTypes: ["Authority conflict"],
  },
  {
    id: "ads-payment-dependency",
    description: "The paid launch depends on an advertising account that has no payment method.",
    input: {
      title: "Launch a paid acquisition campaign",
      objective: "Activate paid distribution after all account dependencies are verified.",
      successMetric: "Campaign ready without a failed launch",
      createdBy: "Jules",
      sources: [
        { type: "Ads", title: "Campaign plan", author: "Growth", content: "The launch needs the Meta Ads campaign to be activated.", authorityLevel: 4 },
        { type: "Ads", title: "Account status", author: "Ads administrator", content: "The advertising account is missing a verified payment method.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: ["Dependency conflict"],
  },
];
