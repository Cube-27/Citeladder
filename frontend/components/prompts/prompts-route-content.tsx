import { useSearchParams } from 'react-router-dom';
import { Suspense, useEffect, useState } from 'react';

import {
  GENERATE_PROMPTS_PARAM,
  OFFERING_PROMPTS_PARAM,
  REVIEW_PROMPTS_PARAM,
} from '@/lib/prompts/routes';

import { PromptLibrary } from './prompt-library';

const BUILDER_PARAMS = [GENERATE_PROMPTS_PARAM, REVIEW_PROMPTS_PARAM, OFFERING_PROMPTS_PARAM];

function PromptsRouteSurface() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Each arrival with `generate=1` or `review=1`, including in-page navigation,
  // is one request to open the Prompt Builder in that mode. Counting it while
  // rendering records it before the effect below consumes the parameter, so a
  // reload or back navigation does not reopen the builder.
  const [generateRequest, setGenerateRequest] = useState(0);
  const [reviewRequest, setReviewRequest] = useState(false);
  const [offeringRequest, setOfferingRequest] = useState<string | null>(null);
  const [countedParams, setCountedParams] = useState<URLSearchParams | null>(null);
  const wantsReview = searchParams.get(REVIEW_PROMPTS_PARAM) === '1';
  if (
    (searchParams.get(GENERATE_PROMPTS_PARAM) === '1' || wantsReview) &&
    countedParams !== searchParams
  ) {
    setCountedParams(searchParams);
    setGenerateRequest((count) => count + 1);
    setReviewRequest(wantsReview);
    setOfferingRequest(searchParams.get(OFFERING_PROMPTS_PARAM));
  }
  useEffect(() => {
    if (!BUILDER_PARAMS.some((param) => searchParams.has(param))) return;
    const next = new URLSearchParams(searchParams);
    for (const param of BUILDER_PARAMS) next.delete(param);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <PromptLibrary
      generateRequest={generateRequest}
      reviewRequest={reviewRequest}
      offeringRequest={offeringRequest}
    />
  );
}

/** Shared /prompts route content: the prompt library, opened directly. */
export function PromptsRouteContent() {
  // Keep the route surface behind a Suspense boundary while it reads the URL.
  return (
    <Suspense>
      <PromptsRouteSurface />
    </Suspense>
  );
}
