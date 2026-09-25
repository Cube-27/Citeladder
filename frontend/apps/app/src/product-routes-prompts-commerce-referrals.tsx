import { AiReferralsRouteContent } from '@/components/ai-referrals/ai-referrals-route-content';
import { ProductsRouteContent } from '@/components/products/products-route-content';
import { PromptsRouteContent } from '@/components/prompts/prompts-route-content';

/** /prompts: active-project prompt portfolio and URL-backed manage mode. */
export function PromptsRouteElement() {
  return <PromptsRouteContent />;
}

/** /products: active-project Commerce Suite workspace. */
export function ProductsRouteElement() {
  return <ProductsRouteContent />;
}

/** /ai-referrals: active-project, persisted AI referral measurement. */
export function AiReferralsRouteElement() {
  return <AiReferralsRouteContent />;
}
