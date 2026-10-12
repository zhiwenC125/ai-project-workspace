/** Internal design contracts only. No provider implementation or external API schema. */
export type Provider = 'github' | 'coding';
export type Capability = 'repositories.read' | 'issues.read' | 'issues.write'
  | 'reviews.read' | 'reviews.write' | 'checks.read' | 'pipelines.trigger' | 'webhooks';
export interface Connection {
  id: string;
  workspaceId: string;
  provider: Provider;
  baseUrl: string;
  credentialRef: string;
}
export interface ExternalRef {
  connectionId: string;
  provider: Provider;
  repositoryId: string;
  externalId: string;
  url: string;
}
export interface Page<T> { items: T[]; nextCursor?: string }
export interface Repository { id: string; name: string; url: string; defaultBranch: string }
export interface Issue { ref: ExternalRef; title: string; body: string; state: string; revision: string }
export interface Review {
  ref: ExternalRef;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  state: 'open' | 'merged' | 'closed';
}
export interface Check {
  id: string;
  name: string;
  state: 'queued' | 'running' | 'passed' | 'failed' | 'cancelled' | 'unknown';
  url?: string;
}
/** Coordinator provides durable idempotency even where the provider does not. */
export interface WriteContext { idempotencyKey: string; actorId: string; expectedRevision?: string }
export type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'unsupported' | 'unauthorized' | 'not_found' | 'conflict' | 'rate_limited' | 'unavailable' | 'outcome_unknown'; message: string; retryAfterMs?: number };
export interface PlatformAdapter {
  readonly provider: Provider;
  validateConnection(connection: Connection): Promise<AdapterResult<{ capabilities: Capability[] }>>;
  listRepositories(connection: Connection, cursor?: string): Promise<AdapterResult<Page<Repository>>>;
  listIssues(connection: Connection, repositoryId: string, cursor?: string): Promise<AdapterResult<Page<Issue>>>;
  createIssue(connection: Connection, repositoryId: string, input: {title: string; body: string}, write: WriteContext): Promise<AdapterResult<Issue>>;
  updateIssue(connection: Connection, ref: ExternalRef, patch: Partial<Pick<Issue, 'title' | 'body' | 'state'>>, write: WriteContext): Promise<AdapterResult<Issue>>;
  createReview(connection: Connection, repositoryId: string, input: {title: string; body: string; sourceBranch: string; targetBranch: string}, write: WriteContext): Promise<AdapterResult<Review>>;
  getReview(connection: Connection, ref: ExternalRef): Promise<AdapterResult<Review>>;
  listChecks(connection: Connection, repositoryId: string, commitSha: string): Promise<AdapterResult<Check[]>>;
  triggerPipeline(connection: Connection, repositoryId: string, pipelineId: string, branch: string, write: WriteContext): Promise<AdapterResult<{externalRunId: string}>>;
}
export type WorkItemStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type RunStatus = 'queued' | 'running' | 'waiting_for_human' | 'succeeded' | 'failed' | 'cancelled';
export interface WorkItem {
  id: string;
  workspaceId: string;
  projectId: string;
  requirementId?: string;
  sprintId?: string;
  title: string;
  status: WorkItemStatus;
  acceptanceCriteria: string[];
  assigneeId?: string;
  dependencyIds: string[];
  externalRefs: ExternalRef[];
  revision: number;
}
export interface RunRequest {
  runId: string;
  workspaceId: string;
  projectId: string;
  workItemId: string;
  actorId: string;
  task: string;
  allowedWorkingDirectory: string;
  contextArtifactIds: string[];
  existingSessionId?: string;
}
/** Normalized by the worker. Core native event shapes were verified on 2026-10-13. */
export type RunEvent = {
  id: string;
  runId: string;
  sequence: number;
  occurredAt: string;
} & (
  | { type: 'status'; status: RunStatus; reason?: string }
  | { type: 'output'; text: string }
  | { type: 'artifact'; artifactId: string; label: string; url?: string }
  | { type: 'session'; sessionId: string }
  | { type: 'step'; stepId: string; label: string; state: RunStatus }
  | { type: 'error'; message: string; failedStepId?: string; recovery: 'retry_step' | 'reconcile' | 'manual' }
);
export interface ExecutionHandle { runId: string; sessionId?: string }
export interface AgentRuntime {
  probe(): Promise<{ installed: boolean; available: boolean; version?: string; supportsCancel: boolean; supportsResume: boolean; reason?: string }>;
  start(request: RunRequest): Promise<ExecutionHandle>;
  events(runId: string, afterSequence?: number): AsyncIterable<RunEvent>;
  cancel(runId: string): Promise<{ accepted: boolean; reason?: string }>;
}
