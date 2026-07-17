const occupations = [
  {
    id: "ict-business-analyst",
    title: "ICT Business Analyst",
    code: "ANZSCO 261111",
    family: "Business & ICT",
    entry: "Graduate to early career",
    signal: "Strong demand",
    studentFriendly: true,
    shortage: true,
    summary:
      "Bridges business needs and technology delivery through requirements, stakeholder analysis, process modelling, and solution validation.",
    tasks:
      "Works with business stakeholders to identify problems, objectives, and operational requirements; Elicits, analyses, documents, and validates business and system requirements; Models current-state and future-state business processes, data flows, and user journeys; Translates requirements into user stories, acceptance criteria, functional specifications, and backlog items; Assesses solution options, risks, dependencies, and impacts on people, processes, and systems; Facilitates workshops, interviews, playback sessions, and sign-off meetings; Supports testing, implementation, change readiness, and benefits realisation activities",
    majorSkills: ["Stakeholder communication", "Requirements analysis", "Process modelling"],
    skills: [
      ["Oral communication", 8, "Core competency for workshops, discovery, and business alignment."],
      ["Writing", 7, "Clear requirements, acceptance criteria, and decision records."],
      ["Problem solving", 8, "Frames ambiguous business problems into workable solution options."],
      ["Planning and organising", 7, "Keeps analysis, delivery, and stakeholder milestones aligned."],
      ["Stakeholder communication", 8, "Major skill: interviews, expectation management, and sign-off."],
      ["Requirements analysis", 8, "Major skill: elicit, prioritise, document, and validate needs."],
      ["Process modelling", 7, "Maps current and future state workflows."],
      ["SQL", 5, "Useful minor skill for querying operational data."],
      ["Jira", 5, "Technology tool used for backlog and delivery tracking."]
    ]
  },
  {
    id: "data-analyst",
    title: "Data Analyst",
    code: "JSA / ASC aligned",
    family: "Data & Analytics",
    entry: "Graduate to early career",
    signal: "Growing demand",
    studentFriendly: true,
    shortage: true,
    summary:
      "Turns raw data into reliable analysis, dashboards, and recommendations for operational or strategic decisions.",
    tasks:
      "Collects, cleans, validates, and transforms data from operational and business systems; Writes queries and builds repeatable analysis workflows; Explores data to identify trends, anomalies, risks, and opportunities; Builds dashboards, reports, and visualisations for business stakeholders; Documents assumptions, definitions, limitations, and data quality issues; Communicates findings and recommendations through written summaries and presentations",
    majorSkills: ["SQL", "Data storytelling", "Dashboarding"],
    skills: [
      ["Numeracy", 8, "Core competency for quantitative reasoning and statistical interpretation."],
      ["Digital engagement", 8, "Works confidently with data platforms and analytical tools."],
      ["Problem solving", 7, "Defines the right question before choosing the method."],
      ["Writing", 6, "Documents assumptions, limitations, and findings."],
      ["SQL", 8, "Major skill: joins, aggregation, validation, and reusable queries."],
      ["Excel", 7, "Major tool for modelling, cleaning, and analysis handoff."],
      ["Power BI", 7, "Major tool for dashboards and stakeholder reporting."],
      ["Python", 6, "Minor skill for automation and repeatable analysis."],
      ["Data storytelling", 7, "Translates evidence into decisions."]
    ]
  },
  {
    id: "software-developer",
    title: "Developer Programmer",
    code: "ANZSCO 261312",
    family: "Software & Engineering",
    entry: "Graduate to mid career",
    signal: "Priority signal",
    studentFriendly: true,
    shortage: true,
    summary:
      "Builds, tests, documents, and maintains software applications according to user needs and technical standards.",
    tasks:
      "Interprets user requirements and technical specifications; Designs, writes, tests, debugs, and maintains application code; Reviews code and contributes to shared engineering standards; Integrates software with APIs, databases, and third-party services; Documents technical decisions, deployment notes, and release changes; Diagnoses production issues and improves application reliability",
    majorSkills: ["Programming", "Testing", "System design"],
    skills: [
      ["Digital engagement", 8, "Uses technical environments, repositories, and development tools."],
      ["Problem solving", 8, "Debugs complex issues and breaks down implementation work."],
      ["Learning", 7, "Keeps up with frameworks, libraries, and development practices."],
      ["Teamwork", 7, "Contributes to code reviews and shared delivery practices."],
      ["Programming", 8, "Major skill: writes maintainable application code."],
      ["Testing", 7, "Major skill: unit, integration, and regression testing."],
      ["System design", 6, "Minor-to-major skill for architecture and trade-off decisions."],
      ["Git", 7, "Technology tool for collaboration and release history."],
      ["Cloud basics", 5, "Useful tool skill for deployment-aware development."]
    ]
  },
  {
    id: "accountant-general",
    title: "Accountant (General)",
    code: "ANZSCO 221111",
    family: "Accounting & Finance",
    entry: "Graduate to early career",
    signal: "Stable demand",
    studentFriendly: true,
    shortage: false,
    summary:
      "Prepares and analyses financial records, supports compliance, and helps organisations understand financial performance.",
    tasks:
      "Prepares financial statements, journals, reconciliations, and management reports; Reviews accounting records for accuracy and compliance; Analyses financial performance, variance, cash flow, and budget position; Supports tax, audit, and regulatory reporting processes; Advises stakeholders on financial implications and business decisions; Maintains accounting systems, schedules, evidence trails, and internal controls",
    majorSkills: ["Financial reporting", "Compliance", "Excel"],
    skills: [
      ["Numeracy", 8, "Core competency for reconciliation, analysis, and financial checks."],
      ["Writing", 7, "Prepares reports, memos, and audit-ready documentation."],
      ["Reading", 7, "Interprets standards, policies, contracts, and financial records."],
      ["Planning and organising", 7, "Manages close cycles, deadlines, and evidence trails."],
      ["Financial reporting", 8, "Major skill: statements, journals, and management reporting."],
      ["Compliance", 7, "Major skill: tax, audit, and regulatory awareness."],
      ["Excel", 8, "Major tool for modelling, reconciliation, and schedules."],
      ["Xero", 5, "Technology tool common in small and medium businesses."],
      ["Stakeholder communication", 6, "Explains financial implications to non-finance teams."]
    ]
  },
  {
    id: "marketing-specialist",
    title: "Marketing Specialist",
    code: "ANZSCO 225113",
    family: "Marketing & Growth",
    entry: "Graduate to early career",
    signal: "Competitive market",
    studentFriendly: true,
    shortage: false,
    summary:
      "Develops campaigns, analyses audiences, and supports brand, acquisition, and customer engagement outcomes.",
    tasks:
      "Researches markets, audiences, competitors, channels, and customer behaviour; Develops campaign objectives, positioning, messages, and channel plans; Writes briefs, content plans, copy, and campaign reporting materials; Coordinates creative, media, analytics, and stakeholder inputs; Monitors campaign performance and recommends improvements; Uses analytics tools to evaluate acquisition, engagement, conversion, and brand outcomes",
    majorSkills: ["Campaign planning", "Market research", "Content strategy"],
    skills: [
      ["Oral communication", 7, "Presents campaign ideas and works across teams."],
      ["Writing", 8, "Creates clear copy, briefs, reports, and content assets."],
      ["Initiative and innovation", 7, "Generates campaign concepts and tests ideas."],
      ["Digital engagement", 7, "Uses marketing platforms, analytics, and content tools."],
      ["Campaign planning", 7, "Major skill: objectives, audience, channels, and budgets."],
      ["Market research", 7, "Major skill: competitors, segments, and customer insight."],
      ["Content strategy", 7, "Major skill: messaging, editorial plans, and creative briefs."],
      ["Google Analytics", 6, "Technology tool for acquisition and behaviour analysis."],
      ["Canva or Adobe", 5, "Useful tool skill for production and collaboration."]
    ]
  }
];

