import { AiTrafficRouteContent } from '@/components/ai-traffic/ai-traffic-route-content';
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

/** /ai-traffic: active-project, persisted AI referral measurement. */
export function AiTrafficRouteElement() {
  return <AiTrafficRouteContent />;
}
