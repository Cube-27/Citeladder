"""Golden onboarding cases whose buyer walks away with a PRODUCT.

Marketplaces, retailers and D2C brands. Split from
:mod:`evaluations.onboarding_cases` because one file of hand-authored
cases outgrew the module ceiling; the product/service boundary is the axis
the corpus exists to test, so it is the one the split follows.
See :mod:`evaluations.onboarding_corpus` for the schema.
"""

from __future__ import annotations

from evaluations.onboarding_corpus import GoldenOnboardingCase

_FLIPKART = GoldenOnboardingCase(
    slug="flipkart-india",
    brand_name="Flipkart",
    primary_market="India",
    website_url="https://www.flipkart.com",
    sector="Retail and Ecommerce",
    category="general merchandise online marketplace",
    category_aliases=(
        "online shopping site",
        "ecommerce marketplace",
        "online store",
        "shopping app",
    ),
    business_model="marketplace",
    market_scope="national",
    buyer_type="b2c",
    knowledge_strength="strong",
    jobs_to_be_done=(
        "buy a product online at the lowest price",
        "get fast and reliable delivery",
        "avoid counterfeit products",
        "pay in instalments",
    ),
    category_terms=(
        "online shopping",
        "mobile phones",
        "consumer electronics",
        "fashion and apparel",
        "home appliances",
        "cash on delivery",
    ),
    expected_competitors=(
        "Amazon India",
        "Meesho",
        "JioMart",
        "Myntra",
        "Tata CLiQ",
    ),
    buyer_register="terse_transactional",
)


_BEST_AND_LESS = GoldenOnboardingCase(
    slug="best-less-australia",
    brand_name="Best&Less",
    primary_market="Australia",
    website_url="https://www.bestandless.com.au",
    sector="Retail and Ecommerce",
    category="value fashion and kids clothing retailer",
    category_aliases=(
        "budget clothing store",
        "affordable kids clothes",
        "discount fashion retailer",
        "cheap family clothing",
    ),
    business_model="retail",
    market_scope="national",
    buyer_type="b2c",
    knowledge_strength="strong",
    jobs_to_be_done=(
        "clothe a family on a budget",
        "buy school uniforms cheaply",
        "replace kids clothes as they grow",
        "buy basic homewares affordably",
    ),
    category_terms=(
        "school uniforms",
        "kids clothing",
        "baby clothes",
        "womens basics",
        "homewares",
        "sleepwear",
    ),
    expected_competitors=(
        "Kmart Australia",
        "BIG W",
        "Target Australia",
        "Cotton On",
        "Bonds",
    ),
    buyer_register="terse_transactional",
)


_PUMA = GoldenOnboardingCase(
    slug="puma-india",
    brand_name="Puma",
    primary_market="India",
    website_url="https://in.puma.com",
    sector="Retail and Ecommerce",
    category="sportswear and athletic footwear brand",
    category_aliases=(
        "running shoes brand",
        "sports shoes",
        "athletic wear",
        "sneakers brand",
    ),
    business_model="d2c_product",
    market_scope="national",
    buyer_type="b2c",
    knowledge_strength="strong",
    jobs_to_be_done=(
        "find running shoes that suit my gait and budget",
        "buy gym and training wear",
        "buy sneakers for everyday wear",
        "replace worn-out sports shoes",
    ),
    category_terms=(
        "running shoes",
        "sports shoes",
        "sneakers",
        "training wear",
        "athletic footwear",
        "track pants",
    ),
    expected_competitors=(
        "Adidas India",
        "Nike India",
        "Skechers India",
        "ASICS India",
        "New Balance India",
    ),
    buyer_register="terse_transactional",
)