const officialOccupations = (window.OCCUPATIONS_OSCA?.occupations || []).map((item) => ({
  id: `osca-${item.code}`,
  title: item.title,
  code: `OSCA ${item.code}`,
  family: item.majorGroup || "OSCA occupation",
  majorGroupCode: item.majorGroupCode,
  majorGroup: item.majorGroup,
  subMajorGroupCode: item.subMajorGroupCode,
  subMajorGroup: item.subMajorGroup,
  minorGroupCode: item.minorGroupCode,
  minorGroup: item.minorGroup,
  unitGroupCode: item.unitGroupCode,
  unitGroup: item.unitGroup,
  entry: item.skillLevel ? `Skill level ${item.skillLevel}` : "OSCA classified",
  signal: "Official OSCA",
  studentFriendly: false,
  shortage: false,
  summary: item.description || item.tasks || "Official ABS OSCA occupation awaiting ASC skill profile mapping.",
  majorSkills: ["Skill inference pending ASC"],
  skills: [],
  tasks: item.tasks,
  description: item.description,
  officialOnly: true
}));

const occupationCatalog = [
  ...occupations,
  ...officialOccupations.filter(
    (official) =>
      !occupations.some((sample) => sample.title.toLowerCase() === official.title.toLowerCase())
  )
];

const baseProfile = {
  "Oral communication": 5,
  Writing: 6,
  Reading: 6,
  Numeracy: 5,
  "Digital engagement": 6,
  Teamwork: 7,
  Learning: 7,
  "Problem solving": 6,
  "Planning and organising": 5,
  "Initiative and innovation": 5,
  Leadership: 5,
  "Food safety": 1,
  "Kitchen operations": 1,
  "Equipment operation": 2,
  "Manual dexterity": 2,
  "Production timing": 2,
  "Quality control": 3,
  "Customer service": 4,
  "Work health and safety": 3,
  "Stakeholder communication": 4,
  "Requirements analysis": 3,
  "Process modelling": 3,
  SQL: 3,
  Jira: 2,
  Excel: 6,
  "Power BI": 3,
  Python: 3,
  "Data storytelling": 4,
  Programming: 5,
  Testing: 4,
  "System design": 3,
  Git: 5,
  "Cloud basics": 2,
  "Financial reporting": 4,
  Compliance: 4,
  Xero: 2,
  "Campaign planning": 4,
  "Market research": 4,
  "Content strategy": 5,
  "Google Analytics": 3,
  "Canva or Adobe": 5
};

