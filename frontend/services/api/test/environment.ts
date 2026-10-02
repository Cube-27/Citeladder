/** Fail before importing application owners if a runner inherited live credentials. */
const inheritedCredentials = Object.entries(process.env)
  .filter(
    ([name, value]) =>
      value &&
      (/(?:_API_KEY|_CLIENT_SECRET|_CLIENT_ID)$/iu.test(name) ||
        /^(?:DEFAULT_AGENT_(?:BASE_URL|MODEL)|BILLING_|RAZORPAY_)/iu.test(name)),
  )
  .map(([name]) => name);
if (inheritedCredentials.length)
  throw new Error(
    `Clear provider configuration before API tests: ${inheritedCredentials.join(', ')}`,
  );
process.env.CITELADDER_DISABLE_DOTENV = '1';
process.env.APP_ENV = 'test';
