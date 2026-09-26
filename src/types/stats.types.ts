export interface GlobalStats {
  totalActiveSessions: number;
  globalCapacity: number;
  nodeCount: number;
  organizations: {
    [organizationId: string]: {
      activeCount: number;
      limit: number;
    };
  };
}