const projects = [
  {
    title: "Client Discovery Simulation",
    type: "Virtual project",
    threshold: [["Oral communication", 5]],
    uplift: [["Stakeholder communication", 4, 6], ["Requirements analysis", 3, 5]],
    evidence: "Recorded workshop, stakeholder map, requirements brief"
  },
  {
    title: "Business Process Redesign Sprint",
    type: "Case project",
    threshold: [["Problem solving", 5]],
    uplift: [["Process modelling", 3, 6], ["Writing", 6, 7]],
    evidence: "Current-state map, future-state map, change rationale"
  },
  {
    title: "SQL Reporting Lab",
    type: "Learning project",
    threshold: [["Excel", 4]],
    uplift: [["SQL", 3, 6], ["Data storytelling", 4, 5]],
    evidence: "Query portfolio, QA checklist, business insight memo"
  },
  {
    title: "Dashboard for a Local Employer",
    type: "Internship-lite",
    threshold: [["SQL", 5], ["Power BI", 3]],
    uplift: [["Power BI", 3, 7], ["Stakeholder communication", 4, 6]],
    evidence: "Published dashboard, client feedback, decision summary"
  },
  {
    title: "Software Delivery Studio",
    type: "Portfolio project",
    threshold: [["Programming", 5], ["Git", 4]],
    uplift: [["Testing", 4, 7], ["System design", 3, 5], ["Git", 5, 7]],
    evidence: "Repository, test report, release notes"
  },
  {
    title: "Finance Month-End Practice",
    type: "Simulation",
    threshold: [["Excel", 5], ["Numeracy", 5]],
    uplift: [["Financial reporting", 4, 7], ["Compliance", 4, 6]],
    evidence: "Reconciliation pack, journal notes, variance commentary"
  },
  {
    title: "Campaign Launch Room",
    type: "Virtual internship",
    threshold: [["Writing", 5], ["Content strategy", 4]],
    uplift: [["Campaign planning", 4, 7], ["Google Analytics", 3, 5], ["Market research", 4, 6]],
    evidence: "Campaign brief, audience analysis, post-campaign dashboard"
  }
];

const state = {
  selectedId: occupations[0].id,
  family: "All",
  subMajor: "All",
  visa: "482",
  sort: "fit",
  offerOnly: false,
  search: "",
  studentFriendly: false,
  shortageOnly: false,
  selectedProject: "",
  profile: { ...baseProfile }
};

const adminState = {
  projectTasks: []
};

const el = (id) => document.getElementById(id);

const skillRubric = {
  default: [
    "Recognises the skill in highly familiar situations with direct support.",
    "Performs simple tasks when steps are provided and risk is low.",
    "Applies the skill to routine study or workplace tasks with some guidance.",
    "Handles familiar tasks independently and can explain basic decisions.",
    "Applies the skill across common workplace situations with reliable evidence.",
    "Adapts the skill to varied tasks, constraints, audiences, or tools.",
    "Uses the skill to solve less predictable problems and support others.",
    "Applies the skill in complex, high-stakes, or multi-stakeholder work.",
    "Leads others, improves practice, and handles ambiguity with strong evidence.",
    "Demonstrates expert-level judgement, creates standards, and mentors others."
  ],
  "Oral communication": [
    "Responds to simple spoken instructions in familiar settings.",
    "Gives short factual responses when prompted.",
    "Explains routine information to peers or supervisors.",
    "Participates in familiar discussions and asks clarifying questions.",
    "Communicates clearly in common workplace conversations.",
    "Adapts tone and detail for different audiences.",
    "Facilitates structured discussions and resolves misunderstandings.",
    "Leads stakeholder conversations with competing needs.",
    "Influences decisions in complex or sensitive settings.",
    "Shapes communication standards and coaches others."
  ],
  Writing: [
    "Writes short familiar words or labels.",
    "Completes simple forms or short messages.",
    "Writes routine notes using templates.",
    "Produces clear everyday workplace writing.",
    "Writes structured emails, summaries, and simple reports.",
    "Adapts writing for purpose, audience, and evidence.",
    "Produces persuasive, analytical, or technical documents.",
    "Writes complex documents with clear logic and risk awareness.",
    "Sets documentation standards and reviews others' writing.",
    "Creates high-impact written communication for strategic decisions."
  ],
  "Problem solving": [
    "Identifies obvious issues in familiar tasks.",
    "Follows given steps to resolve simple problems.",
    "Chooses from known options for routine issues.",
    "Breaks familiar problems into steps.",
    "Solves common workplace problems using evidence.",
    "Adapts methods when conditions change.",
    "Diagnoses ambiguous issues and compares options.",
    "Solves complex problems across teams or systems.",
    "Leads problem framing and improves decision processes.",
    "Creates new approaches for novel, high-impact problems."
  ]
};

function rubricForSkill(skill) {
  return skillRubric[skill] || skillRubric.default;
}

function scoreClass(score, target) {
  if (score >= target) return "good";
  if (target - score <= 2) return "warn";
  return "risk";
}

function pct(score) {
  return `${Math.max(0, Math.min(10, score)) * 10}%`;
}

function families() {
  return ["All", ...new Set(occupationCatalog.map((item) => item.family).filter(Boolean))];
}

function subMajorGroups() {
  const filtered = occupationCatalog.filter(
    (item) => state.family === "All" || item.family === state.family
  );
  return ["All", ...new Set(filtered.map((item) => item.subMajorGroup).filter(Boolean))];
}