_GRAZA = GoldenOnboardingCase(
    slug="graza-united-states",
    brand_name="Graza",
    primary_market="United States",
    website_url="https://www.graza.co",
    sector="Food and Beverage",
    category="single-origin extra virgin olive oil brand",
    category_aliases=(
        "olive oil brand",
        "extra virgin olive oil",
        "cooking oil",
        "finishing oil",
    ),
    business_model="d2c_product",
    market_scope="national",
    buyer_type="b2c",
    # The small-brand case.  This is the vayudoot.in analogue: the model knows
    # little, so the profile must lean on site evidence and honestly report low
    # confidence rather than inventing a plausible-sounding business.
    knowledge_strength="weak",
    jobs_to_be_done=(
        "buy olive oil that is actually fresh and real",
        "have separate oils for cooking and finishing",
        "find a good gift for someone who cooks",
        "avoid adulterated supermarket olive oil",
    ),
    category_terms=(
        "extra virgin olive oil",
        "finishing olive oil",
        "cooking olive oil",
        "single origin olive oil",
        "harvest date olive oil",
        "squeeze bottle olive oil",
    ),
    expected_competitors=(
        "Brightland",
        "Kosterina",
        "California Olive Ranch",
        "Fat Gold",
        "Wonder Valley",
    ),
    buyer_register="research_comparative",
)


_WAKEFIT = GoldenOnboardingCase(
    slug="wakefit-india",
    brand_name="Wakefit",
    primary_market="India",
    website_url="https://www.wakefit.co",
    sector="Retail and Ecommerce",
    category="direct-to-consumer mattress and home furniture brand",
    category_aliases=(
        "mattress brand",
        "memory foam mattress",
        "orthopedic mattress",
        "online mattress",
    ),
    business_model="d2c_product",
    market_scope="national",
    buyer_type="b2c",
    knowledge_strength="strong",
    jobs_to_be_done=(
        "fix back pain caused by a bad mattress",
        "buy a mattress online without lying on it first",
        "furnish a home affordably",
        "replace a sagging old mattress",
    ),
    category_terms=(
        "orthopedic mattress",
        "memory foam mattress",
        "queen size mattress",
        "bed frames",
        "study tables",
        "mattress trial period",
    ),
    expected_competitors=(
        "Sleepwell",
        "Duroflex",
        "Kurlon",
        "SleepyCat",
        "Pepperfry",
    ),
    buyer_register="research_comparative",
)


_BURROW = GoldenOnboardingCase(
    slug="burrow-united-states",
    brand_name="Burrow",
    primary_market="United States",
    website_url="https://burrow.com",
    sector="Retail and Ecommerce",
    category="modular direct-to-consumer sofa and furniture brand",
    category_aliases=(
        "modular sofa",
        "sectional couch",
        "direct to consumer furniture",
        "apartment furniture",
    ),
    business_model="d2c_product",
    market_scope="national",
    buyer_type="b2c",
    knowledge_strength="weak",
    jobs_to_be_done=(
        "get a sofa into a small apartment",
        "buy furniture that survives pets and kids",
        "assemble furniture without tools or help",
        "expand a couch later without replacing it",
    ),
    category_terms=(
        "modular sofa",
        "sectional couch",
        "sleeper sofa",
        "apartment furniture",
        "washable upholstery",
        "tool-free assembly",
    ),
    expected_competitors=(
        "Article",
        "Floyd",
        "Joybird",
        "Interior Define",
        "West Elm",
    ),
    buyer_register="research_comparative",
)


# The corpus had eleven cases and not one service business, which is how a
# services firm shipped as a product vendor. Valtech is the shape that breaks:
# its site advertises the categories it WORKS IN ("commerce", "experience",
# "data"), so a careless read names the product category and then hands back the
# platforms Valtech implements -- Shopify Plus, SAP Commerce Cloud, commercetools
# -- as competitors. Every one of those scores high on substitutability, use-case
# overlap, geography and question visibility, so only a check on the *kind* of
# company rejects them. `expected_competitors` is therefore all agencies, and
# `unexpected` in the competitor evaluation is where that failure now shows up.


COMMERCE_CASES: tuple[GoldenOnboardingCase, ...] = (
    _FLIPKART,
    _BEST_AND_LESS,
    _PUMA,
    _GRAZA,
    _WAKEFIT,
    _BURROW,
)
