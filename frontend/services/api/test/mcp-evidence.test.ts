import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { authorizedWorkspaceIds } from '../src/mcp/data.ts';
import { dispatchTool } from '../src/mcp/tools.ts';
import { fetchRecord } from '../src/mcp/retrieval.ts';
import type { McpPrincipal } from '../src/mcp/types.ts';
import { prompt, promptSet } from './prompt-fixtures.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
const clients: string[] = [];
let tenant: Tenant;
let principal: McpPrincipal;
const origin = 'https://app.example.test';
beforeEach(async () => {
  tenant = await fixtures.tenant();
  const clientId = randomUUID(); clients.push(clientId);
  await db.insertInto('mcp_oauth_clients').values({ id:randomUUID(),client_id:clientId,client_metadata:JSON.stringify({client_name:'test'}),client_secret_encrypted:'',created_at:new Date() }).execute();
  principal = { userId:tenant.userId,grantId:randomUUID(),workspaceIds:[tenant.workspaceId],tokenHash:randomUUID() };
  await db.insertInto('mcp_oauth_grants').values({ id:principal.grantId,client_id:clientId,user_id:tenant.userId,workspace_ids:JSON.stringify(principal.workspaceIds),scopes:JSON.stringify(['citeladder:read']),resource:'https://protocol.example.test/mcp',access_token_hash:principal.tokenHash,refresh_token_hash:randomUUID(),access_expires_at:new Date(Date.now()+3600000),refresh_expires_at:new Date(Date.now()+7200000),revoked_at:null,created_at:new Date(),updated_at:new Date() }).execute();
});
afterAll(async () => {
  await fixtures.cleanup();
  await db.deleteFrom('mcp_oauth_clients').where('client_id','in',clients).execute();
  await db.destroy();
});
const read = (name:string,args:Record<string,unknown> = {}) => dispatchTool(db,principal,name,{project_id:tenant.projectId,...args},origin);

it('pages prompts stably while context includes only active prompts and foreign IDs cannot fetch', async () => {
  const set = await promptSet(db,tenant.projectId);
  const first = await prompt(db,set,'Acme first');
  const second = await prompt(db,set,'Acme second');
  const retired = await prompt(db,set,'Acme retired',{status:'retired'});
  const page = await read('read_prompt_portfolio',{limit:1});
  expect(page.items).toEqual([expect.objectContaining({id:first})]);
  const next = await read('read_prompt_portfolio',{limit:1,cursor:(page.pagination as {next_cursor:string}).next_cursor});
  expect(next.items).toEqual([expect.objectContaining({id:second})]);
  const context = await read('get_project_business_context',{sections:['prompts']});
  expect((context.active_prompts as {id:string}[]).map(r=>r.id)).toEqual([first,second]);
  expect((await fetchRecord(db,principal,`citeladder://prompt/${retired}`,origin)).metadata).toMatchObject({record:{status:'retired'}});
  const foreign = await fixtures.tenant();
  const secret = await prompt(db,await promptSet(db,foreign.projectId),'Acme private');
  await expect(fetchRecord(db,principal,`citeladder://prompt/${secret}`,origin)).rejects.toThrow('not found');
  const searched = await dispatchTool(db,principal,'search',{query:'private'},origin);
  expect(searched.results).toEqual([]);
});

it('excludes system tenants and reevaluates an already loaded credential after account or grant changes', async () => {
  const system = await fixtures.systemWorkspace();
  await db.updateTable('mcp_oauth_grants').set({workspace_ids:JSON.stringify([tenant.workspaceId,system])}).where('id','=',principal.grantId).execute();
  expect(await authorizedWorkspaceIds(db,principal)).toEqual([tenant.workspaceId]);
  await db.updateTable('users').set({is_active:false}).where('id','=',tenant.userId).execute();
  expect(await authorizedWorkspaceIds(db,principal)).toEqual([]);
  await db.updateTable('users').set({is_active:true}).where('id','=',tenant.userId).execute();
  await db.updateTable('mcp_oauth_grants').set({revoked_at:new Date()}).where('id','=',principal.grantId).execute();
  await expect(read('read_prompt_portfolio')).rejects.toThrow('not found');
});

it('keeps a missing exact query window and unmeasured snapshots unavailable while no connections is observed', async () => {
  expect(await read('read_query_evidence',{window_start:'2026-09-01',window_end:'2026-09-02'})).toMatchObject({state:'unavailable',reason:'exact_query_evidence_window_not_projected',items:[]});
  expect(await read('read_site_health')).toMatchObject({state:'unavailable',reason:'no_site_snapshot'});
  expect(await read('read_integration_status')).toMatchObject({state:'available',connection_count:0,stage:'not_connected'});
  const before = await db.selectFrom('analytics_tasks').select('id').where('workspace_id','=',tenant.workspaceId).execute();
  await read('get_project_business_context');
  expect(await db.selectFrom('analytics_tasks').select('id').where('workspace_id','=',tenant.workspaceId).execute()).toEqual(before);
});

it('preserves answer and citation artifact identity through the existing visibility owner', async () => {
  const auditId = await fixtures.audit(tenant);
  const taskId = await fixtures.execution(tenant,{auditId,analysis:{brandMentioned:true,citations:[{url:'https://publisher.example/review',title:'Review'}]},taskEvents:[{query:'acme review'}]});
  const page = await read('read_visibility_results',{audit_id:auditId});
  const items = page.items as {id:string;record_uri:string;citations:{id:string;record_uri:string}[]}[];
  expect(items[0]?.id).toBe(taskId);
  const answer = await fetchRecord(db,principal,items[0]!.record_uri,origin);
  expect(answer.metadata).toMatchObject({project_id:tenant.projectId,record_type:'visibility_result'});
  const citation = await fetchRecord(db,principal,items[0]!.citations[0]!.record_uri,origin);
  expect(citation.metadata).toMatchObject({record:{url:'https://publisher.example/review',analysis_id:expect.any(String)}});
  const foreign = await fixtures.tenant();
  await expect(dispatchTool(db,principal,'read_visibility_results',{project_id:foreign.projectId,audit_id:auditId},origin)).rejects.toThrow('not found');
});