function migrationMetrics(occupation) {
  const text = [occupation.title, occupation.family, occupation.subMajorGroup, occupation.minorGroup, occupation.unitGroup]
    .join(" ")
    .toLowerCase();
  const codeNum = Number(String(occupation.code).replace(/\D/g, "").slice(-6)) || 0;
  const isICT = /ict|software|cyber|systems|developer|programmer|network|data|database/.test(text);
  const isHealth = /health|nurs|medical|care|clinical|dental|therapy|pharma/.test(text);
  const isTrade = /electrician|plumber|mechanic|carpenter|welder|technician|trade|construction/.test(text);
  const isManager = /manager|chief|director/.test(text);
  const isProfessional = /professional|engineer|analyst|accountant|architect|scientist|teacher/.test(text);
  const visas = new Set();

  if (isICT || isHealth || isTrade || isProfessional) ["482", "186", "190", "491"].forEach((visa) => visas.add(visa));
  if (isICT || isHealth || /engineer|accountant|teacher|actuary|statistician/.test(text)) visas.add("189");
  if (isTrade || isHealth || isManager) visas.add("494");
  if (!visas.size && codeNum % 3 !== 0) ["482", "491"].forEach((visa) => visas.add(visa));
  if (!visas.size) visas.add("190");

  const salary = 62000 + (codeNum % 76000) + (isICT ? 28000 : 0) + (isHealth ? 18000 : 0) + (isManager ? 24000 : 0);

  return {
    visas: [...visas],
    salary,
    offers: 8 + (codeNum % 64),
    inviteScore: null,
    inviteDate: "7 May 2026",
    inviteSource: "Home Affairs SkillSelect previous rounds",
    lastInvited: "Official data required",
    offerSource: "Project hub feed"
  };
}

function relevantProfileSkills() {
  return [
    "Oral communication",
    "Writing",
    "Problem solving",
    "Digital engagement",
    "Teamwork",
    "Numeracy",
    "Leadership",
    "Work health and safety"
  ];
}

function selectedOccupation() {
  return occupationCatalog.find((item) => item.id === state.selectedId) || occupationCatalog[0];
}

function skillLevelTarget(occupation) {
  const level = Number(String(occupation.entry || "").match(/\d/)?.[0] || 3);
  return Math.max(4, Math.min(9, 9 - level));
}

function inferredRequirements(occupation) {
  if (!occupation.officialOnly) return occupation.skills;
  const text = [occupation.title, occupation.family, occupation.subMajorGroup, occupation.minorGroup, occupation.unitGroup]
    .join(" ")
    .toLowerCase();
  const base = skillLevelTarget(occupation);
  let requirements;

  if (/baker|butcher|smallgoods|cook|chef|pastry|food trades|food preparation/.test(text)) {
    requirements = [
      ["Food safety", 8, "Trade-specific requirement inferred from OSCA food preparation occupation."],
      ["Kitchen operations", 8, "Trade-specific production and preparation capability."],
      ["Equipment operation", 7, "Uses ovens, mixers, knives, machinery, or kitchen equipment safely."],
      ["Manual dexterity", 7, "Hands-on preparation, cutting, shaping, portioning, and finishing."],
      ["Production timing", 7, "Coordinates preparation cycles, service timing, and batch quality."],
      ["Quality control", 6, "Checks consistency, presentation, and product standards."],
      ["Work health and safety", 6, "Applies hygiene, handling, and workplace safety practices."]
    ];
  } else if (/manager|chief|director|lead/.test(text)) {
    requirements = [
      ["Leadership", Math.min(10, base + 1), "Inferred management capability requirement."],
      ["Planning and organising", base, "Inferred coordination and delivery requirement."],
      ["Oral communication", base, "Inferred stakeholder communication requirement."],
      ["Problem solving", base, "Inferred operational decision-making requirement."],
      ["Writing", Math.max(4, base - 1), "Inferred reporting and documentation requirement."]
    ];
  } else if (/ict|software|cyber|systems|developer|programmer|data|database/.test(text)) {
    requirements = [
      ["Digital engagement", Math.min(10, base + 1), "Inferred technical digital capability requirement."],
      ["Problem solving", Math.min(10, base + 1), "Inferred technical problem solving requirement."],
      ["Teamwork", base, "Inferred delivery collaboration requirement."],
      ["Writing", Math.max(4, base - 1), "Inferred documentation requirement."],
      ["Learning", base, "Inferred requirement to keep technical capability current."]
    ];
  } else if (/technician|trade|construction|mechanic|electrician|plumber|operator|machinist/.test(text)) {
    requirements = [
      ["Equipment operation", Math.min(10, base + 1), "Trade or technical equipment capability."],
      ["Manual dexterity", base, "Hands-on technical execution."],
      ["Work health and safety", base, "Safety practices and hazard control."],
      ["Quality control", Math.max(5, base - 1), "Checks work against practical standards."],
      ["Problem solving", Math.max(5, base - 1), "Diagnoses practical problems on the job."]
    ];
  } else {
    requirements = [
      ["Problem solving", base, "Inferred general problem solving requirement."],
      ["Oral communication", Math.max(4, base - 1), "Inferred workplace communication requirement."],
      ["Planning and organising", Math.max(4, base - 1), "Inferred workflow management requirement."],
      ["Reading", Math.max(4, base - 1), "Inferred instruction and information processing requirement."],
      ["Learning", Math.max(4, base - 1), "Inferred capability development requirement."]
    ];
  }

  return requirements;
}

function filteredOccupations() {
  const needle = state.search.trim().toLowerCase();
  return occupationCatalog
    .filter((occupation) => {
    const metrics = migrationMetrics(occupation);
    const matchesFamily = state.family === "All" || occupation.family === state.family;
    const matchesSubMajor = state.subMajor === "All" || occupation.subMajorGroup === state.subMajor;
    const matchesVisa = state.visa === "all" || metrics.visas.includes(state.visa);
    const matchesOffer = !state.offerOnly || metrics.offers > 0;
    const matchesStudent = !state.studentFriendly || occupation.studentFriendly;
    const matchesShortage = !state.shortageOnly || occupation.shortage;
    const searchable = [
      occupation.title,
      occupation.code,
      occupation.family,
      occupation.subMajorGroup,
      occupation.minorGroup,
      occupation.unitGroup,
      occupation.summary,
      occupation.majorSkills.join(" "),
      inferredRequirements(occupation).map(([name]) => name).join(" ")
    ]
      .join(" ")
      .toLowerCase();
    return matchesFamily && matchesSubMajor && matchesVisa && matchesOffer && matchesStudent && matchesShortage && (!needle || searchable.includes(needle));
  })
    .sort((a, b) => {
      const metricA = migrationMetrics(a);
      const metricB = migrationMetrics(b);
      if (state.sort === "salary") return metricB.salary - metricA.salary;
      if (state.sort === "invite") return (metricA.inviteScore ?? 999) - (metricB.inviteScore ?? 999);
      if (state.sort === "offers") return metricB.offers - metricA.offers;
      return fitForOccupation(b) - fitForOccupation(a);
    });
}

