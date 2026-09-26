"""Golden onboarding cases whose buyer subscribes to software or hires a TEAM.

SaaS, regulated finance, and the local and professional services whose sites
advertise the categories they work IN -- the read the research model most
often gets wrong. See :mod:`evaluations.onboarding_cases_commerce` for
the other half and :mod:`evaluations.onboarding_corpus` for the schema.
"""

from __future__ import annotations

from evaluations.onboarding_corpus import GoldenOnboardingCase

_FEEDONOMICS = GoldenOnboardingCase(
    slug="feedonomics-united-states",
    brand_name="Feedonomics",
    primary_market="United States",
    website_url="https://feedonomics.com",
    sector="Software",
    category="product feed management and marketplace syndication platform",
    category_aliases=(
        "feed management software",
        "product data syndication",
        "shopping feed tool",
        "feed optimization platform",
        "product feed management",
    ),
    business_model="b2b_saas",
    market_scope="global",
    buyer_type="b2b",
    knowledge_strength="strong",
    jobs_to_be_done=(
        "list products on many marketplaces at once",
        "fix merchant centre disapprovals at scale",
        "optimise product data for shopping ads",
        "keep catalog data in sync across channels",
    ),
    category_terms=(
        "product feed management",
        "marketplace integrations",
        "catalog optimization",
        "google shopping feeds",
        "product data syndication",
        "feed automation",
    ),
    expected_competitors=(
        "Productsup",
        "Channable",
        "DataFeedWatch",
        "GoDataFeed",
        "Rithum",
        "Lengow",
    ),
    buyer_register="research_comparative",
)


_CANVA = GoldenOnboardingCase(
    slug="canva-australia",
    brand_name="Canva",
    primary_market="Australia",
    website_url="https://www.canva.com",
    sector="Software",
    category="browser-based graphic design and presentation tool",
    category_aliases=(
        "graphic design tool",
        "design software",
        "presentation maker",
        "social media design app",
    ),
    business_model="b2b_saas",
    market_scope="global",
    buyer_type="both",
    knowledge_strength="strong",
    jobs_to_be_done=(
        "make professional-looking designs without design skills",
        "produce social media content quickly",
        "keep a team on-brand with shared templates",
        "build a presentation that looks good",
    ),
    category_terms=(
        "graphic design",
        "presentation design",
        "social media graphics",
        "brand templates",
        "logo design",
        "marketing collateral",
    ),
    expected_competitors=(
        "Adobe Express",
        "Microsoft Designer",
        "VistaCreate",
        "Figma",
    ),
    buyer_register="research_comparative",
)


_URBAN_COMPANY = GoldenOnboardingCase(
    slug="urban-company-india",
    brand_name="Urban Company",
    primary_market="India",
    website_url="https://www.urbancompany.com",
    sector="Consumer Services",
    category="at-home services booking marketplace",
    category_aliases=(
        "home services app",
        "at home salon booking",
        "home repair service app",
        "home cleaning service",
    ),
    business_model="local_service",
    # Coverage is national, but demand is expressed city by city: buyers type a
    # metro name or "near me", never a country.  This is the case that proves
    # locality has to be a facet rather than a row in an industry table.
    market_scope="local",
    buyer_type="b2c",
    knowledge_strength="strong",
    jobs_to_be_done=(
        "book a trusted professional to come to my home",
        "get an appliance repaired quickly",
        "get a salon service without going to a salon",
        "know the price before booking",
    ),
    category_terms=(
        "salon at home",
        "home cleaning",
        "ac service and repair",
        "plumbing and electrical",
        "pest control",
        "appliance repair",
    ),
    expected_competitors=(
        "Housejoy",
        "NoBroker",
        "Yes Madam",
        "Zimmber",
        "Justdial",
    ),
    buyer_register="local_urgent",
)


_JUPITER = GoldenOnboardingCase(
    slug="jupiter-india",
    brand_name="Jupiter",
    primary_market="India",
    website_url="https://jupiter.money",
    sector="Financial Services",
    category="digital banking app and neobank",
    category_aliases=(
        "neobank",
        "digital savings account",
        "banking app",
        "mobile banking app",
    ),
    business_model="regulated_finance",
    market_scope="national",
    buyer_type="b2c",
    # Deliberately weaker than the household names above: a mid-size fintech the
    # model knows partially, which is where over-confident invention shows up.
    knowledge_strength="weak",
    jobs_to_be_done=(
        "open a bank account without visiting a branch",
        "track spending automatically",
        "avoid minimum balance penalties",
        "know my money is safe and regulated",
    ),
    category_terms=(
        "digital savings account",
        "zero balance account",
        "upi payments",
        "spending insights",
        "neobank",
        "instant account opening",
    ),
    expected_competitors=(
        "Fi Money",
        "Niyo",
        "Slice",
        "Paytm Payments Bank",
        "Kotak 811",
    ),
    buyer_register="advice_seeking",
)


_ZOHO = GoldenOnboardingCase(
    slug="zoho-india",
    brand_name="Zoho",
    primary_market="India",
    website_url="https://www.zoho.com",
    sector="Software",
    # The disambiguation case: Zoho sells 50+ products.  A generator that picks
    # one product, or that emits "business software" and stops, both fail.
    category="integrated business software suite for small and mid-size firms",
    category_aliases=(
        "business software suite",
        "crm software",
        "office software suite",
        "all in one business apps",
    ),
    business_model="b2b_saas",
    market_scope="global",
    buyer_type="b2b",
    knowledge_strength="strong",
    jobs_to_be_done=(
        "run a whole business on one affordable software stack",
        "replace expensive per-seat enterprise software",
        "manage customers, invoices and email in one place",
        "avoid stitching together many separate tools",
    ),
    category_terms=(
        "crm software",
        "business email hosting",
        "accounting and invoicing",
        "helpdesk software",
        "hr and payroll software",
        "office productivity suite",
    ),
    expected_competitors=(
        "Salesforce",
        "HubSpot",
        "Freshworks",
        "Microsoft 365",
        "Google Workspace",
    ),
    buyer_register="research_comparative",
)


_VALTECH = GoldenOnboardingCase(
    slug="valtech-global",
    brand_name="Valtech",
    primary_market="Global",
    website_url="https://www.valtech.com",
    sector="Professional Services",
    category="digital commerce and experience implementation agency",
    category_aliases=(
        "digital transformation consultancy",
        "ecommerce implementation partner",
        "digital experience agency",
        "commerce systems integrator",
    ),
    business_model="professional_service",
    market_scope="global",
    buyer_type="b2b",
    knowledge_strength="weak",
    jobs_to_be_done=(
        "replatform an ecommerce site without losing revenue",
        "find an implementation partner for a composable commerce build",
        "get a team that can deliver a digital product end to end",
        "modernise a legacy customer experience stack",
    ),
    category_terms=(
        "commerce replatforming",
        "composable commerce implementation",
        "digital experience delivery",
        "systems integration",
        "cx and design services",
        "data and analytics consulting",
    ),
    expected_competitors=(
        "Publicis Sapient",
        "Accenture Song",
        "Material",
        "Grid Dynamics",
        "Bounteous",
    ),
    buyer_register="research_comparative",
)


SOFTWARE_AND_SERVICE_CASES: tuple[GoldenOnboardingCase, ...] = (
    _FEEDONOMICS,
    _CANVA,
    _URBAN_COMPANY,
    _JUPITER,
    _ZOHO,
    _VALTECH,
)
