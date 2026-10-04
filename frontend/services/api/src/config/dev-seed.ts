/** Explicit local fixtures, never commercial policy or provider authority. */
export const devSeed = {
  email: 'demo@citeladder.dev',
  password: 'DemoPass123!',
  agencyEmail: 'agency@citeladder.dev',
  allowance: 500,
  workspace: 'Wanderlust Gear Co.',
  agencyWorkspace: 'Wanderlust Gear Co. - Agency',
  budgetSeconds: 600,
  prompts: [
    ['best hiking backpack for a week-long trip', 'discovery', 'active', 'manual'],
    ['what is the most durable travel backpack under $200', 'discovery', 'active', 'manual'],
    ['Wanderlust Gear vs TrailBlaze Packs which is better', 'comparison', 'active', 'manual'],
    ['compare Summit Gear and Wanderlust Gear warranties', 'comparison', 'active', 'imported'],
    ['where can I buy a waterproof backpack online', 'purchase', 'active', 'manual'],
    ['best place to buy carry-on travel backpacks', 'purchase', 'active', 'manual'],
    ['does Wanderlust Gear offer free returns', 'service', 'active', 'manual'],
    ['how do I file a warranty claim for a torn backpack', 'service', 'proposed', 'generated'],
    ['best outdoor gear shops near Denver Colorado', 'local', 'active', 'manual'],
    ['hiking backpack stores in Seattle Washington', 'local', 'proposed', 'generated'],
    ['old prompt about discontinued backpack line', 'discovery', 'archived', 'manual'],
  ],
  agencyPrompts: [
    ['best RV awning for hot climates', 'discovery'],
    ['CamperCo vs OutbackShade awnings', 'comparison'],
    ['where to buy a retractable camper awning', 'purchase'],
  ],
  products: [
    {
      name: 'Summit 40L Trail Pack',
      sku: 'WGC-S40-BLK',
      price: 189.99,
      url: 'https://wanderlustgear.com/backpacks/summit-40l',
    },
    {
      name: 'Voyager 25L Carry-On Pack',
      sku: 'WGC-V25-GRY',
      price: 129.99,
      url: 'https://wanderlustgear.com/backpacks/voyager-25l',
    },
  ],
  competitorProduct: {
    name: 'TrailBlaze Alpine 45',
    price: 174.99,
    url: 'https://trailblazepacks.com/alpine-45',
  },
} as const;
