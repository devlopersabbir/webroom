/**
 * WebRoom v3 — Dynamic Role System Definitions & Types
 * 
 * Defines ephemeral roles and deterministic assignment structures for the distributed overlay.
 */

export type NodeRole =
  | "coordinator"
  | "relay"
  | "standby"
  | "contributor"
  | "participant";

export interface RoleEvaluationResult {
  selfRole: NodeRole;
  coordinatorNodeId: string | null;
  roleAssignments: Map<string, NodeRole>;
}

export type RoleChangeListener = (
  selfRole: NodeRole,
  allRoles: Map<string, NodeRole>
) => void;

/**
 * Visual metadata and display badges for node roles.
 */
export const ROLE_DISPLAY_CONFIG: Record<
  NodeRole,
  { label: string; icon: string; badgeClass: string; description: string }
> = {
  coordinator: {
    label: "Coordinator",
    icon: "👑",
    badgeClass: "webroom-role-coordinator",
    description: "Coordinates distributed cluster topology and failure recovery.",
  },
  relay: {
    label: "Relay Node",
    icon: "⚡",
    badgeClass: "webroom-role-relay",
    description: "Actively relays audio streams to downstream listener peers.",
  },
  standby: {
    label: "Standby Relay",
    icon: "🛡️",
    badgeClass: "webroom-role-standby",
    description: "Eligible contributor ready to assume coordinator or relay duties.",
  },
  contributor: {
    label: "Contributor",
    icon: "🤝",
    badgeClass: "webroom-role-contributor",
    description: "Voluntary resource contribution enabled.",
  },
  participant: {
    label: "Participant",
    icon: "👤",
    badgeClass: "webroom-role-participant",
    description: "Regular peer participating in voice and chat.",
  },
};