function fitForOccupation(occupation) {
  const required = inferredRequirements(occupation);
  const achieved = required.reduce((sum, [skill, target]) => {
    const current = state.profile[skill] || 0;
    return sum + Math.min(current / target, 1);
  }, 0);
  return Math.round((achieved / required.length) * 100);
}

function projectRecommendations(requirements) {
  const roleSkillNames = new Set(requirements.map(([skill]) => skill));
  const direct = projects.filter((project) => project.uplift.some(([skill]) => roleSkillNames.has(skill)));
  const generic = [
    {
      title: "Evidence Builder Sprint",
      type: "Project Hub",
      threshold: [["Learning", 3]],
      uplift: requirements
        .slice(0, 3)
        .map(([skill, target]) => [skill, state.profile[skill] || 0, Math.min(target, (state.profile[skill] || 0) + 2)]),
      evidence: "Skill rubric, mentor review, final artefact"
    },
    {
      title: "Workplace Simulation Lab",
      type: "Project Hub",
      threshold: [["Problem solving", 3]],
      uplift: requirements
        .slice(2, 5)
        .map(([skill, target]) => [skill, state.profile[skill] || 0, Math.min(target, (state.profile[skill] || 0) + 2)]),
      evidence: "Scenario completion, supervisor notes, reflection report"
    }
  ];
  return [...direct, ...generic].slice(0, 5).map((project, index) => ({
    ...project,
    duration: project.duration || (index % 2 === 0 ? "2 weeks · 14 hours" : "4 weeks · 24 hours"),
    question:
      project.question ||
      (index % 2 === 0
        ? "Can you produce evidence that closes the highest-priority skill gap?"
        : "Can you complete a workplace-style scenario and pass mentor review?"),
    participants: project.participants || 120 + index * 37,
    reviewed: project.reviewed || 68 + index * 21
  }));
}

function renderFamilyFilters() {
  el("majorSelect").innerHTML = families()
    .map(
      (family) =>
        `<option value="${family}" ${state.family === family ? "selected" : ""}>${family}</option>`
    )
    .join("");

  el("subMajorSelect").innerHTML = subMajorGroups()
    .map(
      (group) =>
        `<option value="${group}" ${state.subMajor === group ? "selected" : ""}>${group}</option>`
    )
    .join("");

  el("visaSelect").value = state.visa;
  el("sortSelect").value = state.sort;
}

function renderProfile() {
  el("profileScores").innerHTML = relevantProfileSkills()
    .map((skill) => {
      const score = state.profile[skill] || 0;
      return `
        <button class="profile-row" data-rubric-skill="${skill}" type="button">
          <div class="row-top">
            <span>${skill}</span>
            <span class="score-readonly">${score}/10</span>
          </div>
          <div class="score-bar"><div class="score-fill" style="width:${pct(score)}"></div></div>
        </button>
      `;
    })
    .join("");
}

function openSkillRubric(skill) {
  el("skillRubricTitle").textContent = skill;
  el("skillRubricIntro").textContent =
    "This is a product rubric aligned to the Australian Skills Classification 10-point capability idea. Final scoring should come from assessed evidence, not self-editing.";
  el("skillRubricGrid").innerHTML = rubricForSkill(skill)
    .map((text, index) => `<div class="rubric-item"><strong>${index + 1}/10</strong><span>${text}</span></div>`)
    .join("");
  el("skillRubricModal").showModal();
}

function openRevaluation() {
  el("revaluationList").innerHTML = relevantProfileSkills()
    .map((skill) => {
      const score = state.profile[skill] || 0;
      return `
        <div class="revaluation-row">
          <label for="score-${skill.replaceAll(" ", "-")}">${skill}</label>
          <input id="score-${skill.replaceAll(" ", "-")}" data-edit-score="${skill}" type="range" min="0" max="10" step="1" value="${score}" />
          <span class="revaluation-value" data-edit-value="${skill}">${score}/10</span>
        </div>
      `;
    })
    .join("");
  el("revaluationModal").showModal();
}

function saveRevaluation() {
  document.querySelectorAll("[data-edit-score]").forEach((input) => {
    state.profile[input.dataset.editScore] = Number(input.value);
  });
  el("revaluationModal").close();
  render();
}

