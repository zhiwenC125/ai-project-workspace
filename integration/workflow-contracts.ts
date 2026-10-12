/** Proposed contracts for the product-owned workflow engine. */
import type { RunStatus } from './contracts';

export interface ProjectNode {
  id: string;
  projectId: string;
  kind: 'phase' | 'work_package' | 'milestone';
  title: string;
  ownerId?: string;
  workItemIds: string[];
  acceptanceCriteria: string[];
  position: { x: number; y: number };
  revision: number;
}

/** Informational edges never execute work. */
export interface ProjectRelation {
  id: string;
  kind: 'delivery_order' | 'depends_on' | 'references';
  source: { kind: 'project' | 'node' | 'artifact'; id: string };
  target: { kind: 'project' | 'node' | 'artifact'; id: string };
  label?: string;
}

export interface AutomationBinding {
  id: string;
  projectNodeId: string;
  engine: 'native';
  workflowKey: string;
  definitionVersion: string;
  definitionId: string;
  trigger: 'manual' | 'work_item_ready' | 'review_decided' | 'external_event';
  enabled: boolean;
}

export interface WorkflowRunRef {
  id: string;
  workspaceId: string;
  projectId: string;
  projectNodeId: string;
  workItemId: string;
  bindingId: string;
  definitionVersion: string;
  engineExecutionId?: string;
  agentRunIds: string[];
  harnessSessionId?: string;
  artifactIds: string[];
  status: RunStatus;
  initiatedBy: string;
  idempotencyKey: string;
  /** Protects against stale events overwriting newer state. */
  revision: number;
}

export interface StartWorkflowRequest {
  bindingId: string;
  projectNodeId: string;
  workItemId: string;
  actorId: string;
  contextArtifactIds: string[];
  idempotencyKey: string;
  expectedWorkItemRevision: number;
}

/** Application event envelope. Provider-specific event parsing is separate. */
export interface WorkflowEvent {
  eventId: string;
  workflowRunId: string;
  sequence: number;
  occurredAt: string;
  status: RunStatus;
  stepId?: string;
  artifactIds?: string[];
  reason?: string;
}

export interface WorkflowEngine {
  start(request: StartWorkflowRequest): Promise<WorkflowRunRef>;
  getRun(runId: string): Promise<WorkflowRunRef>;
  cancel(runId: string, actorId: string): Promise<{ accepted: boolean; reason?: string }>;
  /** Verify the waiting step and actor before resuming the underlying execution. */
  submitDecision(input: {
    runId: string;
    waitingStepId: string;
    actorId: string;
    decision: 'approve' | 'request_changes' | 'reject';
    comment?: string;
    idempotencyKey: string;
    expectedRunRevision: number;
  }): Promise<WorkflowRunRef>;
}
