// Single source of truth for all site copy and company facts.
// House rules: no Zoho, no city in marketing copy, no fixed tool list.

export const company = {
  name: "Shader Labs",
  legalName: "Shader Labs Private Limited",
  email: "mail@shaderlabs.in",
  cin: "U85499PN2023PTC220410",
  founded: 2023,
  address: {
    line1: "Plot No 6011, M. Durga Nagar",
    line2: "Ayodhya Nagar, Nagpur 440024",
    line3: "Maharashtra, India",
  },
  clientCountries: ["Mexico", "Uruguay", "Thailand", "Singapore"],
};

export const nav = [
  { href: "/work", label: "Work" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
];

export type Service = {
  slug: string;
  title: string;
  description: string;
  deliverables: string[];
  usefulWhen: string;
  image?: { src: string; caption: string };
};

export const services: Service[] = [
  {
    slug: "business-systems",
    title: "Business systems",
    description:
      "Software built around the exact way one business works: the royalty split nobody else calculates the same way, the approval chain with three exceptions, the onboarding flow that only makes sense in your industry. We map the real process first, then build the system that runs it.",
    deliverables: ["Internal tools & admin systems", "Rules, workflow & approval engines", "Calculation & reporting logic", "Integrations with the tools you already use"],
    usefulWhen: "Your process is specific enough that every off-the-shelf product needs a workaround, a spreadsheet or a person to patch the gap.",
  },
  {
    slug: "backends",
    title: "Backends & APIs",
    description:
      "The part nobody sees and everything depends on: databases, APIs, accounts, payments and integrations, deployed on servers we set up and look after.",
    deliverables: ["APIs & integrations", "Databases & data models", "Accounts & permissions", "Hosting & deployment"],
    usefulWhen: "Your product has outgrown spreadsheets, plugins or a no-code tool.",
  },
  {
    slug: "pipelines",
    title: "Custom pipelines",
    description:
      "If people on your team copy data between tools, chase files or build reports by hand, we turn that work into a pipeline that runs on its own.",
    deliverables: ["Workflow automation", "Data & file processing", "Delivery & sync jobs", "Scheduled reports"],
    usefulWhen: "The same manual task eats hours every week.",
  },
  {
    slug: "crm",
    title: "CRM tools",
    description:
      "Custom CRM tools shaped around how your team actually sells and onboards, connected to your website, forms and platform so nothing is typed twice.",
    deliverables: ["Custom CRM tools", "Internal apps", "Lead & application flows", "CRM ↔ platform sync"],
    usefulWhen: "Leads and customers live in five places and nobody trusts the numbers.",
  },
  {
    slug: "portals",
    title: "Portals & dashboards",
    description:
      "Sign-in portals for your customers, admin panels for your team, and dashboards that show the numbers that matter while they still matter.",
    deliverables: ["Customer portals", "Admin panels", "Live dashboards", "Role-based access"],
    usefulWhen: "Customers email you for information they should be able to see themselves.",
  },
  {
    slug: "tech-art",
    title: "Technical art pipelines",
    description:
      "For film, games and real-time 3D: the shaders, tools and pipelines between your artists and the engine or renderer. Asset processing, look development, automation inside 3D tools, and the glue that keeps a production moving. It's where Shader Labs started.",
    deliverables: ["Shaders & real-time effects", "Asset import & export pipelines", "Tools & plugins for 3D software", "Render & build automation"],
    usefulWhen: "Your artists spend more time fighting exports, naming rules and broken builds than making the work.",
    image: { src: "/work/baoli-ingame-3.jpg", caption: "CRT screen shader and lighting from Baoli, our own game" },
  },
  {
    slug: "interactive",
    title: "Interactive experiences",
    description:
      "Real-time 3D on the web, product configurators, playable campaigns and installations for companies that need people to use something, not just read about it. Built with the same engine knowledge we use for games.",
    deliverables: ["WebGL & real-time 3D sites", "Product configurators", "Playable ads & browser games", "Event & installation experiences"],
    usefulWhen: "A launch, campaign or product needs to be experienced, and a regular website won't do it justice.",
  },
  {
    slug: "infrastructure",
    title: "Infrastructure & hosting",
    description:
      "The servers everything runs on, set up and looked after by the same people who wrote the code: custom VPS environments, deployments, monitoring, backups and security updates. When something breaks at 2am, it's already our problem.",
    deliverables: ["Custom VPS setup", "Deployment pipelines", "Monitoring & alerts", "Backups & security updates"],
    usefulWhen: "Your software runs on servers nobody fully owns, and every outage starts with figuring out who to call.",
  },
];

export const embedded = {
  title: "Your tech team, on call",
  body: [
    "Most of our work doesn't end at launch. We become the tech team: one group that knows your whole system, ships new features every month, fixes what breaks and makes the technical calls with you.",
    "No juggling freelancers, no re-explaining your business to a new developer every quarter.",
  ],
  points: [
    ["Ongoing", "New features, every month"],
    ["Owned", "Hosting, monitoring and fixes"],
    ["Direct", "One point of contact, no account managers"],
  ] as [string, string][],
};

export const process = [
  { when: "Week 1", title: "Listen", body: "You tell us the feature, the problem or the idea. We learn how the business works before suggesting any tech." },
  { when: "Week 1–2", title: "Scope", body: "A written plan: what we'll build, in what order, how long it takes and what it costs." },
  { when: "Build", title: "Ship in pieces", body: "Small releases you can see and test as we go. No big reveal at the end, no surprises." },
  { when: "Ongoing", title: "Run & grow", body: "We host it, watch it and keep extending it. Most clients stay on after launch." },
];

type CaseStudy = {
  slug: string;
  client: string;
  url: string;
  urlLabel: string;
  logo: { src: string; width: number; height: number };
  shot: { src: string; width: number; height: number };
  industry: string;
  period: string;
  role: string;
  headline: string;
  summary: string;
  aboutClient: string;
  built: { title: string; body: string }[];
  scale?: { value: string; label: string }[];
  scaleNote?: string;
};

export const caseStudies: CaseStudy[] = [
  {
    slug: "whole-story-distribution",
    client: "Whole Story Distribution",
    url: "https://wholestorydistribution.com",
    urlLabel: "wholestorydistribution.com",
    logo: { src: "/clients/whole-story.png", width: 648, height: 818 },
    shot: { src: "/work/wsd-home.png", width: 1440, height: 810 },
    industry: "Music distribution",
    period: "1+ yr, ongoing",
    role: "In-house tech team",
    headline: "A partnership that keeps growing.",
    summary:
      "We are Whole Story's tech team. The public website, the distribution platform, the artist portal, the backend and the CRM tools: all of it is built and run by Shader Labs.",
    aboutClient:
      "Whole Story Distribution helps independent artists and labels release music to 70+ stores, including Spotify, Apple Music, YouTube and TikTok, while keeping full ownership of their work.",
    built: [
      { title: "Website", body: "The public site artists find first, with language switching, artist applications and a clear path into the platform." },
      { title: "Distribution platform", body: "The core product: takes releases from artists and labels and delivers them to streaming stores." },
      { title: "Artist portal", body: "Where artists and labels sign in to manage releases, catalogues and earnings." },
      { title: "Backend & servers", body: "The APIs, databases and servers that power everything, on infrastructure we set up and maintain." },
      { title: "CRM tools", body: "Custom CRM tools and the artist application forms, wired into the rest of the system." },
      { title: "Whatever's next", body: "As the in-house team, we ship what the business needs each month." },
    ],
    scale: [
      { value: "1,000+", label: "Active artists" },
      { value: "50,000+", label: "Tracks delivered" },
      { value: "1B+", label: "Streams" },
      { value: "70+", label: "Stores reached" },
    ],
    scaleNote: "Platform figures as published on wholestorydistribution.com.",
  },
  {
    slug: "artist-vanguard",
    client: "Artist Vanguard",
    url: "https://www.artistvanguard.com",
    urlLabel: "artistvanguard.com",
    logo: { src: "/clients/artist-vanguard.png", width: 1600, height: 107 },
    shot: { src: "/work/av-home.png", width: 1440, height: 770 },
    industry: "Music label",
    period: "Past engagement",
    role: "Tech partner",
    headline: "Website, backend, CRM and a Discord bot for a global label.",
    summary:
      "We built Artist Vanguard's website and backend, set up and ran their CRM, and built a custom Discord bot into their business system, giving a growing label the tools to handle artists and partner labels at scale.",
    aboutClient:
      "Artist Vanguard is a music label and distribution company that helps independent artists and partner labels with distribution, licensing, marketing and production.",
    built: [
      { title: "Website", body: "The public site presenting the label's services to artists and partner labels." },
      { title: "Backend", body: "The systems behind the site, handling submissions and connecting it to the label's tools." },
      { title: "CRM", body: "Set up and run day to day, so every artist, demo and partner lead was tracked in one place." },
      { title: "Submission flows", body: "Demo and enquiry flows that send new artists straight into the label's pipeline." },
      { title: "Discord bot", body: "A custom Discord bot connected to the label's business system, so the team could work with it straight from Discord." },
    ],
  },
];

// Rows of the work index (clients + own products).
export type WorkRow = {
  href?: string; // own products are listed but not clickable
  title: string;
  kind: "Client" | "Own product";
  what: string;
  period: string;
  preview: "wsd" | "av" | "igl" | "baoli";
};

export const workIndex: WorkRow[] = [
  { href: "/work/whole-story-distribution", title: "Whole Story Distribution", kind: "Client", what: "Platform, portal, backend, CRM", period: "Ongoing", preview: "wsd" },
  { href: "/work/artist-vanguard", title: "Artist Vanguard", kind: "Client", what: "Website, backend, CRM, Discord bot", period: "Past", preview: "av" },
  { title: "Baoli", kind: "Own product", what: "Psychological horror game", period: "In development", preview: "baoli" },
  { title: "IndiaGamelab", kind: "Own product", what: "Game development school", period: "2024", preview: "igl" },
];



// Portraits live in /public/team/ (black & white, 3:4).
export const founders = [
  { name: "Anshul Patalbansi", role: "Head of Business Operations", photo: "/team/anshul.webp" },
  { name: "Shashank Patalbansi", role: "Head of Systems & Backend", photo: "/team/shashank.webp" },
];

export const contactOptions = {
  services: [
    "Business system",
    "Backend / API",
    "Custom pipeline / automation",
    "CRM tools",
    "Portal / dashboard",
    "Technical art pipeline",
    "Interactive experience",
    "Infrastructure / hosting",
    "Ongoing tech team",
    "Other",
  ],
  budgets: ["Under $1,000", "$1,000 – $5,000", "$5,000 – $15,000", "$15,000 – $50,000", "$50,000+", "Not sure yet"],
};