function renderOccupations() {
  const list = filteredOccupations();
  if (!list.some((item) => item.id === state.selectedId) && list.length) {
    state.selectedId = list[0].id;
  }
  el("resultCount").textContent = `${list.length} / ${occupationCatalog.length} occupations`;
  el("occupationList").innerHTML = list
    .map((occupation) => {
      const fit = fitForOccupation(occupation);
      const metrics = migrationMetrics(occupation);
      return `
        <button class="occupation-card ${occupation.id === state.selectedId ? "active" : ""}" data-id="${occupation.id}" type="button">
          <div class="occupation-main">
            <p class="eyebrow">${occupation.code}</p>
            <h3>${occupation.title}</h3>
            <p>${occupation.summary}</p>
          </div>
          <div class="fit-meter" aria-label="${fit}% suitability">
            <div class="fit-number">${fit}%</div>
            <div class="fit-label">suitability</div>
          </div>
          <div class="card-meta">
            <span class="tag major">${occupation.family}</span>
            <span class="tag entry">${occupation.entry}</span>
            ${occupation.shortage ? '<span class="tag priority">priority signal</span>' : ""}
            <span class="tag">${metrics.visas.join(" / ")}</span>
          </div>
          <div class="tag-row">
            ${occupation.majorSkills.map((skill) => `<span class="level-pill">${skill}</span>`).join("")}
          </div>
          <div class="migration-metrics">
            <div class="metric"><span>Salary est.</span><strong>$${Math.round(metrics.salary / 1000)}k</strong></div>
            <div class="metric"><span>Last invited</span><strong>${metrics.lastInvited}</strong><em>Updated ${metrics.inviteDate}</em></div>
            <div class="metric"><span>Open offers</span><strong>${metrics.offers}</strong><em>Project hub feed</em></div>
            <div class="metric"><span>Visa fit</span><strong>${state.visa === "all" ? metrics.visas[0] : state.visa}</strong></div>
          </div>
        </button>
      `;
    })
    .join("");

  if (!list.length) {
    el("occupationList").innerHTML = `<div class="occupation-card"><h3>No matching roles</h3><p>Try removing a filter or searching for a broader skill family.</p></div>`;
  }
}

function renderDetails() {
  const occupation = selectedOccupation();
  const fit = fitForOccupation(occupation);
  const metrics = migrationMetrics(occupation);
  const classificationPath = [
    occupation.majorGroup || occupation.family,
    occupation.subMajorGroup,
    occupation.minorGroup,
    occupation.unitGroup
  ]
    .filter(Boolean)
    .join(" > ");

  el("selectedCode").textContent = occupation.code;
  el("selectedTitle").textContent = occupation.title;
  el("fitScore").textContent = `${fit}% fit`;
  el("detailFamily").textContent = classificationPath || occupation.family;
  el("detailVisas").textContent = metrics.visas.join(" / ");
  el("detailSalary").textContent = `$${Math.round(metrics.salary / 1000)}k`;
  el("detailInvite").textContent = metrics.lastInvited;
  if (document.getElementById("detailOffers")) el("detailOffers").textContent = metrics.offers;
  el("detailEntry").textContent = occupation.entry;

  el("skillRequirements").innerHTML = occupation.skills
    .map(([skill, target, note]) => {
      const current = state.profile[skill] || 0;
      return `
        <div class="skill-row">
          <div class="row-top"><span>${skill}</span><span>target ${target}/10</span></div>
          <div class="score-bar"><div class="score-fill ${scoreClass(current, target)}" style="width:${pct(target)}"></div></div>
          <div class="skill-note">${note}</div>
        </div>
      `;
    })
    .join("");

  const gaps = occupation.skills
    .map(([skill, target]) => {
      const current = state.profile[skill] || 0;
      return { skill, target, current, gap: Math.max(target - current, 0) };
    })
    .sort((a, b) => b.gap - a.gap || b.target - a.target);

  const openGaps = gaps.filter((item) => item.gap > 0).length;
  el("gapSummary").textContent = `${openGaps} gaps`;
  el("gapList").innerHTML = gaps
    .map(
      (item) => `
        <div class="gap-row">
          <div class="row-top">
            <span>${item.skill}</span>
            <span class="gap-number ${item.gap === 0 ? "ok" : ""}">${item.current} → ${item.target}</span>
          </div>
          <div class="score-bar"><div class="score-fill ${scoreClass(item.current, item.target)}" style="width:${pct(item.current)}"></div></div>
          <div class="skill-note">${item.gap === 0 ? "Meets target with current evidence." : `Needs ${item.gap} more evidenced point${item.gap === 1 ? "" : "s"}.`}</div>
        </div>
      `
    )
    .join("");

  const roleSkillNames = new Set(occupation.skills.map(([skill]) => skill));
  const recommended = projects.filter((project) => project.uplift.some(([skill]) => roleSkillNames.has(skill)));
  el("projectList").innerHTML = recommended
    .map((project) => {
      const isUnlocked = project.threshold.every(([skill, min]) => (state.profile[skill] || 0) >= min);
      return `
        <article class="project-card">
          <div>
            <p class="eyebrow">${project.type}</p>
            <h3>${project.title}</h3>
          </div>
          <div class="project-meta">
            <span class="mini-pill">${isUnlocked ? "Unlocked" : "Locked"}</span>
            ${project.threshold.map(([skill, min]) => `<span class="mini-pill">${skill} >= ${min}</span>`).join("")}
          </div>
          <div class="tag-row">
            ${project.uplift
              .filter(([skill]) => roleSkillNames.has(skill))
              .map(([skill, from, to]) => `<span class="tag major">${skill} ${from}→${to}</span>`)
              .join("")}
          </div>
          <div class="skill-note">Evidence: ${project.evidence}</div>
        </article>
      `;
    })
    .join("");
}

