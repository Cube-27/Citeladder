/**
 * The route contracts the TypeScript service publishes.
 *
 * Every product route the service serves is declared here with its zod
 * schemas, and the OpenAPI document is generated from these declarations
 * (`document.ts`). A family's fragment must equal the frozen Python golden
 * before ingress sends it traffic (TypeScript migration rule 4). Each product
 * route declares its contract beside its handler (`routes/`).
 */
import type { RouteFamily } from '@citeladder/contracts/route-ownership';
import type { z } from 'zod';

import { PRODUCT_ROUTES } from '../routes/index.ts';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type RouteContract<Family extends string = RouteFamily> = {
  /** The route family (OpenAPI tag) the route-ownership manifest assigns. */
  family: Family;
  method: HttpMethod;
  /** The OpenAPI path template, `/api/v1` prefix included. */
  path: string;
  pathParams?: z.ZodObject;
  query?: z.ZodObject;
  headers?: z.ZodObject;
  cookies?: z.ZodObject;
  body?: z.ZodType;
  /** Success responses by status; `null` declares a response with no body. */
  responses: Readonly<Record<number, z.ZodType | null>>;
};

export const ROUTE_CONTRACTS: readonly RouteContract[] = PRODUCT_ROUTES.map(
  (route) => route.contract,
);
