export enum CapacityReservationResult {
  SUCCESS = 'SUCCESS',
  ORGANIZATION_LIMIT_REACHED = 'ORGANIZATION_LIMIT_REACHED',
  GLOBAL_CAPACITY_REACHED = 'GLOBAL_CAPACITY_REACHED',
}

export interface CapacityReservation {
  result: CapacityReservationResult;
  organizationCount?: number;
  globalCount?: number;
}

export interface OrganizationCapacity {
  organizationId: string;
  limit: number;
  activeCount: number;
}