function renderOccupationModal() {
  const occupation = selectedOccupation();
  const fit = fitForOccupation(occupation);
  const metrics = migrationMetrics(occupation);
  const classificationPath = [
    occupation.majorGroup || occupation.family,
    occupation.subMajorGroup,
    occupation.minorGroup,
    occupation.unitGroup
  ]
    .filter(Boolean)
    .join(" > ");

  el("modalCode").textContent = occupation.code;
  el("modalTitle").textContent = occupation.title;
  el("modalFit").textContent = `${fit}%`;
  el("modalVisas").textContent = metrics.visas.join(" / ");
  el("modalSalary").textContent = `$${Math.round(metrics.salary / 1000)}k`;
  el("modalInvite").textContent = metrics.lastInvited;
  el("modalOffers").textContent = metrics.offers;
  el("modalEntry").textContent = occupation.entry;
  el("modalClassification").textContent = classificationPath || occupation.family;
  el("modalSkillStatus").textContent = occupation.officialOnly ? "inferred" : "mapped";

  const taskText = occupation.tasks || occupation.description || occupation.summary || "No official task detail imported for this occupation yet.";
  const tasks = String(taskText)
    .split(/\n|;|•| - /)
    .map((task) => task.trim())
    .filter(Boolean)
    .slice(0, 8);
  el("modalTasks").innerHTML = tasks.map((task) => `<div class="task-item">${task}</div>`).join("");

  const requirements = inferredRequirements(occupation);
  const recommendedProjects = projectRecommendations(requirements);
  if (!state.selectedProject || !recommendedProjects.some((project) => project.title === state.selectedProject)) {
    state.selectedProject = recommendedProjects[0]?.title || "";
  }
  const activeProject = recommendedProjects.find((project) => project.title === state.selectedProject);
  const activeUplifts = new Map((activeProject?.uplift || []).map(([skill, from, to]) => [skill, { from, to }]));

  el("modalSkills").innerHTML = requirements
    .map(([skill, target, note]) => {
      const current = state.profile[skill] || 0;
      const delta = current - target;
      const deltaClass = delta >= 0 ? "good" : Math.abs(delta) <= 2 ? "warn" : "risk";
      const deltaText = `${delta >= 0 ? "+" : ""}${delta}`;
      const uplift = activeUplifts.get(skill);
      const highlightFrom = uplift ? Math.min(uplift.from, uplift.to) : 0;
      const highlightTo = uplift ? Math.max(uplift.from, uplift.to) : 0;
      return `
        <div class="skill-row">
          <div class="row-top">
            <span>${skill}</span>
            <span><span class="delta ${deltaClass}">${deltaText}</span> · current ${current} · target ${target}${uplift ? ` · project ${uplift.from}→${uplift.to}` : ""}</span>
          </div>
          <div class="comparison-bar" aria-label="${skill}: current ${current}, target ${target}">
            <div class="target-fill" style="width:${pct(target)}"></div>
            <div class="current-fill ${deltaClass}" style="width:${pct(current)}"></div>
            ${uplift ? `<div class="project-highlight" style="left:${pct(highlightFrom)}; width:${pct(highlightTo - highlightFrom)}"></div>` : ""}
          </div>
          <div class="skill-note">${note}</div>
        </div>
      `;
    })
    .join("");

  el("modalProjects").innerHTML = recommendedProjects
    .map((project) => {
      const active = project.title === state.selectedProject;
      const impacts = project.uplift
        .filter(([skill]) => requirements.some(([requiredSkill]) => requiredSkill === skill))
        .slice(0, 4);
      return `
      <button class="hub-card ${active ? "active" : ""}" data-project-title="${project.title}" type="button">
          <div>
            <p class="eyebrow">${project.type}</p>
            <h3>${project.title}</h3>
          </div>
          <div class="hub-meta">
            <span class="mini-pill">${project.duration}</span>
            <span class="mini-pill">${project.participants} joined</span>
            <span class="mini-pill">${project.reviewed} reviewed</span>
          </div>
          <div class="hub-question">${project.question}</div>
          <div class="hub-impact">
            ${impacts
              .map(
                ([skill, from, to]) => `
                  <div class="impact-row">
                    <div class="impact-top"><span>${skill}</span><strong>${from}→${to}</strong></div>
                    <div class="comparison-bar">
                      <div class="target-fill" style="width:${pct(to)}"></div>
                      <div class="project-highlight" style="left:${pct(Math.min(from, to))}; width:${pct(Math.abs(to - from))}"></div>
                      <div class="current-fill good" style="width:${pct(from)}"></div>
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
          <div class="skill-note">Evidence: ${project.evidence}</div>
        </button>
      `;
    })
    .join("");
}

function render() {
  renderFamilyFilters();
  renderOccupations();
  renderProfile();
}

function bindEvents() {
  el("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  el("majorSelect").addEventListener("change", (event) => {
    state.family = event.target.value;
    state.subMajor = "All";
    render();
  });

  el("subMajorSelect").addEventListener("change", (event) => {
    state.subMajor = event.target.value;
    render();
  });

  el("visaSelect").addEventListener("change", (event) => {
    state.visa = event.target.value;
    render();
  });

  el("sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });

  el("offerOnly").addEventListener("change", (event) => {
    state.offerOnly = event.target.checked;
    render();
  });

  el("themeToggle").addEventListener("click", () => {
    const isDark = document.body.dataset.theme === "dark";
    document.body.dataset.theme = isDark ? "light" : "dark";
    el("themeToggle").textContent = isDark ? "Dark mode" : "Light mode";
  });

  el("adminButton").addEventListener("click", () => {
    el("adminModal").showModal();
  });

  el("closeAdmin").addEventListener("click", () => {
    el("adminModal").close();
  });

  el("adminModal").addEventListener("click", (event) => {
    if (event.target === el("adminModal")) el("adminModal").close();
  });

  el("inviteUpload").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".csv")) {
      const text = await file.text();
      const rows = text.split(/\r?\n/).filter(Boolean).slice(0, 6);
      el("invitePreview").innerHTML = rows.map((row) => `<div>${row}</div>`).join("");
    } else {
      el("invitePreview").textContent = `${file.name} selected. XLSX parsing will be connected in the admin pipeline.`;
    }
  });

  el("taskMatchInput").addEventListener("input", (event) => {
    const needle = event.target.value.trim().toLowerCase();
    if (!needle) {
      el("taskMatchResults").textContent = "Type to match occupations or tasks.";
      return;
    }
    const matches = occupationCatalog
      .filter((occupation) =>
        [occupation.title, occupation.code, occupation.summary, occupation.tasks, occupation.unitGroup]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
      .slice(0, 5);
    el("taskMatchResults").innerHTML = matches
      .map(
        (occupation) =>
          `<button class="match-pill" data-match="${occupation.title}" type="button"><strong>${occupation.title}</strong><br><span>${occupation.code}</span></button>`
      )
      .join("") || "No matches.";
  });

  el("taskMatchResults").addEventListener("click", (event) => {
    const match = event.target.closest("[data-match]");
    if (!match) return;
    el("taskMatchInput").value = match.dataset.match;
  });

  el("addProjectTask").addEventListener("click", () => {
    const task = {
      project: el("adminProjectName").value || "Untitled project",
      cycle: el("adminProjectCycle").value || "2 weeks · 14 hours",
      reviews: el("adminProjectReviews").value || "0",
      question: el("adminProjectQuestion").value || "No objective question yet.",
      occupation: el("taskMatchInput").value || "No occupation matched",
      skill: el("adminSkillName").value || "No skill",
      move: el("adminSkillMove").value || "0→0",
      description: el("adminTaskDescription").value || "No level task description."
    };
    adminState.projectTasks.push(task);
    el("projectTaskList").innerHTML = adminState.projectTasks
      .map(
        (item) =>
          `<div><strong>${item.project}</strong> · ${item.cycle}<br>${item.occupation} · ${item.skill} ${item.move}<br><span>${item.description}</span></div>`
      )
      .join("");
  });

  el("studentFriendly").addEventListener("change", (event) => {
    state.studentFriendly = event.target.checked;
    render();
  });

  el("shortageOnly").addEventListener("change", (event) => {
    state.shortageOnly = event.target.checked;
    render();
  });

  el("occupationList").addEventListener("click", (event) => {
    const card = event.target.closest("[data-id]");
    if (!card) return;
    state.selectedId = card.dataset.id;
    state.selectedProject = "";
    render();
    renderOccupationModal();
    el("occupationModal").showModal();
  });

  el("modalProjects").addEventListener("click", (event) => {
    const card = event.target.closest("[data-project-title]");
    if (!card) return;
    state.selectedProject = card.dataset.projectTitle;
    renderOccupationModal();
  });

  document.querySelector(".detail-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-detail-tab]");
    if (!tab) return;
    document.querySelectorAll(".detail-tab").forEach((item) => item.classList.toggle("active", item === tab));
    document.querySelectorAll(".detail-panel").forEach((panel) => panel.classList.remove("active"));
    el(`${tab.dataset.detailTab}DetailPanel`).classList.add("active");
  });

  el("profileScores").addEventListener("click", (event) => {
    const button = event.target.closest("[data-rubric-skill]");
    if (!button) return;
    openSkillRubric(button.dataset.rubricSkill);
  });

  el("revaluationButton").addEventListener("click", () => {
    openRevaluation();
  });

  el("revaluationList").addEventListener("input", (event) => {
    const input = event.target.closest("[data-edit-score]");
    if (!input) return;
    const value = el("revaluationList").querySelector(`[data-edit-value="${input.dataset.editScore}"]`);
    if (value) value.textContent = `${input.value}/10`;
  });

  el("saveRevaluation").addEventListener("click", saveRevaluation);

  el("cancelRevaluation").addEventListener("click", () => {
    el("revaluationModal").close();
  });

  el("closeRevaluation").addEventListener("click", () => {
    el("revaluationModal").close();
  });

  el("revaluationModal").addEventListener("click", (event) => {
    if (event.target === el("revaluationModal")) el("revaluationModal").close();
  });

  el("closeSkillRubric").addEventListener("click", () => {
    el("skillRubricModal").close();
  });

  el("skillRubricModal").addEventListener("click", (event) => {
    if (event.target === el("skillRubricModal")) el("skillRubricModal").close();
  });

  el("closeModal").addEventListener("click", () => {
    el("occupationModal").close();
  });

  el("occupationModal").addEventListener("click", (event) => {
    if (event.target === el("occupationModal")) el("occupationModal").close();
  });

  el("resetProfile").addEventListener("click", () => {
    state.profile = { ...baseProfile };
    render();
  });

  el("exportPlan").addEventListener("click", () => {
    const occupation = selectedOccupation();
    const gaps = inferredRequirements(occupation)
      .map(([skill, target]) => `${skill}: ${state.profile[skill] || 0}/${target}`)
      .join("\n");
    const text = `Career roadmap: ${occupation.title}\nReference: ${occupation.code}\n\nSkill gaps\n${gaps}`;
    navigator.clipboard?.writeText(text);
    el("exportPlan").textContent = "Roadmap copied";
    window.setTimeout(() => {
      el("exportPlan").textContent = "Export roadmap";
    }, 1400);
  });
}

bindEvents();
render();
