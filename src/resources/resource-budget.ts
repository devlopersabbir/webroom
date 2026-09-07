/**
 * WebRoom v3 — Resource Budget & Node Capability Definitions
 * 
 * Enforces conservative, bounded contribution budgets to ensure a peer node
 * never consumes unbounded network, CPU, or memory resources.
 */

export interface ResourceBudget {
  cpuContribution: "LOW" | "MEDIUM";
  memoryBudgetMb: number;
  networkBudgetKbps: number;
  maxRelaySlots: number;
  maxForwardingStreams: number;
}

export interface NodeCapabilities {
  contributionEnabled: boolean;
  maxRelaySlots: number;
  activeRelays: number;
  availableRelaySlots: number;
  networkBudgetKbps: number;
  currentBandwidthKbps: number;
}

/**
 * Default conservative resource contribution budget.
 * 
 * WHY:
 * 1. 2 relay slots allow serving up to 2 downstream listener peers per contributor.
 * 2. 500 Kbps upload limit accommodates 2 compressed audio streams comfortably without throttling user broadband.
 * 3. Bounded memory and low CPU heuristic prevent browser tab lag.
 */
export const DEFAULT_RESOURCE_BUDGET: Readonly<ResourceBudget> = {
  cpuContribution: "LOW",
  memoryBudgetMb: 50,
  networkBudgetKbps: 500,
  maxRelaySlots: 2,
  maxForwardingStreams: 2,
};
