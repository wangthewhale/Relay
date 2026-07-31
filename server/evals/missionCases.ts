import type { ConflictType, CreateMissionInput } from "../../shared/domain";

export type MissionEvalCase = {
  id: string;
  description: string;
  input: CreateMissionInput;
  expectedConflictTypes: ConflictType[];
  expectedBlockingConflictTypes?: ConflictType[];
  minimumReferencedAuthority?: number;
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
    minimumReferencedAuthority: 5,
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
    minimumReferencedAuthority: 5,
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
    minimumReferencedAuthority: 5,
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
    minimumReferencedAuthority: 5,
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
    minimumReferencedAuthority: 5,
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
    minimumReferencedAuthority: 5,
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
    minimumReferencedAuthority: 5,
  },
  {
    id: "aligned-review-before-launch",
    description: "A brand review before launch must not create a blocking date conflict.",
    input: {
      title: "Publish an approved launch",
      objective: "Review on 8 月 10 日 and launch on 8 月 12 日.", successMetric: "Launch on time", createdBy: "Ada",
      sources: [
        { type: "Calendar", title: "Brand review", author: "Brand lead", content: "Mandatory brand approval review is scheduled for 8 月 10 日.", authorityLevel: 5 },
        { type: "Slack", title: "Launch date", author: "Growth lead", content: "The campaign must launch on 8 月 12 日.", authorityLevel: 4 },
      ],
    },
    expectedConflictTypes: [], expectedBlockingConflictTypes: [],
  },
  {
    id: "sufficient-design-capacity",
    description: "Verified capacity above the requirement must not be blocked.",
    input: {
      title: "Prepare launch assets", objective: "Finish the creative package this week.", successMetric: "Assets ready", createdBy: "Mia",
      sources: [
        { type: "Notion", title: "Creative plan", author: "Creative lead", content: "The launch needs 2 designers to finish on time.", authorityLevel: 4 },
        { type: "Slack", title: "Staffing", author: "Operations", content: "4 designers are available this week.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: [], expectedBlockingConflictTypes: [],
  },
  {
    id: "same-budget-two-sources",
    description: "Two sources agreeing on the same budget must not look like a version conflict.",
    input: {
      title: "Approve campaign budget", objective: "Run within NT$30,000.", successMetric: "Stay within budget", createdBy: "Noah",
      sources: [
        { type: "Notion", title: "Budget", author: "Finance", content: "Campaign budget limit is NT$30,000.", authorityLevel: 5 },
        { type: "Email", title: "Budget confirmation", author: "CEO", content: "The approved budget is NT$30,000 maximum.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: [], expectedBlockingConflictTypes: [],
  },
  {
    id: "ads-payment-present",
    description: "A verified payment method must not trigger a dependency blocker.",
    input: {
      title: "Prepare paid campaign", objective: "Prepare the paid campaign after account checks.", successMetric: "Draft ready", createdBy: "Jae",
      sources: [
        { type: "Ads", title: "Campaign plan", author: "Growth", content: "The launch needs a Meta Ads campaign draft.", authorityLevel: 4 },
        { type: "Ads", title: "Account status", author: "Billing admin", content: "A verified payment method is available.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: [], expectedBlockingConflictTypes: [],
  },
  {
    id: "audience-policy-satisfied",
    description: "A source confirming exclusions are applied must not create an audience blocker.",
    input: {
      title: "Prepare campaign audience", objective: "Reach only new prospects.", successMetric: "Zero members contacted", createdBy: "Lin",
      sources: [
        { type: "Slack", title: "Audience policy", author: "Growth", content: "Do not promote to existing members.", authorityLevel: 5 },
        { type: "CRM", title: "Audience check", author: "CRM owner", content: "The current campaign audience contains new leads only.", authorityLevel: 4 },
      ],
    },
    expectedConflictTypes: [], expectedBlockingConflictTypes: [],
  },
  {
    id: "launch-budget-version-drift",
    description: "Finance and Growth hold two incompatible launch budget ceilings.",
    input: {
      title: "Prepare launch budget", objective: "Prepare a current campaign budget.", successMetric: "One approved ceiling", createdBy: "Tara",
      sources: [
        { type: "Notion", title: "Old launch budget", author: "Growth", content: "Campaign budget limit is NT$18,000.", authorityLevel: 2 },
        { type: "Email", title: "Finance approval", author: "Finance lead", content: "The approved budget is NT$26,000 maximum.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: ["Version conflict"], minimumReferencedAuthority: 5,
  },
  {
    id: "writer-capacity-shortfall",
    description: "The content launch needs more writers than the team has available.",
    input: {
      title: "Write launch sequence", objective: "Finish the content sequence this week.", successMetric: "All copy reviewed", createdBy: "Sol",
      sources: [
        { type: "Notion", title: "Content plan", author: "Growth", content: "The launch requires 5 writers to finish on time.", authorityLevel: 4 },
        { type: "Slack", title: "Capacity", author: "Operations", content: "Only 2 writers are available this week.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: ["Resource conflict"], minimumReferencedAuthority: 5,
  },
  {
    id: "taipei-audience-policy-violation",
    description: "A campaign exclusion conflicts with the actual CRM audience snapshot.",
    input: {
      title: "Build Taipei launch audience", objective: "Reach new prospects without contacting existing members.", successMetric: "Zero existing members contacted", createdBy: "Ivy",
      sources: [
        { type: "Slack", title: "Audience policy", author: "CEO", content: "Do not promote to existing members.", authorityLevel: 5 },
        { type: "CRM", title: "Audience snapshot", author: "CRM owner", content: "The current audience contains existing members.", authorityLevel: 4 },
      ],
    },
    expectedConflictTypes: ["Policy conflict"], minimumReferencedAuthority: 5,
  },
  {
    id: "launch-date-after-review",
    description: "A launch after its mandatory review is a valid sequence.",
    input: {
      title: "Release approved campaign", objective: "Complete the approved release sequence.", successMetric: "Release on time", createdBy: "Bo",
      sources: [
        { type: "Calendar", title: "Approval review", author: "Brand", content: "Mandatory brand approval review is scheduled for 9 月 2 日.", authorityLevel: 5 },
        { type: "Slack", title: "Release date", author: "Growth", content: "The campaign must launch on 9 月 4 日.", authorityLevel: 4 },
      ],
    },
    expectedConflictTypes: [], expectedBlockingConflictTypes: [],
  },
  {
    id: "budget-format-equivalence",
    description: "Equivalent comma formatting must not create budget drift.",
    input: {
      title: "Confirm launch spend", objective: "Use the approved launch ceiling.", successMetric: "No budget variance", createdBy: "Aya",
      sources: [
        { type: "Notion", title: "Budget", author: "Finance", content: "Campaign budget limit is NT$25,000.", authorityLevel: 5 },
        { type: "Email", title: "Confirmation", author: "CEO", content: "The approved budget is TWD 25000 maximum.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: [], expectedBlockingConflictTypes: [],
  },
  {
    id: "engineering-capacity-sufficient",
    description: "A team with spare engineering capacity must not be blocked.",
    input: {
      title: "Prepare release integration", objective: "Finish release integration this sprint.", successMetric: "Integration ready", createdBy: "Kai",
      sources: [
        { type: "Notion", title: "Release plan", author: "Engineering", content: "The release needs 3 engineers to finish on time.", authorityLevel: 4 },
        { type: "Slack", title: "Staffing", author: "Engineering manager", content: "5 engineers are available this sprint.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: [], expectedBlockingConflictTypes: [],
  },
  {
    id: "customer-refund-path-aligned",
    description: "Two sources agreeing on a refund path must not create a policy collision.",
    input: {
      title: "Resolve refund request", objective: "Resolve one verified refund request.", successMetric: "One settlement path", createdBy: "Uma",
      sources: [
        { type: "Slack", title: "Support", author: "Support", content: "Support will issue a refund after Finance approval.", authorityLevel: 3 },
        { type: "Email", title: "Finance approval", author: "Finance", content: "The refund is approved and may be issued today.", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: [], expectedBlockingConflictTypes: [],
  },
  {
    id: "ads-payment-missing-zh",
    description: "A Chinese advertising account snapshot identifies a missing payment dependency.",
    input: {
      title: "啟動廣告", objective: "完成已核准的付費投放準備。", successMetric: "廣告帳號可安全啟動", createdBy: "Lena",
      sources: [
        { type: "Ads", title: "投放計畫", author: "Growth", content: "這次 Launch 需要啟動 Meta Ads 廣告活動。", authorityLevel: 4 },
        { type: "Ads", title: "帳號狀態", author: "廣告管理員", content: "廣告帳號缺少已驗證付款方式，目前無法發布。", authorityLevel: 5 },
      ],
    },
    expectedConflictTypes: ["Dependency conflict"], minimumReferencedAuthority: 5,
  },
];
